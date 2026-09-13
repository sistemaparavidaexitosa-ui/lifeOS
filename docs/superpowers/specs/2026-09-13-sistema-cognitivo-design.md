# Sistema cognitivo — diseño (entiende, conecta, anticipa, ejecuta)

**Fecha:** 2026-09-13 · **Estado:** diseño aprobado. Cada fase lleva su plan en `docs/superpowers/plans/`.

## Contexto

LifeOS ya tiene las piezas de un motor de inteligencia, pero trabajan por separado:

- **Hechos:** 9 extractores puros (`src/lib/domain/insights/facts/`) y
  `validateAnchoring`, de modo que el modelo no inventa cifras.
- **Lectura de datos por la IA:** chat con herramientas sobre la lista blanca
  (`src/lib/ai/tools.ts`, `TABLAS_CONSULTABLES`).
- **Coach diario:** lo dispara pg_cron → `/api/push/dispatch` y deja propuestas
  (`coach_proposals`) que se ejecutan con Server Actions existentes
  (`ejecutar()` en `src/lib/coach/actions.ts:71`).
- **Planificación:** planes de proyecto con aprobación por casillas
  (`plan-project.ts` → `applyAiPlan` → `writeTemplate`).
- **Otros consumidores:** recomendaciones con su máquina de estados, memoria y
  automatizaciones por reglas.
- **Grafo:** registro declarativo, recorridos seguros (`graph_impact`,
  `graph_subgraph`) y una frontera de privacidad en una sola función.

**Nada de la IA lee el grafo.** Hoy los hechos son fotos sueltas: no hay cadenas
causales, ni pronósticos, ni trabajo de varios pasos, ni aprendizaje de lo que
funcionó. El plan de migración externo ampliaba la cobertura del grafo, pero no
añadía ninguna de esas capacidades.

**Objetivo:** cerrar un bucle cognitivo reutilizando esas piezas.

```
Percibir (hechos) → Conectar (grafo) → Anticipar (pronóstico)
      → Proponer (una sola cola) → Ejecutar (Server Actions existentes) → Aprender (resultado)
```

**Decisiones del usuario (2026-09-13):**
- **Autonomía:** «aprobar el plan, ejecutar todo». La IA arma trabajo de varios
  pasos, la persona lo aprueba una vez con casillas y el sistema lo ejecuta. Nada
  se aplica sin aprobación (se conserva D-089).
- **Orden:** Conecta → Anticipa → Ejecuta, y al final Aprende.

## Invariantes que ninguna fase rompe

1. **El modelo no calcula ni escribe.** Cita `factId` y propone. Cada escritura
   pasa por una Server Action existente con la sesión del usuario. El cron solo
   crea propuestas y notificaciones.
2. **`TABLAS_CONSULTABLES` sigue siendo la lista blanca**, y `profiles.ai_domains`
   sigue mandando. Un hecho que toque varios dominios exige que **todos** estén
   encendidos.
3. **La visibilidad del grafo sigue siendo solo `graph_nodo_visible` y
   `graph_misma_audiencia`** (BR-012 intacta). No se abre ninguna política de
   escritura: `origin = 'ai'` solo entra por una función que valida una propuesta
   aceptada.
4. **Se mantiene D-148:** los eventos no son nodos. La inteligencia temporal vive
   en los extractores, que ya leen `habit_logs`, `journal_entries`,
   `task_history`, `food_entries`…
5. **Un solo proveedor** (Gemini, D-087) y **cero dependencias npm nuevas**
   (D-008). Sin embeddings.
6. **Se extiende, no se sustituye.** Los nombres heredados se conservan (criterio
   de D-143): `coach_proposals` crece en vez de crear otra tabla.

---

## Fase C · Conecta (migración `0062`)

### C1. `graph_impact` utilizable desde el cron, sin abrirlo

El coach corre con `createAdminClient()`, sin sesión, y `graph_acceso_espacios()`
y `graph_acceso_proyectos()` leen `auth.uid()`.

- **Sobrecargas con uid explícito:** `graph_acceso_espacios(p_uid)` y
  `graph_acceso_proyectos(p_uid)`.
- **`graph_impact_de(p_uid, …)` con el cuerpo actual.** `graph_impact(…)` pasa a
  ser un envoltorio que llama a `graph_impact_de(auth.uid(), …)`, con la misma
  firma y los mismos mensajes. `graph_nodo_visible` ya recibe `p_uid` (0059).
- **Permisos:** `graph_impact_de` se revoca a `anon` y `authenticated` y se
  concede solo a `service_role`.
- **Prueba de equivalencia (técnica de D-146):** se captura la salida antes y
  después para dueña, miembro, invitada y extraña, y tiene que salir cero
  diferencias.

### C2. Hechos de cadena: el grafo entra en el contexto

- **Nuevo cargador** `src/lib/insights/graph-context.ts`:
  1. Toma los hechos de mayor peso y resuelve sus `refs` a nodos (`graph_node_of`
     o `nodeForEntity` en `src/lib/data/graph.ts`).
  2. Recorre `graph_impact` / `graph_impact_de` hacia arriba, con profundidad ≤ 4.
- **Nuevo extractor puro** `src/lib/domain/insights/facts/chains.ts`:
  - produce `chain.goal-at-risk.<goalId>` y `chain.blocks-many.<nodeId>`;
  - la etiqueta sigue el camino: «La tarea X, atrasada, bloquea el proyecto Y, que
    sostiene la meta Z»;
  - las `refs` incluyen todos los nodos del camino.
- **Dominio de cada nodo:** se deduce de `entity_table` a través de
  `TABLAS_CONSULTABLES`. Si falta algún dominio encendido, el hecho no se emite.
- **Prueba de coherencia:** una prueba unitaria exige que toda tabla de
  `graph_sources` (`catalog.generated.ts`) tenga entrada en
  `TABLAS_CONSULTABLES`.
- **Integración:** entra en `analyze`, `sendChatMessage` y el coach
  (`src/lib/coach/daily.ts`), a través de `loadFacts` y `FactsOverrides`.

### C3. Herramienta `explorar_grafo` para el chat

- Vive en `src/lib/ai/tools.ts`.
- **Argumentos:** `{consulta | entidad_id, direccion, profundidad ≤ 3}`.
- **Cómo lee:** `graph_search` más `graph_impact` / `graph_subgraph` con el cliente
  de sesión.
- **Qué devuelve:** nodos con id `nodo:<uuid>`, que se añaden a `entregados()`, y
  filtrados por `ai_domains`.
- El coach no la usa, igual que hoy no usa `sinConsultarFilas`.

### C4. Una sola cola de propuestas: `coach_proposals` crece

- **Columnas nuevas:**
  - `message_id` pasa a admitir nulos;
  - `origen` (coach | chat | analisis | grafo | mision);
  - `fact_ids text[]`;
  - `fingerprint` con índice único parcial, igual que `recommendations` (0027);
  - `mision_id` (nulo hasta la fase E);
  - `clave`, `depende_de text[]`;
  - `resultado jsonb`, con los ids creados o el motivo del fallo.
- **Estados:** `pending | aplicando | accepted | fallida | dismissed`.
- **Tipos nuevos:** `arista`, `recordatorio`, `habito`, `kr`, `proyecto`.
- **Carrera de dos clics:** hoy `acceptProposal` no es atómico, así que dos clics
  pueden crear la cosa dos veces. Se corrige reclamando la propuesta con
  `update … set status='aplicando' where id=… and status='pending' returning`.
- **Aceptar una arista:** `graph_aceptar_arista(p_proposal uuid)`, `security
  definer`:
  - comprueba que la propuesta es de `auth.uid()`, está pendiente y es de tipo
    `arista`;
  - comprueba que los dos nodos son visibles con `graph_nodo_visible`;
  - inserta `origin='ai'`, `created_by`, `confidence`, y el trigger de tenant hace
    cumplir BR-012.
  - La política `graph_edges_insert` no cambia.

### C5. Detectores del grafo: por fin, el agente `graph_suggestions`

- **`graph_detectar_de(p_uid)`** (solo `service_role`), en SQL determinista, busca
  cuatro patrones:
  - una meta que nada sostiene;
  - un hábito o rutina sin meta;
  - un proyecto personal sin meta;
  - posibles tareas duplicadas: similitud de trigramas > 0,8 dentro del mismo
    proyecto.
- **Cuándo corre:** en el paso del coach, dentro de `/api/push/dispatch`.
- **Papel del modelo:** solo nombra y prioriza candidatas que ya salieron de la
  consulta. Las relaciones permitidas son `supports`, `related_to` y `duplicates`.
- **Resultado:** propuestas `tipo='arista'`, `origen='grafo'`.
- **UI:** `src/components/AiChatRail.tsx` pinta el tipo `arista` y los enlaces
  «ver en el grafo» (`/graph?entity=`, con `ROUTE_TEMPLATES`). Eso cierra la tarea
  pendiente de los enlaces.

---

## Fase A · Anticipa (migración `0063`, casi toda en TypeScript)

### A1. `Fact` gana dos campos opcionales

- `kind?: 'estado'|'tendencia'|'pronostico'|'correlacion'` y
  `horizonte?: string` (fecha).
- Compatible hacia atrás: los extractores actuales no cambian.

### A2. Extractor puro `facts/forecast.ts`

Pronósticos:
- día en que se agota el presupuesto, según el ritmo de gasto;
- meta en riesgo, por el ritmo de los KR frente a la fecha objetivo;
- fecha objetivo de un proyecto frente a la velocidad (tareas cerradas por semana
  en `task_history` contra las pendientes);
- semana próxima saturada (`occupations` más vencimientos a 7 días).

Los pronósticos se **componen con C2**: un proyecto que no llega propaga el riesgo
a sus metas por la cadena.

### A3. Extractor puro `facts/correlations.ts`

- Construye series semanales cruzadas: adherencia a hábitos × tareas completadas ×
  gasto × registro de nutrición.
- Umbrales: al menos 6 semanas y |r| ≥ 0,5.
- La etiqueta habla de asociación, nunca de causa.
- Cada dominio tiene que estar encendido.

### A4. Carga

`facts-loader.ts` amplía las consultas de eventos que ya hace. Sin tablas nuevas.

### A5. Proactividad sobre el cron existente

- **Mensaje de la mañana:** el coach da prioridad a pronósticos y cadenas.
- **Alertas urgentes sin modelo:** un pronóstico con horizonte ≤ 48 h y peso alto
  genera `notifySystem` con la etiqueta determinista del hecho, con dedupe
  `anticipa:<factId>:<fecha>`.
- **Aprendizaje ligero:** las propuestas `dismissed` pasan a alimentar el contexto
  de rechazos, igual que las recomendaciones `Suppressed` y `Reported`.
- La migración solo añade el kind de notificación `anticipa` si hace falta.

---

## Fase E · Ejecuta: misiones (migración `0064`)

### E1. Tabla `missions` (privada del usuario)

- **Columnas:** `id`, `user_id`, `objetivo`, `resumen`, `fecha_objetivo`, `goal_id`
  opcional, `estado` (`borrador | aprobada | en_curso | completada | abandonada`),
  marcas de tiempo.
- **Nodo del grafo:** una fila en `graph_sources` (tipo `mission`, `user_row`,
  ruta `/intelligence/missions/{id}`) más `graph_install_source`.
- **Encaja con D-148:** una misión es algo a lo que la persona se refiere.

### E2. `src/lib/ai/plan-mission.ts`

Generaliza `plan-project.ts`.

- **Entrada:** objetivo, hechos globales ya filtrados por `ai_domains`, cadenas y
  pronósticos.
- **Salida:** un DAG de ≤ 25 pasos
  `{clave, tipo, payload, depende_de[], fact_ids[], porque}`. Un payload puede
  referenciar `ref:<clave>`.
- **Tipos de paso:** `tarea`, `proyecto`, `bloque`, `rutina`, `habito`, `meta`,
  `kr`, `recordatorio`, `arista`.
- **Validación:**
  - zod;
  - `sanearPropuesta` por tipo;
  - un DAG acíclico, con el puro `src/lib/domain/missions/dag.ts` (orden
    topológico y detección de ciclos);
  - `validateAnchoring`.
- **Modelos:** `models: ["gemini-3.6-flash", …]` primero, porque el plan es
  complejo, con un presupuesto `MISSION_BUDGET`.

### E3. Flujo

1. **`requestMission(objetivo, refinamiento?)`** crea la misión en `borrador` y
   las filas de `coach_proposals` con `mision_id`, `clave` y `depende_de`. No
   escribe nada de dominio.
2. **Revisión en `/intelligence/missions/[id]`:** árbol con casillas, como
   `AiPlanPanel.tsx`. Desmarcar un paso desmarca los que dependen de él, y se
   puede refinar con una nota.
3. **`applyMission(missionId, claves[])`** usa la sesión del usuario y recorre los
   pasos en orden topológico. Para cada paso:
   1. reclama la propuesta (`aplicando`);
   2. la vuelve a sanear;
   3. sustituye cada `ref:<clave>` por el id del `resultado` del paso del que
      depende;
   4. llama a `ejecutar()`, ampliado con estos casos:

      | tipo | acción que llama |
      |---|---|
      | `habito` | `upsertHabit` |
      | `kr` | `upsertKeyResult` |
      | `recordatorio` | `createReminder` |
      | `proyecto` | `createProject` y `writeTemplate` |
      | `arista` | `graph_aceptar_arista` |

   5. envuelve en try/catch las acciones que lanzan (`upsertRoutine`,
      `upsertPersonalGoal`) sin refactorizarlas.
   - **Si un paso falla:** queda `fallida` con su motivo, los que dependen de él
     se saltan y los independientes siguen.
   - **Reintento:** volver a llamar reanuda desde lo pendiente.
   - **Auditoría:** `ai.mission.apply`.
4. **Enlace al grafo:** cada entidad creada se une a la misión con
   `generated_by_ai`, una relación que ya existe en el catálogo. Si la frontera lo
   prohíbe (una tarea en un espacio compartido), se omite y se anota en
   `resultado`.
5. **Seguimiento:** el extractor puro `facts/missions.ts` mide el avance (tareas
   cerradas, adherencia de los hábitos creados, ritmo contra `fecha_objetivo`) y
   alimenta el coach y la anticipación. La vista `ai` de
   `src/lib/domain/graph/views.ts` muestra la misión con todo lo que creó.

---

## Fase L · Aprende (migración `0065`)

- **Línea base:** al aceptar una propuesta o misión, `coach_proposals.linea_base
  jsonb` guarda la etiqueta y el peso de los `fact_ids` citados.
- **Evaluación:** el puro `src/lib/domain/insights/outcomes.ts`, a los 7, 14 y 30
  días, compara si esos hechos desaparecieron, bajaron de peso o empeoraron.
  Emite `outcome.<proposalId>` («Aceptaste X hace 14 días; el presupuesto de
  Alimentos ya no se excede»).
- **Memoria:** los resultados repetidos (lo que funciona, lo que se rechaza
  siempre) generan propuestas de memoria `origin='ai'` por la vía de chat
  existente (`upsertMemoryItem`). Nunca se escriben solas.
- **Retrospectiva:** al completar o abandonar una misión, un resumen anclado.

---

## Documentación que acompaña a cada fase

- **`docs/DECISIONS.md`:**
  - D-150: el grafo es una herramienta y un contexto de la IA, no su única vía de
    recuperación.
  - D-151: una sola cola de propuestas.
  - D-152: las funciones `_de(p_uid)` solo para `service_role`.
  - D-153: una misión se aprueba una vez y se ejecuta por pasos.
  - D-154: los resultados se aprenden como hechos.
- **`docs/UNIVERSAL_GRAPH_ROADMAP.md`:** reescribir M6–M8 en esos términos, y
  retirar los embeddings y la fusión con `TABLAS_CONSULTABLES`.
- **`docs/SECURITY.md`:** una sección nueva «IA: datos, grafo y ejecución» con las
  invariantes 1–3.
- **Memoria:** actualizar `execution-graph-fases-pendientes`, porque el agente y
  los enlaces quedan cubiertos en C4 y C5.

## Riesgos principales

| Riesgo | Mitigación |
|---|---|
| `graph_impact_de` expuesto | Solo `service_role`. pgTAP de grants y de las cuatro audiencias. |
| Hechos de cadena que cruzan dominios apagados | Todos los dominios del camino tienen que estar encendidos. Pruebas unitarias. |
| Aplicación de varios pasos no atómica | Estado por paso, reclamo atómico, reanudación y `resultado` visible. |
| Calidad del modelo en planes complejos | DAG validado, saneo por tipo, ≤ 25 pasos, `gemini-3.6-flash` primero, refinar antes de aprobar. |
| Inyección de prompt desde títulos de terceros | Las cadenas solo recorren nodos visibles. El texto de terceros va delimitado, como hoy. El modelo solo propone. |
| Ruido de alertas | Umbral de peso más horizonte, dedupe diario y rechazos que retroalimentan. |

## Verificación

- **Por fase:**
  - `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`;
  - pruebas unitarias nuevas en `tests/domain/`: `chains`, `forecast`,
    `correlations`, `mission-dag`, `outcomes`, y coherencia registro ↔ lista
    blanca;
  - `pnpm db:test` con suites nuevas `supabase/tests/0033…` (grants de `_de`,
    equivalencia de `graph_impact`, `graph_aceptar_arista` rechazando propuestas
    ajenas o no pendientes y aristas que rompen BR-012, detectores sin fugas
    entre audiencias, `missions` en el grafo con su prueba de privacidad del
    registro).
- **Aviso:** `pnpm verify` termina en `supabase db reset` y borra la base local.
  Avisar antes de correrlo.
- **De punta a punta, en navegador con `pnpm build && pnpm start`** (`pnpm dev` no
  hidrata por la CSP):
  1. **C:** con una tarea atrasada en un proyecto personal que sostiene una meta,
     el chat explica la cadena citando `nodo:`. Aceptar una arista propuesta la
     dibuja con `origin='ai'` en `/graph`.
  2. **A:** con datos sembrados de gasto acelerado, el coach de la mañana anuncia
     la fecha en que se agota el presupuesto, y una alerta ≤ 48 h llega sin
     llamar al modelo.
  3. **E:** crear una misión («salir de la deuda X en 12 meses»), desmarcar un
     paso y aprobar. Se crean las entidades en orden, un paso forzado a fallar no
     bloquea a los independientes, y reintentar reanuda.
  4. **L:** adelantando la fecha de corte, aparece el hecho `outcome.*` de una
     propuesta aceptada.
