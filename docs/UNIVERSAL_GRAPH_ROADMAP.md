# UNIVERSAL GRAPH — hoja de ruta

> **Estado al 12-sep-2026.** Los milestones 1, 2 y 3 están implementados
> (migraciones `0057_registro_del_grafo.sql`, `0058_aristas_declarativas.sql` y
> `0059_un_solo_predicado_de_permiso.sql`, con las pruebas `0028`, `0029` y
> `0030` en `supabase/tests/`). Los milestones 4 a 8 son diseño acordado, no
> código. Este documento es el
> plan de implementación; `docs/DECISIONS.md` (D-138…D-141) guarda las
> decisiones ya tomadas y `docs/CHECKS.md` lo que se ejecutó de verdad.

---

## 1. Por qué este documento existe

El encargo pedía convertir el Execution Graph en el cimiento de un grafo de
conocimiento universal: el grafo como infraestructura y no como módulo, las
tablas de negocio como fuente de verdad, el grafo como capa de proyección,
relaciones dirigidas por metadatos, y preparación para búsqueda semántica,
recuperación para IA, análisis de dependencias e impacto, recomendadores,
*embeddings* futuros y analítica de grafos.

La primera conclusión de leer el repositorio es incómoda y hay que decirla
antes que nada: **la mitad de eso ya está construido**, y la otra mitad no
estaba donde el encargo suponía.

D-119 decidió en la migración 0054 exactamente el modelo pedido — las tablas de
dominio siguen siendo la fuente de verdad y el grafo es una proyección
mantenida por triggers — y lo descartó todo lo contrario («todo vive en
`graph_nodes` con metadatos jsonb») con razones que siguen siendo válidas.
Rehacerlo habría sido reescribir lo que funciona.

La extensibilidad tampoco estaba donde parecía. `graph_project_user_row` y
`graph_project_ws_row` ya son funciones **genéricas**, parametrizadas por los
argumentos del trigger: proyectar una tabla privada nueva es una sola sentencia
`create trigger`. Y los tipos de nodo y de relación ya son **tablas de
catálogo** con metadatos por tipo, no enums — «un catálogo crece con un INSERT
mientras que un CHECK crece con una migración», dice el comentario de 0054.

Lo que falta es otra cosa, y este documento trata de eso.

---

## 2. Arquitectura actual

### 2.1 Las tablas

Cinco, creadas en `0054_execution_graph.sql` y afinadas por `0055` y `0056`:

| Tabla | Qué guarda |
|---|---|
| `graph_node_types` | catálogo de 18 tipos de nodo, con `label`, `color`, `is_projected` |
| `graph_rel_types` | catálogo de 14 relaciones, con `is_dependency`, `reversed`, `is_symmetric` |
| `graph_nodes` | los nodos: `scope`, `workspace_id`/`user_id`/`project_id`, `entity_table`/`entity_id`, `label`, `metadata jsonb` |
| `graph_edges` | las aristas: PK `(source_id, rel_type, target_id)`, sin columna `id`, con `origin ∈ (user, system, ai)` |
| `graph_layouts` | las posiciones, `(node_id, user_id, view)` — fuera del nodo a propósito (D-122) |

### 2.2 La proyección

**Push, por triggers.** 37 triggers sobre 14 tablas de negocio, agrupados no por
tabla sino **por de dónde sale el dueño**, que es el eje real:

| Forma | Función | Tablas |
|---|---|---|
| `user_id` en la fila | `graph_project_user_row` (genérica) | `personal_goals`, `habits`, `routines`, `books`, `investments`, `budgets`, `assets` |
| `workspace_id` en la fila | `graph_project_ws_row` (genérica) | `workspaces`, `projects`, `memberships` |
| un salto al proyecto | `graph_project_task` | `tasks` — función propia, sin `to_jsonb`: es la tabla que más se escribe |
| dos o tres saltos | `graph_project_note`, `graph_project_task_file` | `notes`, `task_files` |
| con filtro de fila | `graph_project_decision` | `logbook` donde `type = 'decision'` |

Más siete funciones de arista (`graph_edges_task`, `graph_edges_project`,
`graph_edges_habit`, `graph_edges_note`, `graph_edges_task_file`,
`graph_edges_assignee`, `graph_edges_key_result`) que mantienen once relaciones
del dominio como aristas `origin = 'system'`. **Desde 0058 su cuerpo lo genera
`graph_edges_ddl()` a partir de `graph_edge_rules`**; conservan los nombres de
0054 para que los triggers no haya que tocarlos.

Tres detalles del mecanismo que no son opcionales y que cualquier cambio tiene
que conservar:

- **`update of <columnas>` en cada trigger.** Se evalúa una vez por sentencia
  contra la lista del `SET`, así que el reordenado masivo del tablero (0021)
  no llega a tocar ninguna fila del grafo.
- **`on conflict (entity_id) where entity_id is not null`** con un `where … is
  distinct from` en el `do update`: un guardado que no cambia nada no reescribe
  la fila ni invalida la entrada del índice de trigramas.
- **El DELETE va aparte**, como trigger de sentencia con tabla de transición:
  borrar un proyecto de 5.000 tareas dispararía si no 5.000 triggers de fila.

### 2.3 La frontera de privacidad

`graph_nodes` es la primera tabla del sistema donde conviven una fila de Money
OS y una de un proyecto compartido, así que el control que `docs/SECURITY.md`
declaraba —«ninguna tabla mezcla los dos mundos»— dejó de aplicarse. Se
sustituyó por tres capas (D-120), y la regla se afinó en 0055 (D-129): **dos
nodos se pueden unir si los ve exactamente la misma persona.** La condición vive
en una sola función, `graph_misma_audiencia` (D-131).

Nada de lo que viene en esta hoja de ruta toca esa función.

### 2.4 El recorrido

`graph_impact`, `graph_subgraph`, `graph_all`, `graph_edges_of`,
`graph_search`, `graph_check_integrity`. Las que caminan son `security definer`
con `row_security = off`, así que la RLS no las protege: las protege el código
de dentro, con dos conjuntos de permiso precalculados (espacios donde se es
miembro no-Guest, y proyectos compartidos de un Guest) y el filtro aplicado
**en cada salto**, no al hidratar.

### 2.5 Lo que de verdad falta

**a) El registro no existía como dato.** Qué se proyecta y cómo solo se sabía
leyendo los `create trigger` del final de 0054. La base no podía contestar «¿qué
entidades de LifeOS son nodos?». De ahí salían tres costes que ya se pagaban:
la lista blanca de metadatos escrita dos veces por tabla (en el argumento del
trigger y en el `SELECT` del backfill, con una prueba pgTAP dedicada a vigilar
que no divergieran); ninguna forma de detectar deriva; y añadir una entidad
tocando tres sitios del SQL.

**b) El vocabulario está escrito cuatro veces.** Los 18 tipos de nodo viven en
el catálogo SQL, en la unión `GraphNodeType` (`src/lib/domain/graph/types.ts`),
en `NODE_STYLES` (`theme.ts`) y en `PLURAL` (`cluster.ts`). Las 14 relaciones,
tres veces más `EDGE_STYLES`. `graph_rel_types.is_dependency` está
reimplementado como un `Set` en `impact.ts`, y `graph_node_types.color` está
duplicado como `colorVar` — **la columna de la base no la lee nadie**. Coinciden
por suerte, no por construcción.

**c) Hay tres «proyecciones universales» disjuntas.** Este es el hallazgo que
cambia la forma del encargo:

| | Mecanismo | Cobertura | Alcance |
|---|---|---|---|
| `search_workspace` (0039) | `UNION ALL` sobre cinco `tsvector` generados | 5 tipos | solo espacio |
| `TABLAS_CONSULTABLES` (`src/lib/insights/context.ts`) | constante de TypeScript | 44 tablas, 8 dominios | por usuario, con interruptor |
| `graph_nodes` (0054) | 37 triggers, filas materializadas | 14 tipos proyectados | ambos ámbitos |

Se mantienen por separado y no se conocen: nada en `src/lib/ai/` ni en
`src/lib/search/` menciona `graph_*`. Son tres descripciones de «qué es una
entidad en LifeOS» envejeciendo cada una por su lado.

**d) El predicado de permiso está copiado siete veces** entre `graph_impact`,
`graph_subgraph`, `graph_edges_of` y `graph_all`. Es el control que separa a un
Guest del espacio entero: la clase de código que no puede vivir por duplicado.
*(Resuelto en M3 — `0059`.)*

---

## 3. Arquitectura propuesta

> **El Grafo Universal no es un motor nuevo. Es el registro único de entidades
> del que leen el grafo, el buscador y la IA.**

Cuatro capas, de las que tres ya existían:

| Capa | Qué es | Estado |
|---|---|---|
| 0 · **Catálogo** | `graph_node_types`, `graph_rel_types` — el vocabulario, con metadatos por tipo | existía |
| 1 · **Registro** | `graph_sources`, `graph_edge_rules` — cómo una tabla de negocio se convierte en nodos y aristas | **M1, hecho** |
| 2 · **Núcleo** | proyectores genéricos, `graph_system_edges`, RPC de recorrido, frontera de privacidad | existía; M1 le añadió instalador, backfill y detección de deriva derivados de la capa 1 |
| 3 · **Consumidores** | el lienzo (existe); recuperación de IA, buscador y analítica (M6, M7) | uno de tres |

### 3.1 La decisión que lo sostiene

**El SQL dinámico corre en tiempo de DDL, nunca por fila.**
`graph_install_source()` valida la declaración contra `information_schema` y
emite un `create trigger` estático con `format('%I')`. El cuerpo que se ejecuta
en cada `UPDATE` sigue siendo el mismo plpgsql compilado de 0054, con su plan en
caché. Es exactamente la objeción que D-119 dejó escrita contra «una función
genérica con `execute format`, que es un intérprete de SQL dentro de un
trigger»: aquí no hay intérprete en el camino caliente.

### 3.2 El backfill deja de ser una segunda definición

0054 reconstruía los nodos con catorce `INSERT … SELECT` escritos a mano que
repetían la lista blanca que ya estaba en el argumento del trigger. Dos
definiciones de lo mismo, y una prueba pgTAP dedicada a vigilar que no
divergieran.

`graph_backfill_source()` no tiene segunda definición: **vuelve a disparar la
primera.** `update <tabla> set <etiqueta> = <etiqueta>` entra en la lista del
`update of` —lo garantiza el CHECK `graph_sources_etiqueta_vigilada`—, así que
corre el proyector con su propio código, y el `where … is distinct from` del
`on conflict` hace que las filas que ya estaban bien no se reescriban. No puede
divergir de la proyección porque *es* la proyección.

### 3.3 Preparación para lo que viene

Lo que el diseño deja listo sin implementarlo:

- **Búsqueda semántica y *embeddings*** — `search_text` y `content_hash` en
  `graph_nodes` (M6). El `content_hash` es lo que hace barato a M8: sin él, el
  día que haya *embeddings* hay que recalcularlo todo en cada pasada para saber
  qué cambió.
- **Recuperación para IA** — `graph_context()` (M6), un punto único que sustituye
  a `TABLAS_CONSULTABLES` como descripción de qué entidades existen.
- **Análisis de dependencias e impacto** — ya existe (`graph_impact`), y se
  amplía solo con cobertura.
- **Recomendadores** — el contrato de `graph_suggestions` quedó fijado en 0054 y
  sigue sin implementar; con `graph_edge_rules` los detectores deterministas
  pasan a poder escribirse sobre el registro en vez de tabla a tabla.
- **Analítica de grafos** — M7, sobre el grafo ya materializado.

**No se implementan *embeddings* ni se declara `pgvector`.**

---

## 4. Estrategia de migración

Un milestone, una migración, un despliegue. Cada uno deja el repositorio
desplegable y cada uno tiene su propia reversión.

### M1 · El registro — **hecho** (`0057`)

`graph_sources` (14 filas) y `graph_edge_rules` (11 filas), con el contrato de
catálogo de 0054: lectura para `authenticated`, escritura cerrada con `REVOKE`.
Más seis funciones: `graph_registry_validar`, `graph_registry_args`,
`graph_registry_ddl`, `graph_install_source`, `graph_registry_diff`,
`graph_registry_deriva` y `graph_backfill_source`.

**No cambia el comportamiento de nada.** La migración **no recrea ningún
trigger: los compara.** `create trigger` sobre `tasks` exige `ACCESS EXCLUSIVE`
y un bloqueo pendiente encola detrás a todos los lectores nuevos — el riesgo que
0054 documentó y contuvo con `lock_timeout`. Volver a crear treinta y siete
triggers para dejarlos idénticos habría sido pagar una ventana de bloqueo en
producción a cambio de nada. Comparar demuestra lo mismo y no toca una fila.

Elimina: la divergencia backfill↔trigger. Deja: la deriva como consulta.

### M2 · Aristas declarativas — **hecho** (`0058`)

El cuerpo de las siete funciones lo genera `graph_edges_ddl()` a partir de las
once reglas. Los cuatro `column_kind` cubren todos los casos vivos, incluido el
más irregular —`task_assignees`, donde la arista va de la TAREA a la persona y
la persona es la fila de `memberships` de ESE espacio—, resuelto con
`lookup_scope_column` en vez de dejándolo escrito a mano.

Un hallazgo que simplificó el modelo: `polymorphic` no necesita resolverse de
forma distinta a `scalar_fk`. `graph_node_of()` busca por `entity_id`, que es
único en todo el sistema, así que resolver el nodo de un uuid **no requiere
saber de qué tabla salió** — y `key_results.source_id`, que apunta a cinco
tablas sin FK, se trata como cualquier otra columna.

Se añaden `graph_edges_expected()` —el conjunto de aristas que las reglas
derivan de los datos— y `graph_edges_deriva()`, que es a las aristas lo que
`graph_registry_diff()` es a los triggers. Y `graph_backfill_edges()`, que
completa a `graph_backfill_source()` de 0057.

**No se tocó ningún trigger.** `create or replace function` conserva el oid, así
que se sustituye el cuerpo sin pedir ACCESS EXCLUSIVE sobre `tasks` ni sobre
nada (D-143). Eso también hace la reversión trivial: volver a ejecutar los
`create or replace` originales de 0054/0056, que siguen literales en esos
archivos.

Elimina: las siete funciones escritas a mano. Deja: una relación nueva es una
fila, que es el prerrequisito de M5.

### M3 · Un solo predicado de permiso — **hecho** (`0059`)

Las siete copias de la condición que decide quién ve qué nodo pasan a
`graph_nodo_visible()`, y el precómputo de los dos conjuntos —copiado cuatro
veces— a `graph_acceso_espacios()` y `graph_acceso_proyectos()`.

Los cuerpos de las cuatro RPC se generaron **transformando** los que había
—sustituyendo el precómputo y el predicado y nada más—, no reescribiéndolos:
ni una firma, ni un mensaje de error, ni un `set`, ni un orden de salida
cambian.

`graph_nodo_visible` es `sql` + `immutable`, **sin `security definer` y sin
`strict`**, y eso no es estilo: son las cuatro propiedades que permiten al
planificador sustituir la llamada por su cuerpo. Se comprobó con `explain` que
se embebe —el `Filter` enseña la expresión expandida— y se comprobó también el
caso contrario: añadiéndole `security definer`, el `Filter` pasa a enseñar la
llamada opaca y `graph_all` perdería `idx_graph_nodes_ws` sin que nada fallara.
Dos assertions de `0030` vigilan esas propiedades.

La equivalencia se demostró capturando la salida de las cuatro RPC para cuatro
niveles de acceso (dueña, miembro, invitada y extraña) antes y después: 44
observaciones por fase, cero diferencias.

Elimina: seis copias del predicado y tres del precómputo. Es el último milestone
que sustituye código vivo; M4 a M7 son aditivos.

### M4 · Un solo vocabulario — siguiente

`scripts/gen-graph-catalog.ts` lee `graph_node_types` y `graph_rel_types` de la
base y escribe `src/lib/domain/graph/catalog.generated.ts`, junto a
`pnpm gen:types`. Desaparecen: la unión `GraphNodeType` escrita a mano, los
colores duplicados en `NODE_STYLES`, el `Set` de `impact.ts` que reimplementa
`is_dependency`, y `TIPOS_NATIVOS` que reimplementa `is_projected`.

Se añade `route_template` a `graph_sources` — la pantalla donde vive cada
entidad—, que hoy es un `Record` incompleto en `NodeInspector.tsx` (le faltan
`task_files` y `logbook`, así que los nodos de tipo Documento y Decisión no
tienen enlace a «abrir donde vive»). Con la ruta en el registro, los enlaces
«ver en el grafo» pendientes desde 0054 salen de la misma fila.

**Cero dependencias npm nuevas.** D-008 intacto.

### M5 · Cobertura: dinero, tiempo y conocimiento

Con M1 a M4 puestos, esto es una migración de filas de registro. Candidatas por
orden de valor —tienen `id uuid` y `user_id`, así que pasan el validador—:
`debts`, `savings_goals`, `financial_goals`, `accounts`, `liabilities`,
`occupations`, `daily_plans`, `knowledge_items`, `memory_items`,
`family_members`, y con `workspace_id`: `notebooks`, `folders`.

Más filas nuevas en `graph_node_types`, que es un INSERT.

Lo que desbloquea: «¿qué proyecto me está costando dinero?», «¿qué hábito
sostiene esta meta y cuánto tiempo le dedico?». Hoy son incontestables porque
las entidades no están en el mismo grafo.

### M6 · Superficie de recuperación

`graph_nodes.search_text` y `content_hash`, mantenidos por el mismo proyector a
partir de un `search_fields` nuevo del registro. Un RPC `graph_context()` para
la IA. Y `TABLAS_CONSULTABLES` pasa a leer del registro, con una prueba unitaria
que falla si las dos descripciones dejan de coincidir.

Aquí es donde las tres proyecciones universales se vuelven una. **Es el
milestone con más superficie de privacidad del plan** y necesita su propia
revisión: el filtro de dominios de `src/lib/insights/context.ts` es hoy un solo
archivo auditable de una sentada, y esa propiedad no se puede perder.

`search_text` **no es un `tsvector`**: D-118 rechazó a conciencia un quinto
índice de texto sobre los mismos títulos, y esa decisión sigue en pie. Es texto
plano, para que un futuro proceso de *embeddings* tenga una sola columna que
leer.

### M7 · Analítica

`graph_degree()`, `graph_stats()` sobre el grafo ya materializado: nodos más
conectados, componentes, huérfanos, cuellos de botella. Alimenta los detectores
deterministas que el contrato de `graph_suggestions` espera.

### M8 · *Embeddings* — **no se implementa**

La costura queda documentada y ninguna línea escrita:
`graph_node_embeddings(node_id, model, embedding, content_hash)`, poblada por un
proceso externo que lee los nodos cuyo `content_hash` cambió desde la última
pasada. Requiere declarar `pgvector`, que sería la segunda extensión del
repositorio, y una decisión de producto sobre qué proveedor calcula los
vectores y qué sale del sistema para ello — la misma conversación que
`docs/SECURITY.md` ya tiene abierta sobre la IA.

---

## 5. Riesgos

| # | Riesgo | Mitigación | Estado |
|---|---|---|---|
| 1 | **La frontera de privacidad al ampliar cobertura (M5).** Proyectar Money OS mete más filas privadas en la única tabla donde conviven los dos mundos. | `scope` es columna obligatoria del registro, y la assertion nº 10 de `0028` recorre `graph_sources` en vez de enumerar tablas: **una fuente nueva nace con su prueba de privacidad puesta**. `graph_misma_audiencia` no se toca. | mitigado en M1 |
| 2 | **Amplificación de escritura.** Más triggers sobre más tablas. | `watch_columns` es `not null` y el CHECK rechaza la lista vacía: ninguna fuente puede nacer con un trigger que se dispare en cada `UPDATE`. El `where … is distinct from` sigue cortando el no-op. | mitigado en M1 |
| 3 | **SQL dinámico.** | `format('%I')` en todo identificador, validación contra `information_schema` antes de emitir, `EXECUTE` revocado de `anon` y `authenticated`, y solo se invoca desde migraciones. | mitigado en M1 |
| 4 | **Crecimiento de `graph_nodes`.** El objetivo de D-117 son 100.000 nodos. | `enabled` por fuente permite apagar una sin migración. M5 mide el conteo antes y después. | pendiente de M5 |
| 5 | **Deriva entre registro y triggers.** | `graph_registry_diff()` y la assertion nº 1 de `0028`, que corre en CI en cada PR. | mitigado en M1 |
| 5b | **Deriva entre las reglas de arista y las aristas vivas.** | `graph_edges_deriva()` compara el conjunto que las reglas derivan contra el que hay, y la assertion nº 1 de `0029` lo exige vacío en cada PR. Además, la nº 2 comprueba que las siete funciones sigan siendo generadas y nadie las haya editado a mano. | mitigado en M2 |
| 6 | **Pérdida de auditabilidad del filtro de IA (M6).** Hoy el filtro de dominios cabe en un archivo. | M6 no fusiona sin conservar esa propiedad; se revisa aparte antes de implementarlo. | abierto |
| 7 | **El backfill reescribe tablas enteras.** `update … set etiqueta = etiqueta` toca todas las filas y recalcula los `tsvector` generados de 0039. | Es coste de mantenimiento, no de operación normal. En tablas grandes, por lotes y con `lock_timeout`. Documentado en la propia función. | aceptado |

---

## 6. Reversión

**M1 es reversible sin tocar nada vivo**, y es consecuencia del diseño y no una
promesa: como la migración compara los triggers en vez de recrearlos, el grafo
no depende del registro para funcionar. Revertir es soltar dos tablas y siete
funciones; los 37 triggers de 0054/0056 siguen exactamente donde estaban. Cero
pérdida de datos y cero ventana de inconsistencia. El bloque literal está al pie
de `0057_registro_del_grafo.sql`.

De M2 en adelante cada migración lleva su bloque de reversión comentado al pie.
**M2 también es reversible sin tocar tablas**: las siete funciones conservan
nombre y firma, los triggers no se movieron, y revertir es volver a ejecutar sus
`create or replace function` originales, que siguen literales en 0054 §10 y
0056 §2. Ese procedimiento se ejecutó de verdad durante el desarrollo —las siete
funciones volvieron a su longitud original byte a byte— así que no es una
promesa sin probar. M3 es el último que sustituye código vivo; M4 a M7 son
aditivos.

---

## 7. Impacto estimado

**M1, medido:**

- Dos tablas de catálogo, 25 filas en total. Sin índices nuevos más allá de las
  claves primarias.
- Siete funciones. Ninguna en el camino caliente: la más cara
  (`graph_registry_deriva`) hace dos conteos por fuente y está pensada para
  operación y CI, no para una petición de usuario.
- **Cero cambios en `src/`.** Ni una línea de `src/components/graph/`, ni de
  `src/lib/data/graph.ts`, ni de las Server Actions. `database.types.ts` se
  regenera y crece con las dos tablas y las funciones nuevas.
- Cero dependencias npm nuevas. Cero extensiones de Postgres nuevas.
- 18 assertions pgTAP nuevas, sobre las 52 ya existentes.

**M2, medido:**

- Cuatro columnas nuevas en `graph_edge_rules` y dos CHECK. Ninguna tabla nueva.
- Seis funciones. Las siete de arista pasan a tener cuerpo generado; **ningún
  trigger se tocó**, así que la migración no pidió un solo bloqueo de tabla.
- **Cero cambios en `src/`** otra vez: solo `database.types.ts` regenerado.
- 21 assertions pgTAP nuevas. El total del repositorio pasa de 246 a 267.
- La equivalencia se demostró dos veces: la migración exige que las reglas
  deriven exactamente las aristas vivas ANTES de sustituir nada, y sobre un
  juego de datos que toca las once relaciones se reconstruyeron todas las
  aristas con las funciones generadas — 28 aristas, cero diferencias en las
  siete columnas, en los dos sentidos.

**M3, medido:**

- Tres funciones nuevas, cuatro recreadas. Ninguna tabla, ningún trigger,
  ninguna fila.
- El predicado pasa de 7 copias a 1, y el precómputo de 4 a 1.
- **Cero cambios en `src/`**: otra vez solo `database.types.ts`.
- 17 assertions pgTAP nuevas, específicamente sobre la frontera de la invitada a
  través de las CUATRO funciones — `graph_subgraph`, `graph_all` y
  `graph_edges_of` apenas estaban cubiertas, y son las que la pantalla usa por
  debajo. El total del repositorio pasa de 267 a 284.

**Del plan completo, estimado:**

- `graph_nodes` pasaría de 14 a ~26 tipos de entidad proyectados en M5. Con los
  volúmenes de una persona real eso es del orden de miles de nodos, no de
  cientos de miles: el techo de 100.000 de D-117 sigue lejos.
- Ya desaparecieron: siete funciones de arista a medida (M2) y seis copias del
  predicado de permiso más tres del precómputo (M3). Quedan por desaparecer
  cuatro copias del vocabulario de tipos y dos reimplementaciones de metadatos
  del catálogo (M4).
- La amplificación de escritura crece en las tablas que se añadan, y en ninguna
  de las que ya se escriben mucho: `tasks` y `projects` ya están proyectadas y
  M5 no las toca.

---

## 8. Qué leer antes de tocar esto

- `docs/DECISIONS.md`, D-117 a D-137 para el módulo del grafo, y D-138 a D-141
  para el registro.
- `docs/SECURITY.md`, la sección «El grafo y la frontera de privacidad».
- `supabase/migrations/0054_execution_graph.sql`, que lleva el razonamiento
  completo del diseño original en sus comentarios.
- `supabase/tests/0025_rls_grafo.sql`, `0026`, `0027` y `0028`: son la
  especificación ejecutable de lo que no se puede romper.
