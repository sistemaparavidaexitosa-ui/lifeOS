# Intérprete del Centro (E1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Centro entienda sin modelo las peticiones de escribir y de navegar, pregunte «Entendí: …» siempre, y deje al modelo solo lo que pide criterio.

**Architecture:** Dos funciones puras: `analizar` (texto → operación, tabla, valores, menciones) y `resolverAnalisis` (análisis + catálogo + candidatos → `cambios | pregunta | navegar | ia`). Un orquestador de servidor carga el catálogo y busca filas con la RLS de la sesión, y entrega los `cambios` por `proponerCambios` con el MISMO contrato que el bloque `propuesta_cambio` del modelo, así hereda todas las barreras de D-203.

**Tech Stack:** TypeScript (Next.js 15, server actions), Supabase (RLS, RPC `buscar_en_todo`), `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-10-18-centro-interprete-design.md`

## Global Constraints

- Regla de oro: ante cualquier duda, `ia`. Nunca se adivina una tabla, una fila ni un valor obligatorio.
- El intérprete no llama nunca al modelo; nada se guarda sin pulsar Guardar.
- Imports de dominio con extensión `.ts` (los tests corren con strip-types); el dominio no importa nada de `server-only`.
- Tablas de E1: `tasks`, `notes`, `food_entries` (las de `ESCRITURA_POR_TABLA`) + navegación a `NAV_ITEMS` no ocultos.
- Texto de más de 300 caracteres → `ia`.
- `Sí, sigue:` y `No era eso` al inicio → `ia`.
- Copia al usuario en español, de tú, sin jerga.
- Comentarios con la densidad y el tono de `src/lib/domain/centro/escritura/*` (el porqué, en español).

## Review Focus

- «crea una tarea» sin título → no hay cambio con título vacío; `ia` (lo pinea Task 3).
- Un sinónimo que coincide dentro de otra palabra («nota» en «anotame») → no confunde la tabla; se busca por palabra completa (Task 2).
- «el lunes» dicho un lunes → el lunes SIGUIENTE, no hoy (Task 1).
- La búsqueda devuelve 5 tareas parecidas → `pregunta` con 3 como máximo, nunca la primera a ciegas (Task 3).
- Dominio apagado (`nutrition` fuera de `ai_domains`) → el intérprete no propone esa tabla; `ia` (Task 3, por `entradaDe`).

---

### Task 1: Normalizar y extraer valores

**Files:**
- Create: `src/lib/domain/centro/interprete/normalizar.ts`, `src/lib/domain/centro/interprete/valores.ts`
- Test: `tests/domain/centro-interprete-valores.test.ts`

**Interfaces:**
- Produces:
  - `normalizar(t: string): string`: minúsculas, NFD sin diacríticos, signos de puntuación (salvo `$ . , : / -` y dígitos) → espacio, espacios simples, `trim`.
  - `entreComillas(t: string): string | null`: primer texto entre `"…"`, `«…»` o `“…”`, sin normalizar.
  - `type Hallazgo<T> = { valor: T; frase: string }`, donde `frase` es el trozo NORMALIZADO que se consumió (para quitarlo del título).
  - `extraerFecha(n: string, hoy: string): Hallazgo<string> | null` (ISO `AAAA-MM-DD`).
  - `extraerNumero(n: string, unidades: readonly string[]): Hallazgo<number> | null`.
  - `extraerOpcion(n: string, sinonimos: Readonly<Record<string, readonly string[]>>): Hallazgo<string> | null`: por palabra completa; la frase más larga gana.

- [ ] **Step 1: Write the failing tests** (`hoy = "2026-10-18"`, que es sábado)

```ts
assert.equal(normalizar("¡Créa  una TAREA!"), "crea una tarea");
assert.equal(entreComillas('crea «Llamar a Juan» mañana'), "Llamar a Juan");
assert.deepEqual(extraerFecha("para manana", H), { valor: "2026-10-19", frase: "manana" });
assert.equal(extraerFecha("pasado manana", H)?.valor, "2026-10-20");
assert.equal(extraerFecha("ayer", H)?.valor, "2026-10-17");
assert.equal(extraerFecha("hoy", H)?.valor, "2026-10-18");
assert.equal(extraerFecha("el lunes", H)?.valor, "2026-10-20");
assert.equal(extraerFecha("el sabado", H)?.valor, "2026-10-25"); // hoy es sábado → el siguiente
assert.equal(extraerFecha("en 3 dias", H)?.valor, "2026-10-21");
assert.equal(extraerFecha("la proxima semana", H)?.valor, "2026-10-20"); // lunes que viene
assert.equal(extraerFecha("el 25", H)?.valor, "2026-10-25");
assert.equal(extraerFecha("el 5", H)?.valor, "2026-11-05"); // ya pasó este mes → el siguiente
assert.equal(extraerFecha("25 de diciembre", H)?.valor, "2026-12-25");
assert.equal(extraerFecha("2026-11-02", H)?.valor, "2026-11-02");
assert.equal(extraerFecha("el 31 de febrero", H), null);
assert.equal(extraerFecha("llamar a juan", H), null);
assert.deepEqual(extraerNumero("80 g de avena", ["g", "gr", "gramos"]), { valor: 80, frase: "80 g" });
assert.equal(extraerNumero("1,5 gramos", ["gramos"])?.valor, 1.5);
assert.equal(extraerNumero("avena", ["g"]), null);
const PRIO = { High: ["urgente", "alta prioridad", "prioridad alta", "alta"], Low: ["baja"] };
assert.equal(extraerOpcion("es urgente", PRIO)?.valor, "High");
assert.equal(extraerOpcion("prioridad alta ya", PRIO)?.frase, "prioridad alta");
assert.equal(extraerOpcion("altamente", PRIO), null); // palabra completa
```

- [ ] **Step 2: Run** `node --experimental-strip-types --test tests/domain/centro-interprete-valores.test.ts`. Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implement both files.** Fechas: aritmética en UTC sobre `hoy` (`new Date(hoy+"T00:00:00Z")`). Día de semana sin «el» también vale; el mismo día de la semana que hoy → +7. «el N» sin mes: este mes si `N >= día de hoy`, si no el siguiente, y se valida que la fecha exista.
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** `D-205: el intérprete del Centro lee fechas, números y opciones`.

### Task 2: Vocabulario en el registro y `analizar`

**Files:**
- Modify: `src/lib/domain/centro/escritura/registro.ts` (tipos + las 3 entradas)
- Create: `src/lib/domain/centro/interprete/vocabulario.ts`, `src/lib/domain/centro/interprete/analizar.ts`
- Test: `tests/domain/centro-interprete-analizar.test.ts`; extend `tests/domain/centro-escritura-registro.test.ts`

**Interfaces:**
- Registry gains: `EntradaDeEscritura.sinonimos: readonly string[]` (obligatorio), `CampoDeEscritura.sinonimos?: Readonly<Record<string, readonly string[]>>` (opción → palabras), `CampoDeEscritura.unidades?: readonly string[]`, `CampoDeEscritura.menciones?: readonly string[]` (para refs: `["en el proyecto", "en proyecto", "en"]`).
  - tasks: `["tarea", "tareas", "pendiente", "to do", "todo"]`; priority `{High: [urgente, alta, prioridad alta, importante], Medium: [media, prioridad media, normal], Low: [baja, prioridad baja]}`; status `{Completed: [hecha, hecho, completada, terminada, lista], InProgress: [en progreso, empezada, en curso], Blocked: [bloqueada], Cancelled: [cancelada], Pending: [pendiente]}`; est `unidades: ["min", "minutos"]`; project_id `menciones: ["en el proyecto", "al proyecto", "en proyecto", "del proyecto"]`.
  - notes: `["nota", "notas", "idea", "apunte"]`; notebook_id `menciones: ["en el cuaderno", "en cuaderno", "al cuaderno", "en la libreta", "en notebook"]`.
  - food_entries: `["comida", "comidas", "alimento"]`; meal `{Desayuno: [desayuno, desayune], Almuerzo: [almuerzo, almorce, comida del mediodia], Cena: [cena, cene], Snack: [snack, colacion, merienda]}`; grams `unidades: ["g", "gr", "gramos"]`.
- `vocabulario.ts` produces:
  - `VERBOS: Record<Operacion, readonly string[]>`, `VERBOS_DE_TABLA: Record<string, { operacion: Operacion; tabla: TablaEscribible; campos?: Record<string, string> }>` (`comi, desayune, almorce, cene` → crear food_entries con su `meal`; `completa, termina, termine` → editar tasks con `status: Completed`).
  - `pideCriterio(n: string): boolean`: empieza por o contiene, como palabra, `por que, como voy, cuanto, cuanta, cuantos, analiza, recomienda, recomiendame, consejo, deberia, opinas, resume, resumen, compara, planea, plan para, estrategia, ayudame a pensar, que hago`, o termina en `?` (en el texto sin normalizar).
  - `destinoDe(n: string): { href: string; etiqueta: string } | null`: solo si empieza por `abre, abrir, ve a, ir a, llevame a, muestrame, ensename, navega a`; el resto se compara con `label` normalizado de `NAV_ITEMS` no ocultos y con alias fijos (`dinero/gastos → /money`, `presupuesto → /money/budget`, `habitos/rutinas → /development/routines`, `metas → /development/goals`, `libros/biblioteca → /development/library`, `nutricion/comidas → /development/nutrition`, `proyectos/tareas → /execution`, `deudas → /debt`, `ahorros → /savings`, `inversiones → /investments`, `configuracion/ajustes → /settings`, `cuadernos/notas → /notebooks`). Más de un destino posible → `null`.
- `analizar.ts` produces:

```ts
export type Analisis =
  | { tipo: "ia"; motivo: string }
  | { tipo: "navegar"; destino: { href: string; etiqueta: string } }
  | {
      tipo: "escribir";
      operacion: Operacion;
      tabla: TablaEscribible;
      valores: Record<string, Valor>;          // opciones, fechas, números ya extraídos
      menciones: Record<string, string>;       // campo ref → nombre dicho («Rediseño»)
      resto: string;                           // título al crear / término de búsqueda al editar o borrar
      textoOriginal: string;
    };
export function analizar(texto: string, hoy: string): Analisis;
```

Orden: tope 300 / `Sí, sigue` / `No era eso` → `ia`; `pideCriterio` → `ia`; `destinoDe` → `navegar`; verbo (lista o `VERBOS_DE_TABLA`) + UNA tabla por sinónimo (palabra completa) → `escribir`; si no, `ia`. Quitar del `resto`, en este orden: frase de la mención de ref (mención + nombre hasta el siguiente valor o el final), frases de valores, verbo, sinónimo de tabla, conectores al borde (`una, un, la, el, de, que, para, a, :`). Título entre comillas → `resto` = comillas literal. Fecha → al primer campo `fecha` de la operación; número → al campo cuyas `unidades` coincidan.

- [ ] **Step 1: Failing tests** (H = `"2026-10-18"`):

```ts
const a = analizar("Crea una tarea llamar a Juan mañana en el proyecto Rediseño, urgente", H);
assert.deepEqual(a, { tipo: "escribir", operacion: "crear", tabla: "tasks",
  valores: { due: "2026-10-19", priority: "High" }, menciones: { project_id: "rediseno" },
  resto: "llamar a juan", textoOriginal: "Crea una tarea llamar a Juan mañana en el proyecto Rediseño, urgente" });
assert.equal(analizar('anota «Comprar café» en el cuaderno Ideas', H).tipo, "ia"); // verbo sin sinónimo de tabla: el cuaderno es destino, no tabla
assert.deepEqual(pick(analizar("nueva nota: reunión con Ana en el cuaderno Trabajo", H)), { tabla: "notes", resto: "reunion con ana", menciones: { notebook_id: "trabajo" } });
assert.deepEqual(pick(analizar("desayuné 80 g de avena", H)), { tabla: "food_entries", operacion: "crear", valores: { meal: "Desayuno", grams: 80, local_date: undefined }, resto: "avena" });
assert.deepEqual(pick(analizar("marca como hecha la tarea llamar a Juan", H)), { operacion: "editar", tabla: "tasks", valores: { status: "Completed" }, resto: "llamar a juan" });
assert.deepEqual(pick(analizar("borra la nota reunión con Ana", H)), { operacion: "borrar", tabla: "notes", resto: "reunion con ana" });
assert.equal(analizar("¿cómo voy con mis gastos?", H).tipo, "ia");
assert.equal(analizar("recomiéndame qué leer", H).tipo, "ia");
assert.equal(analizar("Sí, sigue: crear la tarea X", H).tipo, "ia");
assert.equal(analizar("x".repeat(301), H).tipo, "ia");
assert.equal(analizar("hola", H).tipo, "ia");
assert.equal(analizar("crea algo", H).tipo, "ia"); // verbo sin tabla
assert.deepEqual(analizar("llévame a presupuesto", H), { tipo: "navegar", destino: { href: "/money/budget", etiqueta: "Presupuesto" } });
assert.equal(analizar("anótame que tengo que llamar", H).tipo, "ia"); // «nota» dentro de «anotame» no es la tabla
```
(`pick` = helper local que compara solo esas claves.)

Registry test addition: every entry has ≥1 `sinonimos`; no normalized sinónimo appears in two tables; every `opcion` field with `sinonimos` maps only to values in its `opciones`.

- [ ] **Step 2: Run** `node --experimental-strip-types --test tests/domain/centro-interprete-analizar.test.ts tests/domain/centro-escritura-registro.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** registry additions, `vocabulario.ts`, `analizar.ts`.
- [ ] **Step 4: Run** same + `pnpm typecheck`. Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `D-205: el intérprete reconoce verbo, tabla y valores sin modelo`.

### Task 3: `resolverAnalisis` y la frase «Entendí»

**Files:**
- Create: `src/lib/domain/centro/interprete/resolver.ts`
- Test: `tests/domain/centro-interprete-resolver.test.ts`

**Interfaces:**
- Consumes: `Analisis` (Task 2), `entradaDe`, `camposDe` (registro), `validarCambio` (cambio.ts), `Domain`.
- Produces:

```ts
export interface Opcion { id: string; nombre: string }          // id = uuid
export interface ContextoDeResolucion {
  autorizados: readonly Domain[];
  /** Por tabla de ref (`projects`, `notebooks`): lo que la persona tiene, más reciente primero. */
  catalogo: Record<string, Opcion[]>;
  /** Para editar/borrar: filas de `analisis.tabla` que coinciden con `resto`, mejor primero, ya registradas. */
  candidatos: { fila: string; nombre: string; exacta: boolean }[];   // fila = `fila:<tabla>:<uuid>`
  /** `foods` de la persona que coinciden con `resto` (crear food_entries). */
  alimentos: { nombre: string; kcal100: number; protein100: number; carbs100: number; fat100: number }[];
  hoy: string;
}
export type Interpretacion =
  | { tipo: "ia"; motivo: string }
  | { tipo: "navegar"; destino: { href: string; etiqueta: string } }
  | { tipo: "pregunta"; entendi: string; opciones: { etiqueta: string; texto: string }[] }   // 1–3
  | { tipo: "nada"; entendi: string }        // buscó y no encontró: «No encontré ninguna tarea que se llame «…»»
  | { tipo: "cambios"; entendi: string; cambios: unknown[] };  // contrato del bloque propuesta_cambio
export function resolverAnalisis(a: Analisis, ctx: ContextoDeResolucion): Interpretacion;
```

Reglas: `entradaDe(tabla, autorizados)` null → `ia`. Crear: ref sin mención y catálogo de 1 → esa; sin mención y >1 → `pregunta` con las 3 primeras (`texto` = `textoOriginal + " en el proyecto|cuaderno <nombre>"`, usando la primera de `menciones`); con mención → la opción cuyo nombre normalizado empieza por/contiene la mención; 0 → `nada`; >1 → `pregunta`. Título = `resto` (o, si vacío y hay comillas, ya venía en `resto`); título vacío en obligatorio → `ia`. food_entries: sin alimento coincidente → `ia` (los macros son trabajo de la IA); `local_date` por defecto `hoy`. Editar/borrar: 0 candidatos → `nada`; 1, o la primera `exacta` y la segunda no → esa; si no → `pregunta` con 3 (`texto` = `textoOriginal` con `resto` sustituido por el nombre entre comillas). Editar sin ningún valor → `ia`. El cambio armado se pasa por `validarCambio` con un `filas` construido de catálogo + candidatos; si no valida → `ia` con el motivo.

`entendi` (frase, ≤ 300): `Crear la tarea «Llamar a Juan» en Rediseño · vence 19 oct · prioridad alta` / `Marcar como completada la tarea «Llamar a Juan»` / `Borrar la nota «Reunión con Ana»`. Formato de fecha `d MMM` en es-MX.

- [ ] **Step 1: Failing tests**, al menos: crear tarea con mención única → `cambios` cuyo `cambios[0]` pasa `validarCambio` y lleva `project_id: "fila:projects:<P>"`, `title: "llamar a juan"` (título conserva lo dicho, sin mayúscula forzada—usar `textoOriginal` para recuperar las mayúsculas originales: espera `"Llamar a Juan"`); sin mención con 2 proyectos → `pregunta` de 2 opciones; con 5 candidatos → `pregunta` de 3; 0 candidatos → `nada` con `entendi` que contiene `«llamar a juan»`; dominio `nutrition` no autorizado → `ia`; food sin alimento → `ia`; food con alimento «Avena» → campos con `kcal100` del catálogo y `local_date: "2026-10-18"`; editar status → `{operacion:"editar", fila, campos:{status:"Completed"}}`; `entendi` exacto de la tarea del ejemplo.
- [ ] **Step 2: Run** `node --experimental-strip-types --test tests/domain/centro-interprete-resolver.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.** Recuperar mayúsculas del título: buscar en `textoOriginal`, sin acentos/mayúsculas, la posición del `resto` normalizado y devolver ese tramo del original.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `D-205: del análisis a cambios, pregunta o IA, con la frase «Entendí»`.

### Task 4: Contrato de las secciones

**Files:**
- Modify: `src/lib/domain/centro/runtime/secciones.ts` (`DatosPropuestaCambio`, `DatosConfirmarEntendimiento`), `src/lib/domain/centro/runtime/validador.ts`, `src/lib/domain/centro/escritura/tarjeta.ts` (`seccionDeCambios`), `src/lib/centro/escritura/proponer.ts`
- Test: extend `tests/domain/centro-runtime-validador.test.ts`, `tests/domain/centro-escritura-tarjeta.test.ts`

**Interfaces:**
- `DatosPropuestaCambio` gains `entendi?: string` (≤300), `textoOriginal?: string` (≤2000), `sinIA?: boolean`.
- `DatosConfirmarEntendimiento` gains `textoSeguir?: string` (≤2000) and `modoSeguir?: "ia"`.
- `seccionDeCambios(id, items, filas, extra?: { entendi: string; textoOriginal: string; sinIA: true })`.
- `proponerCambios(b, id, cerebro, filas, cupo, extra?)` pasa `extra` a `seccionDeCambios`.

- [ ] **Step 1: Failing tests:** el validador acepta `propuestaCambio` con los 3 campos nuevos y rechaza `entendi` de 301; acepta `confirmarEntendimiento` con `textoSeguir`/`modoSeguir: "ia"` y rechaza `modoSeguir: "auto"`; `seccionDeCambios(..., extra)` los copia.
- [ ] **Step 2: Run** `node --experimental-strip-types --test tests/domain/centro-runtime-validador.test.ts tests/domain/centro-escritura-tarjeta.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** + `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** `D-205: la tarjeta de cambios puede decir qué entendió y si fue sin IA`.

### Task 5: Orquestador de servidor y turno

**Files:**
- Create: `src/lib/centro/interprete/interpretar.ts`
- Modify: `src/lib/centro/agente/pensar.ts`, `src/app/api/centro/turno/route.ts`

**Interfaces:**
- Produces: `interpretarTurno(texto: string, cerebro: Cerebro): Promise<{ texto: string; secciones: AnySection[] } | null>`; `null` = que siga la IA. NUNCA LANZA (try/catch → `null` + `console.warn("[centro-interprete] …")`).
- `pensarTurno(input: { texto; historial; modo?: "auto" | "ia" })`; la ruta acepta `modo: z.enum(["auto","ia"]).default("auto")`.

Pasos de `interpretarTurno`: `analizar` → `ia` = `null`. `navegar` → sección `irA`. `escribir` → catálogo de la ref de la tabla (`projects` id,title por `updated_at desc` límite 20; `notebooks` id,title por `updated_at desc` límite 20), candidatos (editar/borrar: `buscar_en_todo` con `p_tablas: [tabla]`, `p_limite: 5` si la tabla está en `TABLAS_DE_BUSQUEDA`; si no, `from(tabla).select(tablaConsultable(...).select).ilike(<titulo>, "%resto%").order(fecha desc).limit(5)`; filas traídas con el `select` de `tablaConsultable` y `registrarFilas` en un `Map` propio; `exacta` = nombre normalizado === resto), alimentos (food_entries crear: `foods` por nombre `ilike`, límite 3) → `resolverAnalisis`. Salidas: `cambios` → `proponerCambios({cambios}, "i0", cerebro, filas, {restantes: MAX_CAMBIOS_POR_TURNO}, {entendi, textoOriginal, sinIA: true})`; si devuelve 0 secciones → `null`. Texto del turno: `"¿Lo entendí bien? Revísalo y pulsa Guardar."`. `pregunta` → `confirmarEntendimiento` con `entendi`, `seguir` = etiqueta de la primera opción, `textoSeguir` = su texto, `alternativas` = las demás. `nada` → `confirmarEntendimiento` con `entendi`, `seguir: "Pregúntale a la IA"`, `textoSeguir: textoOriginal`, `modoSeguir: "ia"`, sin alternativas. Auditoría con `after`: `audit_log` `ai.centro_interprete` `{ salida, tabla, operacion }`.

En `pensarTurno`, justo después de `prepararCerebro`: `if (input.modo !== "ia") { const i = await interpretarTurno(input.texto, cerebro); if (i) return { id, ...i }; }`.

- [ ] **Step 1:** Implement `interpretar.ts` and the two modifications.
- [ ] **Step 2: Run** `pnpm typecheck && pnpm lint && pnpm test:unit`. Expected: 0 errors, todos los tests verdes.
- [ ] **Step 3: Commit** `D-205: el turno del Centro pasa primero por el intérprete`.

### Task 6: Cliente — tarjeta «Entendí», «No es esto» a la IA, modo en `enviar`

**Files:**
- Modify: `src/components/centro-runtime/contexto.tsx` (`enviar?: (texto: string, modo?: "ia") => void`), `src/components/centro-agente/CentroAgente.tsx` (`enviar(texto, modo)` manda `modo` en el body), `src/components/centro-runtime/secciones/PropuestaCambio.tsx`, `src/components/centro-runtime/secciones/ConfirmarEntendimiento.tsx`, `src/app/globals.css` o el CSS del agente (clase `ag-sin-ia`).

Comportamiento: con `data.entendi`, la tarjeta abre con `<p><span className="ag-muted">Entendí: </span>{entendi}</p>` y, con `sinIA`, una marca `<span className="ag-sin-ia">sin IA</span>`. «No es esto» con `textoOriginal` → descarta con `malentendido` y `enviar(textoOriginal, "ia")`; sin él, lo de hoy. `ConfirmarEntendimiento`: el botón principal manda `textoSeguir ?? \`Sí, sigue: ${entendi}\`` con `modoSeguir`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Run** `pnpm typecheck && pnpm lint`. Expected: 0 errors.
- [ ] **Step 3: Browser check** (memoria: `pnpm build && pnpm start`, Chromium local, base local con `AGENTIC_CENTER_RUNTIME=1`): «crea una tarea llamar a Juan mañana» → tarjeta «Entendí …» con «sin IA» → Guardar → «Guardado ✓» y la tarea existe; «llévame a presupuesto» → botón; «No es esto» → turno de IA (en local, la disculpa).
- [ ] **Step 4: Commit** `D-205: la tarjeta dice qué entendió, y «No es esto» se lo pasa a la IA`.

### Task 7: D-205 y memoria

**Files:**
- Modify: `docs/DECISIONS.md` (entrada D-205, mismo estilo que D-204)

- [ ] **Step 1:** Escribir D-205: intérprete sin modelo antes de la IA; regla de oro; mismo contrato que `propuesta_cambio`; retro en `ai.centro_interprete`; E2/E3 pendientes.
- [ ] **Step 2: Run** `pnpm test:unit`. Expected: PASS.
- [ ] **Step 3: Commit** `D-205 en DECISIONS`.
