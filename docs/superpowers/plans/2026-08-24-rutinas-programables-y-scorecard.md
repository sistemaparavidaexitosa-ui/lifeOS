# Rutinas programables y scorecard de desarrollo personal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una rutina se elija de una plantilla o se construya desde cero, se asigne a días concretos de la semana, aparezca como bloque real en Autogestión del Tiempo —editable desde ahí, con la rutina enterándose—, y que cada día que tocaba quede confirmado por el usuario para alimentar un scorecard que responde si la rutina se está siguiendo o no.

**Architecture:** Toda la aritmética vive en funciones puras bajo `src/lib/domain/` (`time.ts` para la aplicabilidad por día, `development/*` para rutinas, estado y scorecard), probadas con `node --test`. La sincronización entre rutina y bloque es un par de *mappers puros* —nunca dos Server Actions llamándose entre sí—, para que no exista un ciclo de escritura. Las páginas son Server Components que calculan "hoy" una vez y lo pasan como prop.

**Tech Stack:** Next.js 15.5 (App Router, Server Actions), React 19, Supabase (Postgres + RLS), zod 3.25, Tailwind 3.4, `node --test` con `--experimental-strip-types`, pgTAP.

**Spec:** `docs/superpowers/specs/2026-08-22-personal-development-os-design.md` (§3.3, §4.2 — este plan los extiende; ver "Desviaciones respecto del spec" abajo)

---

## Decisiones tomadas antes de escribir este plan

| Decisión | Elección | Razón |
|---|---|---|
| Días de la semana | **Columna `occupations.days`** | Si viven solo en la rutina, `/time` no puede pintarlos sin conocer el módulo de desarrollo. Puesto ahí, `/time` gana la función que hoy le falta y la rutina solo la usa. |
| Nombre y convención | **`days`, con 0=domingo … 6=sábado** | **La columna ya existía en producción**, creada a mano sin migración, con su check y un dato real (`{0,1,3}`). Se adopta tal cual en vez de imponer `days`/ISO: cero rename, cero conversión de datos, y 0–6 es lo que `Date.getUTCDay()` devuelve, así que el predicado no necesita traducción. |
| `frequency` de rutina | **Reemplazada por `days`** | Los cuatro valores son subconjuntos de un set de días. Mantener ambos sería dos fuentes de verdad para la misma pregunta. Los presets sobreviven como botones. |
| `habits.frequency` | **No se toca** | Fuera de alcance. La divergencia queda anotada en `DECISIONS.md`, para que no parezca descuido. |
| Programación automática | **No existe** | El usuario confirma siempre. Sin cron, sin materialización nocturna, sin escrituras en render. |
| Desenlaces | **Tres: `Completada` / `Sin oportunidad` / `Omitida`** | "Parcial" es derivable de los pasos marcados; los otros tres no. La distinción "no pude" vs. "no quise" es la única razón de preguntar. |
| Bloque proyectado | **Editable desde `/time`, con escritura de vuelta** | Decisión explícita del usuario, en contra de la recomendación inicial de solo lectura. El riesgo de ciclo se contiene con mappers puros (Task 5). |
| Notificaciones | **Solo en la app (capa A)** | Un banner y una bandeja de pendientes. Sin `pg_cron`, sin correo, sin Web Push, sin `routine_nudges`: esa tabla solo servía para no duplicar envíos que aquí no ocurren. |
| Denominador del scorecard | **Se calcula desde `days`, no se lee de filas** | Un día que el usuario nunca abrió la app no tiene fila. Si el denominador saliera de filas, ese día desaparecería del score en vez de contar como pendiente. |

**Consecuencia aceptada de la escritura bidireccional:** mover el bloque a 45 min cuando los pasos suman 60 escribe `duration_min_override = 45` y `routineFitsBlock` empieza a reportar "no cabe". Es correcto: el usuario dijo que ese bloque dura 45 minutos, y el sistema se lo señala en vez de contradecirlo en silencio.

**Consecuencia aceptada de la capa A:** un aviso que solo existe al abrir la app no alcanza al usuario a las 6 a.m. Lo que sí entrega es la bandeja de pendientes, que recoge hacia atrás todo lo no confirmado, y el scorecard completo.

---

## Desviaciones respecto del spec

Registrar en `docs/DECISIONS.md` como **D-027**:

1. El spec (§4.2) da a `routines` una columna `frequency` con los cuatro valores de `habits`. Este plan la sustituye por `days smallint[]` (0=domingo … 6=sábado). Motivo: el requisito de asignar a días concretos, y la convención la fija `occupations.days`, que ya existía en producción.
2. El spec deja el horario íntegramente en `occupations` sin que nada lo escriba desde fuera. Este plan hace que la rutina **proyecte y mantenga** su ocupación. La propiedad del dato sigue en `occupations`; lo que se agrega es un escritor más, identificado por `occupations.source = 'routine'`.
3. `routine_steps.duration_min` pasa a ser nullable. El spec la fijó `not null default 5`; el usuario pidió duración aproximada **o ninguna**.

---

## Global Constraints

Aplican a **todas** las tareas. No se repiten en cada una.

- **Privacidad (BR-012/019/027):** ninguna tabla nueva o columna nueva lleva `workspace_id` ni referencia `has_project_access`. `occupations` ya es privada por `user_id` y así se queda.
- **GRANT explícito (F9 🔴):** cada migración incluye su bloque `grant`. Las columnas añadidas a tablas existentes heredan los grants de su tabla (precedente `0017`, `0026`) — anotarlo en el comentario de la migración.
- **Fechas (D-016/D-018):** nunca `new Date()` para obtener "hoy". Siempre `todayLocal(await getUserTimeZone())`, calculado en el Server Component y pasado como prop. **Ninguna función de dominio llama al reloj**: `now` y `today` se inyectan por parámetro.
- **Dependencias (D-008 🔴):** cero paquetes npm nuevos.
- **Imports de dominio:** con extensión `.ts` explícita, porque los tests corren con `--experimental-strip-types`.
- **Tests unitarios en `tests/domain/` plano.** El glob de `package.json` no entra a subdirectorios; un test en `tests/domain/development/` no se ejecutaría nunca.
- **Server Actions:** patrón de `src/app/(app)/development/routines/actions.ts` — `"use server"`, zod, `supabase.auth.getUser()`, `revalidatePath` al final.
- **Errores legibles:** las acciones nuevas **devuelven `{ ok, reason }`, no lanzan** (contrato de `sendEmail()`, spec §5.5). En producción Next redacta el mensaje de una excepción y el usuario recibe una pared opaca — es exactamente el bug que hoy tiene el guardado de la biblioteca.
- **Verificación por tarea:** `pnpm typecheck && pnpm lint && pnpm test:unit` en verde antes de cada commit.

## Prerrequisito — RESUELTO el 2026-08-25

- [x] **Sincronizar el esquema de producción.**

Producción estaba en `0020`, no en `0027`: faltaban seis migraciones, incluida `0024`, o sea que **todo el Personal Development OS no existía en producción**. El guardado de la biblioteca fallando por `books.cover_url` era un síntoma entre varios. Aplicadas con `supabase db push` (`0021`, `0022`, `0024`–`0027`), todas aditivas, sin pérdida de datos.

Al comparar esquemas apareció la deriva en el sentido contrario: **`occupations.days` existía en producción sin migración que la creara**, hecha a mano desde el dashboard, con check constraint y un valor real capturado. La resolvió `0028_occupation_days.sql` adoptándola tal cual (ver la tabla de decisiones). Local y producción ahora coinciden en las 26 migraciones.

---

### Task 1: días de la semana en las ocupaciones

Aislada a propósito: toca `/time` y `/home`, nada de rutinas. Si algo se mueve en Autogestión del Tiempo, se sabe que fue esto.

**Files:**
- ~~Create: `supabase/migrations/0028_occupation_days.sql`~~ **hecho**
- ~~Create: `supabase/tests/0009_occupation_days.sql`~~ **hecho**
- Modify: `src/lib/domain/time.ts`, `tests/domain/time.test.ts`
- Modify: `src/lib/data/home.ts:95`, `src/app/(app)/time/{page.tsx:64,WeekView.tsx:83,OccupationForm.tsx,actions.ts}`
- ~~Modify: `src/types/database.types.ts` (regenerado)~~ **hecho**

**Interfaces:**
- Produces: `occupationAppliesOn(occ, dateISO): boolean` en `src/lib/domain/time.ts`.

- [x] **Steps 1–3: migración y test pgTAP — COMPLETADOS el 2026-08-25**

`0028_occupation_days.sql` y `supabase/tests/0009_occupation_days.sql` están escritos, probados en local (65 assertions pgTAP en verde) y **aplicados en producción**.

Dos cosas que la ejecución enseñó y que el plan no preveía:

1. **La columna ya existía en producción** con la convención JS (0=domingo … 6=sábado) y un dato real. La migración la adopta en vez de imponer `days`/ISO. El plan original iba a crear una segunda columna para el mismo concepto.
2. **`array_length('{}', 1)` devuelve `NULL`, no `0`, y un `CHECK` que evalúa a `NULL` PASA.** La primera versión del constraint dejaba colar el arreglo vacío; lo destapó el test 4. La versión aplicada lleva `coalesce(array_length(days,1), 0)`.

El test pgTAP quedó como `0009_` porque `0008_` ya lo ocupaba `0008_rls_intelligence.sql`.

- [ ] **Step 4: Escribir `occupationAppliesOn` — un solo predicado, no tres**

En `src/lib/domain/time.ts`. Hoy el filtro está copiado en tres archivos; se centraliza aquí para que la regla exista una sola vez.

```ts
export interface OccurrenceLike {
  recurring: boolean;
  occDate: string | null;
  days: number[];
}

/**
 * `days` usa la convención de `Date.getUTCDay()`: 0 = domingo … 6 = sábado.
 * Por eso NO hay conversión aquí — es exactamente el valor que devuelve el
 * reloj. Fue la razón de adoptar la columna que ya existía en producción en
 * vez de imponer ISO-8601, que habría obligado a traducir en cada lectura.
 */
export function occupationAppliesOn(occ: OccurrenceLike, dateISO: string): boolean {
  if (!occ.recurring) return occ.occDate === dateISO;
  return occ.days.includes(new Date(`${dateISO}T00:00:00Z`).getUTCDay());
}
```

Tests en `tests/domain/time.test.ts` (2026-08-24 es lunes, 2026-08-30 es domingo):
- `{1,2,3,4,5}` (lun–vie) aplica el lunes 24 y **no** el domingo 30.
- `{0}` aplica el domingo 30: el domingo es 0, no 7.
- `{6}` aplica el sábado 29 y no el domingo 30 — el borde donde se equivoca quien piense en ISO.
- Los siete días aplican cualquier fecha: el comportamiento previo se conserva.
- No recurrente aplica solo si `occDate` coincide exactamente, sin mirar `days`.

- [ ] **Step 5: Reemplazar los tres filtros**

| Archivo | Antes | Después |
|---|---|---|
| `src/lib/data/home.ts:95` | `.filter((o) => o.recurring \|\| o.occ_date === t0)` | `.filter((o) => occupationAppliesOn({ recurring: o.recurring, occDate: o.occ_date, days: o.days }, t0))` |
| `src/app/(app)/time/page.tsx:64` | `.filter((o) => o.recurring \|\| o.date === todayISO)` | idem con `todayISO` |
| `src/app/(app)/time/WeekView.tsx:83` | `.filter((o) => o.recurring \|\| o.date === d)` | idem con `d` |

`WeekView` y `page.tsx` mapean la fila a un tipo local; añadir `days` a esos mapeos y a las interfaces `OccLite` correspondientes.

- [ ] **Step 6: Selector de días en el formulario**

En `OccupationForm.tsx`, cuando `recurring` está marcado, mostrar siete casillas `L M X J V S D` (hoy ese caso solo dice *"ignorado: se repite todos los días"*). Cuatro presets que solo marcan casillas: **Todos**, **Entre semana**, **Fin de semana**, **Ninguno**. Al menos un día debe quedar marcado — el `check` de la base lo exige y el formulario debe impedirlo antes, no dejar que reviente el insert.

En `actions.ts`, `occupationSchema` gana `days: z.array(z.coerce.number().int().min(0).max(6)).min(1).default([0,1,2,3,4,5,6])`, leído con `formData.getAll("days")`. Ojo con el rango: **0 a 6**, no 1 a 7.

Actualizar la leyenda de `WeekView.tsx:137`: las recurrentes ya no "se repiten todos los días", se repiten **en los días marcados**.

- [ ] **Step 7: Verificar**

```bash
supabase db reset && supabase test db && pnpm gen:types:local && pnpm typecheck && pnpm lint && pnpm test:unit
```

- [ ] **Step 8: Verificar en la app real**

```bash
pnpm dev
```

En `/time`: una ocupación recurrente **existente** debe seguir apareciendo en los siete días de `WeekView` (la migración es neutra). Crear una nueva marcada solo L-X-V: debe aparecer en tres columnas y **no** en las otras cuatro. En `/home`, "Tu tiempo hoy" debe contarla solo si hoy es uno de esos días.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Repetir una ocupación en los días que elijas, no siempre en los siete

recurring=true significaba los siete días y no había forma de decir
lunes, miércoles y viernes. La columna days llega con los siete por
default, así que ninguna ocupación existente cambia de comportamiento.

El predicado vivía copiado en tres archivos; ahora es occupationAppliesOn
en el dominio, con test propio para el borde del domingo."
```

---

### Task 2: `0029` — columnas de rutina programable y desenlace

**Files:**
- Create: `supabase/migrations/0029_routine_scheduling.sql`
- Create: `supabase/tests/0010_routine_scheduling.sql`
- Modify: `src/types/database.types.ts` (regenerado)

- [ ] **Step 1: Escribir el test pgTAP primero**

`supabase/tests/0010_routine_scheduling.sql`, 5 assertions:

1. `routine_steps.duration_min` acepta `null` (paso sin estimar).
2. `duration_min = 0` sigue rechazado (`23514`): sin estimar es `null`, no cero.
3. Una rutina preexistente con `frequency = 'Entre semana'` queda con `days = {1,2,3,4,5}` tras el backfill (lunes a viernes: en la convención 0–6 coinciden con ISO, pero el fin de semana **no**).
4. `routine_runs.outcome` rechaza `'Parcial'` (`23514`) — los desenlaces son exactamente tres.
5. Borrar la ocupación deja `routines.occupation_id` en null y la rutina viva (BR-026 sigue en pie).

- [ ] **Step 2: Correr el test y verificar que falla**

- [ ] **Step 3: Escribir la migración**

```sql
-- 0029_routine_scheduling.sql
-- Rutinas programables: días concretos, hora de inicio, duración opcional por
-- paso, y el desenlace confirmado del día.
--
-- BR-012/019/027: sin cambios de privacidad. Las columnas heredan las
-- políticas y grants de sus tablas (0024_personal_development.sql).

-- ---------------------------------------------------------------------------
-- Días y horario de la rutina
-- ---------------------------------------------------------------------------
alter table public.routines
  add column if not exists days smallint[] not null default '{0,1,2,3,4,5,6}',
  add column if not exists start_time time,
  add column if not exists duration_min_override integer;

alter table public.routines
  add constraint routines_days_check
    check (coalesce(array_length(days, 1), 0) between 1 and 7
           and days <@ array[0,1,2,3,4,5,6]::smallint[]),
  add constraint routines_duration_override_check
    check (duration_min_override is null or duration_min_override > 0);

-- Backfill desde frequency: los cuatro valores de Fase 1 son subconjuntos de
-- un set de días. Nada se pierde.
update public.routines set days = case frequency
  when 'Diario'        then '{0,1,2,3,4,5,6}'::smallint[]
  when 'Entre semana'  then '{1,2,3,4,5}'::smallint[]
  when 'Fin de semana' then '{0,6}'::smallint[]   -- domingo=0 y sábado=6, NO {6,7}
  when 'Semanal'       then '{1}'::smallint[]     -- anclada al lunes, como routineDueToday
  else '{0,1,2,3,4,5,6}'::smallint[]
end;

-- `frequency` se CONSERVA sin uso durante esta migración y se elimina en una
-- posterior, cuando ningún deploy anterior pueda seguir leyéndola. Borrarla
-- aquí rompería la versión que aún esté sirviendo tráfico durante el deploy.
comment on column public.routines.frequency is
  'OBSOLETA desde 0029: sustituida por days. Se conserva por compatibilidad de deploy y se elimina en una migración posterior. No leer.';
comment on column public.routines.days is
  '0=domingo … 6=sábado, la convención de Date.getUTCDay(). MISMA que occupations.days: una sola forma de decir "qué día" en todo el proyecto.';
comment on column public.routines.duration_min_override is
  'Duración explícita del bloque. Si es null, la duración es la suma de los pasos estimados. Se escribe sola cuando el usuario redimensiona el bloque desde /time.';

-- ---------------------------------------------------------------------------
-- Duración opcional por paso
-- ---------------------------------------------------------------------------
alter table public.routine_steps alter column duration_min drop not null;
alter table public.routine_steps alter column duration_min drop default;
alter table public.routine_steps drop constraint if exists routine_steps_duration_min_check;
alter table public.routine_steps
  add constraint routine_steps_duration_min_check
    check (duration_min is null or duration_min > 0);

comment on column public.routine_steps.duration_min is
  'null = sin estimar, a propósito (flexibilidad). Cero NO es válido: un paso de cero minutos no existe, y confundirlo con "sin estimar" haría que las sumas mintieran.';

-- ---------------------------------------------------------------------------
-- Desenlace confirmado del día
-- ---------------------------------------------------------------------------
alter table public.routine_runs
  add column if not exists outcome text,
  add column if not exists outcome_at timestamptz,
  add column if not exists outcome_note text not null default '';

alter table public.routine_runs
  add constraint routine_runs_outcome_check
    check (outcome is null or outcome in ('Completada','Sin oportunidad','Omitida'));

comment on column public.routine_runs.outcome is
  'Tres valores, no cuatro: "Parcial" es derivable de completed_step_ids y no se pregunta. "Sin oportunidad" NO es lo mismo que "Omitida" — mezclarlas castigaría igual al día que te enfermaste y al día que decidiste no hacerlo, y el score dejaría de significar algo.';

create index if not exists idx_routine_runs_outcome on public.routine_runs(routine_id, outcome);
```

- [ ] **Step 4: Correr el test, regenerar tipos, commitear**

```bash
supabase db reset && supabase test db && pnpm gen:types:local && pnpm typecheck
git add supabase/migrations/0029_routine_scheduling.sql supabase/tests/0010_routine_scheduling.sql src/types/database.types.ts
git commit -m "Dar a la rutina días, hora y desenlace confirmado

days sustituye a frequency con backfill sin pérdida; frequency se
conserva sin uso hasta una migración posterior para no romper el deploy en
curso. duration_min pasa a nullable: un paso puede no tener estimación, pero
cero sigue prohibido para que las sumas no mientan."
```

---

### Task 3: Dominio de rutinas — días, duración incierta y el fin del booleano mentiroso

**Files:**
- Modify: `src/lib/domain/development/routines.ts`
- Modify: `tests/domain/development-routines.test.ts`

**Interfaces:**
- Cambia: `StepLike.durationMin: number | null`; `routineDueToday(days: number[], dateISO: string)`; `routineProgress` devuelve además `untimedRemaining`; `routineFitsBlock` devuelve `BlockFit`, ya no `boolean`; `routineAdherence` recibe `days`.
- Produces: `routineDuration(steps): { min: number; untimed: number }`, `type BlockFit = "cabe" | "no cabe" | "indeterminado"`.

- [ ] **Step 1: Actualizar los tests primero**

Los tests de Fase 1 que pasan `frequency` cambian a `days` (mismo caso, otra entrada). Los nuevos:

```ts
test("routineDuration: suma los estimados y cuenta los que no lo están", () => {
  const steps = [{ id: "s1", durationMin: 10 }, { id: "s2", durationMin: null }, { id: "s3", durationMin: 5 }];
  assert.deepStrictEqual(routineDuration(steps), { min: 15, untimed: 1 });
});

test("routineProgress: los pasos sin estimar se cuentan aparte, no como cero", () => {
  const steps = [{ id: "s1", durationMin: 10 }, { id: "s2", durationMin: null }];
  const r = routineProgress([], steps);
  assert.strictEqual(r.remainingMin, 10);
  assert.strictEqual(r.untimedRemaining, 1);
});

test("routineFitsBlock: con un paso sin estimar la respuesta es indeterminado, no 'cabe'", () => {
  const steps = [{ id: "s1", durationMin: 20 }, { id: "s2", durationMin: null }];
  assert.strictEqual(routineFitsBlock(steps, { start: "06:00", end: "07:00" }), "indeterminado");
});

test("routineFitsBlock: si lo ya estimado NO cabe, sobra saber el resto", () => {
  // 70 min estimados en un bloque de 60: el paso sin estimar no puede salvarlo.
  const steps = [{ id: "s1", durationMin: 70 }, { id: "s2", durationMin: null }];
  assert.strictEqual(routineFitsBlock(steps, { start: "06:00", end: "07:00" }), "no cabe");
});

test("routineDueToday: days decide, y el domingo es 0", () => {
  assert.strictEqual(routineDueToday([1,2,3,4,5], "2026-08-30"), false); // domingo
  assert.strictEqual(routineDueToday([0], "2026-08-30"), true);
  assert.strictEqual(routineDueToday([7], "2026-08-30"), false);  // el 7 no existe aquí
});
```

El cuarto test es el que importa: `"indeterminado"` no puede ser la respuesta perezosa para todo lo que tenga un paso sin estimar. Si lo conocido ya rebasa el bloque, la respuesta es firme.

- [ ] **Step 2: Correr los tests y verificar que fallan**

- [ ] **Step 3: Implementar**

```ts
export type BlockFit = "cabe" | "no cabe" | "indeterminado";

export function routineDuration(steps: StepLike[]): { min: number; untimed: number } {
  return {
    min: steps.reduce((sum, s) => sum + (s.durationMin ?? 0), 0),
    untimed: steps.filter((s) => s.durationMin === null).length
  };
}

export function routineDueToday(days: number[], dateISO: string): boolean {
  // Sin conversión: `days` ya está en la convención que devuelve getUTCDay().
  return days.includes(new Date(`${dateISO}T00:00:00Z`).getUTCDay());
}

/**
 * Tres estados, no un booleano. Con un paso sin estimar no se puede AFIRMAR
 * que la rutina cabe — pero si lo ya estimado rebasa el bloque, lo que falta
 * por estimar no puede rescatarla, y ahí la respuesta sí es firme.
 */
export function routineFitsBlock(steps: StepLike[], block: { start: string; end: string } | null): BlockFit {
  if (block === null) return "cabe";
  const { min, untimed } = routineDuration(steps);
  const capacity = toMinutes(block.end) - toMinutes(block.start);
  if (min > capacity) return "no cabe";
  return untimed > 0 ? "indeterminado" : "cabe";
}
```

`routineDueToday` importa `isoWeekday` de `../time.ts`: una sola definición de "qué día es" en todo el proyecto.

- [ ] **Step 4: Ajustar los consumidores**

`src/app/(app)/development/routines/page.tsx` usa hoy `routineFitsBlock` como booleano. Pasa a tres ramas: `"no cabe"` → chip `warn` "No cabe en el bloque"; `"indeterminado"` → chip neutro "Duración incierta"; `"cabe"` → sin chip. El progreso muestra `"quedan 20 min + 2 pasos sin estimar"` cuando `untimedRemaining > 0`.

- [ ] **Step 5: Verificar y commitear**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit
git add -A
git commit -m "Dejar de afirmar que la rutina cabe cuando no se sabe

routineFitsBlock devolvía un booleano; con pasos sin duración estimada eso
obligaba a inventar la respuesta. Ahora son tres estados, y 'no cabe' se
mantiene firme cuando lo ya estimado rebasa el bloque por sí solo."
```

---

### Task 4: Estado del día y scorecard

**Files:**
- Create: `src/lib/domain/development/routine-state.ts`, `src/lib/domain/development/scorecard.ts`
- Test: `tests/domain/development-routine-state.test.ts`, `tests/domain/development-scorecard.test.ts`

**Interfaces:**
- Produces: `routineRunState(...)`, `nextRoutineToday(...)`, `pendingConfirmations(...)`, `scorecard(...)`.

- [ ] **Step 1: Escribir los tests que fallan**

`routine-state.ts` — la máquina de estados, con `now` **inyectado siempre**:

```ts
export type RunState = "no toca" | "programada" | "por comenzar" | "en curso" | "por confirmar" | "cerrada";

export function routineRunState(
  routine: { days: number[]; startTime: string | null; durationMin: number },
  outcome: string | null,
  dateISO: string,
  nowHHMM: string,
  todayISO: string,
  leadMin = 10
): RunState;
```

Tests en las fronteras exactas, que es donde estas funciones se rompen:

- Un día que no está en `days` → `"no toca"`, sin importar la hora.
- `06:00` de inicio, `nowHHMM = "05:49"` → `"programada"`; `"05:50"` → `"por comenzar"` (el minuto exacto del lead ya cuenta).
- `"06:00"` → `"en curso"`; `"06:59"` con 60 min → `"en curso"`; `"07:00"` → `"por confirmar"` (el minuto del fin ya cerró el bloque).
- Con `outcome` no nulo → `"cerrada"` a cualquier hora.
- Un día **pasado** sin outcome → `"por confirmar"`, aunque `nowHHMM` sea de madrugada. Es lo que llena la bandeja.
- Un día **futuro** → `"programada"`, nunca `"por confirmar"`.
- `startTime = null` → `"programada"` todo el día y `"por confirmar"` al día siguiente: una rutina sin hora sigue teniendo día.

`scorecard.ts`:

```ts
export interface RoutineScore {
  routineId: string;
  programadas: number;      // días que tocaban, DERIVADOS de days
  completadas: number;
  sinOportunidad: number;
  omitidas: number;
  sinConfirmar: number;
  cumplimiento: number;     // completadas / (confirmadas − sinOportunidad)
  constancia: number;       // completadas / programadas
  confirmacion: number;     // confirmadas / programadas
  rachaActual: number;
  rachaMaxima: number;
}
```

Tests:
- **El denominador sale de `days`, no de filas.** Una rutina L-V en una semana sin ninguna fila `routine_runs` reporta `programadas: 5`, `sinConfirmar: 5`. Si saliera de filas, reportaría cero y el score mentiría por omisión.
- 5 programadas, 3 completadas, 1 sin oportunidad, 1 omitida → `cumplimiento: 75` (3 de 4), `constancia: 60` (3 de 5), `confirmacion: 100`.
- Los mismos números pero con la "sin oportunidad" **sin confirmar** → `cumplimiento: 75` (3 de 4 confirmadas), `constancia: 60`, `confirmacion: 80`. Un día no confirmado **no** cuenta como omitido: castigaría al usuario por no abrir la app, no por no hacer la rutina.
- Rango donde la rutina nunca toca → todo en cero, sin división entre cero.
- La racha cuenta solo días que tocaban: completar lunes y miércoles con una rutina L-X-V es racha 2, y el martes intermedio no la rompe.
- Un día `"Sin oportunidad"` **no rompe** la racha; uno `"Omitida"` sí. Es la diferencia que justifica preguntar.

- [ ] **Step 2: Correr los tests y verificar que fallan**

- [ ] **Step 3: Implementar ambos módulos**

Sin reloj, sin Supabase, sin React. `scorecard` recorre el rango con `addDaysISO`/`diffDays` igual que `routineAdherence`, y `routineAdherence` **no se toca**: sigue sirviendo al chip de 30 días de la página de rutinas.

- [ ] **Step 4: Verificar y commitear**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit
git add -A
git commit -m "Medir si la rutina se sigue, distinguiendo no poder de no querer

Tres números porque responden preguntas distintas: cumplimiento (cuando
pudiste, ¿lo hiciste?), constancia (de lo que planeaste, ¿cuánto ocurrió?) y
confirmación (¿estás cerrando el día?).

El denominador se deriva de days, no de filas: un día que nunca abriste
la app no tiene fila, y si el score saliera de filas ese día desaparecería
en vez de contar como pendiente."
```

---

### Task 5: Proyección bidireccional entre rutina y bloque

La tarea de más riesgo del plan: dos escritores sobre el mismo dato. Se contiene con mappers puros.

**Files:**
- Create: `src/lib/domain/development/projection.ts`
- Test: `tests/domain/development-projection.test.ts`
- Modify: `src/app/(app)/development/routines/actions.ts`, `src/app/(app)/time/actions.ts`
- Create: `supabase/migrations/0030_routine_occupation_unique.sql`

- [ ] **Step 1: Índice único — un bloque no puede ser de dos rutinas**

```sql
-- 0030_routine_occupation_unique.sql
-- La escritura de vuelta (/time → rutina) resuelve el dueño con
-- `select id from routines where occupation_id = ?`. Sin unicidad, esa
-- consulta podría devolver dos rutinas y la actualización sería ambigua.
create unique index if not exists uniq_routines_occupation
  on public.routines(occupation_id) where occupation_id is not null;
```

Se resuelve así, y no con una columna `occupations.routine_id`, para no crear una FK circular entre dos tablas que ya se referencian.

- [ ] **Step 2: Escribir los tests de los mappers**

```ts
// Rutina → bloque
export function projectRoutineToOccupation(
  routine: { name: string; days: number[]; startTime: string | null },
  steps: StepLike[]
): { title: string; startTime: string; endTime: string; days: number[]; recurring: true; source: "routine" } | null;

// Bloque → rutina
export function absorbOccupationIntoRoutine(
  occ: { title: string; startTime: string; endTime: string; days: number[] }
): { name: string; startTime: string; days: number[]; durationMinOverride: number };
```

Tests:
- Sin `startTime` → `projectRoutineToOccupation` devuelve `null`: una rutina sin hora **no** produce bloque. No se inventa una hora por el usuario.
- Con pasos de 10+15+5 y `startTime "06:00"` → bloque `06:00–06:30`.
- Con `durationMinOverride = 45` → el bloque dura 45 aunque los pasos sumen 30. El override manda.
- Con pasos sin estimar y sin override → duración mínima de 15 min, para no generar un bloque de cero (la base exige `end_time > start_time`).
- `absorbOccupationIntoRoutine` de un bloque `06:00–06:45` → `durationMinOverride: 45`.
- **Round-trip:** absorber un bloque y volver a proyectarlo devuelve el mismo bloque. Es el test que demuestra que no hay deriva entre los dos sentidos.
- Un bloque que cruza la medianoche no es representable: la base ya lo prohíbe con `check (end_time > start_time)`; el mapper devuelve el bloque recortado al mismo día y el test lo fija.

- [ ] **Step 3: Implementar los mappers y conectar las dos acciones**

En `development/routines/actions.ts`, `upsertRoutine` termina llamando a un helper local `syncOccupation(routineId)` que:
1. lee la rutina y sus pasos,
2. llama a `projectRoutineToOccupation`,
3. si devuelve `null` y había ocupación con `source = 'routine'`, la borra y deja `occupation_id` en null,
4. si devuelve un bloque, hace `update` sobre `occupation_id` existente o `insert` y guarda el id.

En `time/actions.ts`, `upsertOccupation` gana al final:

```ts
// Escritura de vuelta: si este bloque es la proyección de una rutina, la
// rutina se entera. NO se llama a upsertRoutine desde aquí — eso volvería a
// escribir la ocupación y crearía un ciclo. Se actualizan las columnas
// directamente, que es lo único que la rutina necesita saber.
if (parsed.source === "routine") {
  const { data: routine } = await supabase.from("routines").select("id").eq("occupation_id", id).maybeSingle();
  if (routine) {
    const next = absorbOccupationIntoRoutine({ ... });
    await supabase.from("routines").update({
      name: next.name,
      start_time: next.startTime,
      days: next.days,
      duration_min_override: next.durationMinOverride
    }).eq("id", routine.id);
    revalidatePath("/development/routines");
    revalidatePath("/development");
  }
}
```

**La regla que evita el ciclo, escrita en el código como comentario:** ninguna de las dos acciones llama a la otra. Cada una hace `update` de columnas y punto. El ciclo solo puede existir si una acción invoca a la otra.

- [ ] **Step 4: Borrado en los dos sentidos**

- `deleteRoutine`: borra la ocupación **solo si** `source = 'routine'`. Si el usuario ancló la rutina a un bloque que él creó (`source = 'manual'`), ese bloque sobrevive — la rutina no es dueña de algo que no creó. Mismo criterio que `habitLogEffect` al no borrar una racha ajena.
- `deleteOccupation` sobre un bloque proyectado: la rutina **sobrevive**. La FK ya es `on delete set null` (BR-026), así que `occupation_id` queda en null y la rutina aparece como "sin bloque asignado", con un botón para reprogramarla.

- [ ] **Step 5: Etiquetar el bloque en `/time`**

En `WeekView.tsx`, `DayEditor.tsx` y `time/page.tsx`, un bloque con `source = 'routine'` se pinta con `var(--c-orange)` (el acento del módulo) y lleva la nota *"Rutina · editar aquí también actualiza la rutina"*. Es editable —decisión del usuario— pero tiene que ser evidente que la edición viaja.

Los **pasos** no se editan desde `/time`: eso sigue en `/development/routines`. El bloque es cuándo y cuánto; los pasos son qué.

- [ ] **Step 6: Verificar en la app real — la prueba que justifica esta tarea**

```bash
pnpm dev
```

1. Crear en `/development/routines` la rutina "Mañana profunda", L-X-V, `06:00`, con pasos que sumen 30 min.
2. Ir a `/time`: el bloque `06:00–06:30` debe aparecer en lunes, miércoles y viernes, en naranja, y **no** en martes ni jueves.
3. **Arrastrar/editar el bloque a `07:00–07:45`** y añadir el martes.
4. Volver a `/development/routines`: la rutina debe decir `07:00`, cuatro días, y mostrar el chip "No cabe en el bloque" **no** — 30 min sí caben en 45. Añadir un paso de 20 min: ahora sí debe aparecer.
5. Borrar el bloque desde `/time`: la rutina sobrevive y aparece "sin bloque asignado".
6. Reprogramarla desde la rutina: el bloque vuelve, con `source = 'routine'`.
7. Crear un bloque **manual** en `/time`, anclar una rutina a él, y borrar esa rutina: el bloque manual debe seguir ahí.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Sincronizar la rutina y su bloque en los dos sentidos

Mover el bloque en Autogestión del Tiempo mueve la rutina, y editar la
rutina reescribe el bloque. Ninguna de las dos Server Actions llama a la
otra —solo actualizan columnas— porque ahí es donde nacería el ciclo.

Borrar la rutina borra su bloque solo si lo creó ella. Un bloque que el
usuario hizo a mano sobrevive: la rutina no es dueña de lo que no creó."
```

---

### Task 6: Plantillas — elegir, construir desde cero, editar, eliminar

**Files:**
- Create: `src/lib/domain/development/routine-templates.ts`
- Test: `tests/domain/development-templates.test.ts`
- Modify: `src/app/(app)/development/routines/{actions.ts,page.tsx,RoutineForm.tsx}`
- Create: `src/app/(app)/development/routines/TemplatePicker.tsx`

- [ ] **Step 1: El catálogo vive como dato en código**

`ROUTINE_TEMPLATES` en `routine-templates.ts`: 5–6 plantillas (mañana profunda, cierre del día, entrenamiento, revisión semanal, lectura). **Ninguna fila global en la base** — así el módulo conserva su regla única `user_id = auth.uid()` y no hace falta abrir una excepción de lectura pública en RLS. Es el mismo argumento del spec §4.3 para el catálogo de sistemas.

Cada plantilla trae `key`, `name`, `days`, `startTime`, y pasos con `durationMin: number | null` y `habitRef?: string`.

- [ ] **Step 2: Escribir los tests de `instantiateTemplate`**

```ts
export function instantiateTemplate(
  tpl: RoutineTemplate,
  snapshot: { habitsByName: Record<string, string> }
): InstantiationPlan;
```

- **Pureza:** dos llamadas con la misma entrada devuelven planes `deepStrictEqual`.
- **No inventa uuids:** el plan amarra padre e hijo con `ref` (`"r0"`, `"h0"`). Los ids los asigna la base. Un `crypto.randomUUID()` dentro rompería la determinación y haría el test imposible.
- Con `habitsByName: { meditar: "h-existente" }`, el paso apunta a `h-existente` y `habitsToCreate` va vacío: **se reutiliza el hábito, no se duplica.** La racha vive en un solo lugar, la regla de Fase 1.
- Sin ese hábito, se crea uno y el paso lo referencia por `ref`.
- Dos pasos con el mismo `habitRef` crean **un** hábito, no dos.
- El emparejamiento por nombre es insensible a mayúsculas y acentos: "Meditación" y "meditacion" son el mismo hábito.
- `position` de los pasos = índice del array, estable.
- Un paso con `durationMin: null` sobrevive la instanciación como `null`.

- [ ] **Step 3: Implementar y escribir las cuatro acciones**

| Acción | Comportamiento |
|---|---|
| `createRoutineFromTemplate(key)` | Lee los hábitos del usuario → `instantiateTemplate` → escribe hábitos, rutina y pasos → `syncOccupation` (Task 5) |
| `createBlankRoutine(name)` | Rutina vacía, sin pasos, sin hora. Sin bloque hasta que se le ponga hora |
| `upsertRoutine` / `upsertRoutineStep` | Ya existen; ganan `days`, `startTime`, `durationMin` nullable |
| `deleteRoutine` | Ya existe; gana el borrado condicional del bloque (Task 5, Step 4) |

Todas devuelven `{ ok, reason }` en vez de lanzar.

Fuera de alcance, y se anota en el plan para que nadie lo agregue de paso: **"guardar mi rutina como plantilla"**. Necesita tabla propia y el usuario no lo pidió.

- [ ] **Step 4: UI**

`TemplatePicker.tsx` — Client Component: al abrir "+ Rutina" se ofrecen las plantillas como tarjetas (nombre, días, hora, primeros pasos) más la opción **"Empezar desde cero"**. Elegir una la instancia y abre el editor con todo ya cargado, para que el primer gesto después de elegir sea ajustar, no rellenar.

`RoutineForm.tsx` gana las siete casillas de días (mismos presets que `OccupationForm`, Task 1) y el campo de hora de inicio. En los pasos, el campo de duración acepta vacío = sin estimar, con el placeholder *"min (opcional)"*.

- [ ] **Step 5: Verificar en la app real**

Instanciar "Mañana profunda" teniendo ya un hábito "Meditar": el paso debe quedar ligado a **ese** hábito, y `/development/habits` debe seguir mostrando **un solo** "Meditar" con su racha intacta. Instanciarla dos veces debe crear dos rutinas pero seguir habiendo un solo hábito.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "Crear rutinas desde plantillas, o desde cero

El catálogo es dato en código, no filas: así el módulo conserva su regla
única user_id = auth.uid() sin abrir una excepción de lectura pública en RLS.

instantiateTemplate es pura y no inventa uuids —amarra padre e hijo con
refs— y empareja los hábitos por nombre para reutilizar el que ya tienes en
vez de duplicar su racha."
```

---

### Task 7: Confirmación del día, bandeja de pendientes y scorecard

Cierra la fase: es donde el usuario ve el resultado.

**Files:**
- Create: `src/app/(app)/development/scorecard/page.tsx`, `src/app/(app)/development/routines/ConfirmRun.tsx`
- Modify: `src/app/(app)/development/routines/{page.tsx,actions.ts}`, `src/app/(app)/development/page.tsx`, `src/app/(app)/home/page.tsx`, `src/lib/data/home.ts`
- Modify: `src/components/nav-items.ts`, `src/components/icons.tsx`

- [ ] **Step 1: La acción de confirmar**

```ts
export async function confirmRoutineRun(
  routineId: string,
  localDate: string,
  outcome: "Completada" | "Sin oportunidad" | "Omitida",
  note = ""
): Promise<{ ok: boolean; reason?: string }>
```

`upsert` sobre `(routine_id, local_date)` con `onConflict` — el índice único de Fase 1 resuelve dos clics simultáneos. Escribe `outcome`, `outcome_at`, `outcome_note`, y una fila en `audit_log` con `action: "routine.outcome"` y `meta: { routine_id, local_date, outcome }`. La tabla ya existe y es append-only con RLS por `user_id`: cero migración para tener la bitácora.

**La fila se crea al confirmar, no antes.** No hay materialización nocturna porque no hay cron y porque el scorecard deriva su denominador de `days` (Task 4): un día sin fila es un día sin confirmar, y eso ya se sabe sin escribir nada.

- [ ] **Step 2: Banner de la rutina en curso**

En `/home` y `/development`, calculado en el servidor con `routineRunState` y el `now` de la zona del usuario:

- `"por comenzar"` → *"Es hora de comenzar: tu próxima rutina es **Leer**, 06:00–06:30."*
- `"en curso"` → *"**Leer** en curso · quedan 12 min · 1 de 3 pasos"*, con enlace a la rutina.

`nowHHMM` se calcula **una vez en el Server Component** y viaja como prop. Ningún Client Component mira el reloj (D-018).

- [ ] **Step 3: Bandeja de pendientes**

Sección **arriba en `/home`**, no escondida en el módulo: el hábito de confirmar es lo que alimenta el scorecard, y si hay que ir a buscarlo no ocurre.

Lista cada día vencido de los últimos 14 sin `outcome`, agrupado por rutina, con el texto que pidió el usuario: *"No marcaste que cumpliste **Leer** el martes 25. ¿La completaste o no tuviste oportunidad?"* y tres botones — **Completada · No tuve oportunidad · La omití**.

Ventana de 14 días para que la bandeja no crezca sin fin tras dos semanas sin abrir la app. Lo más viejo cuenta como "sin confirmar" en el scorecard y ya no se pregunta.

- [ ] **Step 4: `/development/scorecard`**

Selector de rango (7 / 30 / 90 días). Por rutina: `<Progress>` de constancia, los tres números con su etiqueta en una fila de `<Stat>`, el desglose `completadas / sin oportunidad / omitidas / sin confirmar`, y racha actual vs. máxima. Arriba, el agregado de todas las rutinas.

Cada número lleva una línea que explica qué mide. Tres porcentajes sin explicación son tres porcentajes que nadie interpreta.

`<EmptyState icon="📊" text="Confirma tus primeros días de rutina y aquí verás si la estás siguiendo." />`.

Ítem de navegación con `icon: "scorecard"` y `var(--c-orange)`, después de Rutinas.

- [ ] **Step 5: Verificar la fase completa**

```bash
pnpm verify
```

Esperado: install, typecheck, lint, tests unitarios, build, `check:csp`, `supabase db reset` y `supabase db test` **todos en verde**. Si algo falla, es bloqueante de la fase — no commitear encima.

Después, con `pnpm dev`, el recorrido completo: crear rutina desde plantilla → verla en `/time` en sus días → moverla desde `/time` y confirmar que la rutina cambió → marcar pasos → dejar pasar el bloque sin confirmar → verla en la bandeja de `/home` → responder "No tuve oportunidad" → comprobar en el scorecard que **subió la confirmación, no bajó el cumplimiento**.

- [ ] **Step 6: Documentar**

- `docs/UX_MAP.md`: filas de `/development/scorecard` y actualización de las de `/development/routines` y `/time`.
- `docs/DECISIONS.md`: **D-027** con las tres desviaciones respecto del spec listadas arriba, más la decisión de la escritura bidireccional y su riesgo de ciclo.
- `docs/CHECKS.md`: sección nueva con la evidencia del recorrido del Step 5. **Marcar explícitamente qué se probó contra la pila local y qué contra producción** — la ambigüedad en esa distinción es lo que dejó pasar el bug de `books.cover_url`.
- `README.md`: rutinas programables y scorecard en la lista de lo privado por `user_id`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Confirmar el día de rutina y ver si se está siguiendo

La bandeja de pendientes recoge hacia atrás lo no confirmado, y la respuesta
distingue no haber podido de haber omitido. El scorecard separa cumplimiento
de constancia y de confirmación porque responden preguntas distintas: un día
sin confirmar no cuenta como omitido, o el score castigaría al usuario por
no abrir la app en vez de por no hacer la rutina."
```

---

## Qué queda fuera de esta fase

- **Notificaciones fuera de la app** (capa B: `pg_cron` + `pg_net` + `sendEmail()`; capa C: Web Push con service worker). Nada de lo construido aquí se tira al agregarlas: la máquina de estados, los desenlaces y el scorecard son idénticos en las tres capas. La capa B es un route handler y un cron sobre funciones ya probadas.
- **Guardar una rutina propia como plantilla.** El catálogo en código ya cubre "elegir de unos templates"; la dirección inversa necesita tabla propia.
- **Sistemas** (§4.3 del spec) — plantillas que generan metas *y* rutinas *y* hábitos a la vez. Esta fase instancia rutinas; los sistemas son el nivel de arriba.
- **Eliminar `routines.frequency`.** Se conserva obsoleta en `0029` y se borra en una migración posterior, cuando ningún deploy anterior pueda leerla.
- **Días de la semana en `habits.frequency`.** Los hábitos conservan sus cuatro valores. Unificarlos es una migración con su propio riesgo y nadie lo pidió.
- **Arrastrar el bloque en `/time`** con el ratón. La edición bidireccional es por formulario; el arrastre es una capa de interacción aparte.
