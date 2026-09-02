# Hábitos dentro de rutinas — plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usa `superpowers:subagent-driven-development` (recomendado) o `superpowers:executing-plans` para ejecutar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`) para seguimiento.

**Objetivo:** Que todo hábito viva dentro de una rutina, que la rutina dicte cuándo toca, y que `routine_steps` desaparezca porque un paso *es* un hábito.

**Arquitectura:** Fusión, no pegamento. `habits` absorbe `routine_id` (not null), `position` y `duration_min`; `routine_steps` se borra; `habits.frequency` y `habits.occupation_id` se van porque la rutina ya los tiene. `habit_logs` pasa a ser la única fuente de «¿lo hice hoy?», así que `routine_runs.completed_step_ids` también se va. La lógica vive en funciones puras de `src/lib/domain/development/routines.ts`, probadas con `node:test`; las acciones de servidor solo las ejecutan.

**Stack:** Next.js 15 (App Router, Server Components y Server Actions), React 19, TypeScript 5.7, Supabase (Postgres + RLS), zod 3.25, Tailwind 3.4, pruebas con `node:test` (dominio) y pgTAP (base). Gestor de paquetes: pnpm.

**Spec:** `docs/superpowers/specs/2026-09-01-habitos-dentro-de-rutinas-design.md` — léela antes de la primera tarea. El plan argumenta desde ella.

## Restricciones globales

- **Idioma:** todo el código, los comentarios, los mensajes de commit y el texto de la interfaz van **en español**. Es la convención del repo entero.
- **Comentarios que explican el porqué, no el qué.** Mira `supabase/migrations/0033_habitos_atomicos.sql` o `src/lib/domain/development/routines.ts` para el tono: se documenta la decisión y lo que deliberadamente *no* se hace.
- **Mensajes de commit:** una línea evocativa en infinitivo o subjuntivo, sin prefijo `feat:`/`fix:`. Ejemplos reales del repo: «Devolver a producción el presupuesto por quincena», «Que el tablero se repinte al aplicar una plantilla». Cierra cada mensaje con:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```
- **`pnpm verify` BORRA la base local** (termina en `supabase db reset`). No lo corras sin avisar si hay datos reales en local. Durante el desarrollo usa los comandos sueltos: `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`, `supabase db reset && supabase db test`.
- **La lógica pura va en `src/lib/domain/`**, sin React ni Supabase, y se prueba en `tests/domain/`. Si aparece aritmética nueva en una página, está en el sitio equivocado.
- **Fechas:** el día local lo calcula el servidor con `todayLocal(await getUserTimeZone())` y viaja al cliente como prop. El cliente nunca llama a `new Date()` para saber qué día es (D-018).
- **`psql` NO está instalado en el host.** La base local se alcanza con `docker exec -i supabase_db_lifeos psql -U postgres` (el nombre del contenedor sale de `docker ps --filter name=supabase_db_`). La URL directa `postgresql://postgres:postgres@127.0.0.1:54322/postgres` solo sirve desde dentro del contenedor o si algún día se instala el cliente.
- **Numeración:** la migración es `0045`, la prueba pgTAP nueva es `0021` (el hueco `0020` lo ocupa la rama `feat/panel-admin-plantillas`, todavía sin fusionar), y las decisiones nuevas de `docs/DECISIONS.md` son **D-086** y **D-087** (la última existente es D-085).

---

## Estructura de archivos

**Base de datos**
- Crear `supabase/migrations/0045_habitos_dentro_de_rutinas.sql` — esquema, backfill y trigger de propiedad.
- Crear `supabase/tests/0021_habitos_en_rutinas.sql` — pgTAP del modelo nuevo.
- Crear `scripts/backfill/0045_fixture.sql` y `scripts/backfill/0045_asserts.sql` — datos legados y aserciones del backfill.
  Van en `scripts/` y **no** en `supabase/tests/` porque `supabase test db` le entrega a pg_prove el árbol entero de
  `supabase/tests`, subcarpetas incluidas: un `.sql` ahí dentro que no emita TAP tumba la suite completa. Y CI
  (`.github/workflows/ci.yml`) y `pnpm verify` lo invocan sin ruta, así que no hay forma de excluirlos.
- Crear `scripts/verificar-backfill-0045.sh` — aplica el backfill sobre datos legados y comprueba el resultado.
- Modificar `supabase/tests/0003_rls_habits_household_budget.sql`, `supabase/tests/0007_rls_development.sql`, `supabase/tests/0013_rls_desarrollo_personal.sql` — insertan hábitos sin rutina y dejarían de pasar.
- Modificar `supabase/seed.sql`.

**Dominio (puro)**
- Modificar `src/lib/domain/development/routines.ts` — el progreso se calcula sobre hábitos y registros, no sobre un array de ids en la ejecución.
- Modificar `src/lib/domain/insights/facts/habits.ts` — la frecuencia llega de la rutina.
- Modificar `tests/domain/development-routines.test.ts`, `tests/domain/insights-habits.test.ts`.

**Aplicación**
- Modificar `src/app/(app)/development/routines/actions.ts` — absorbe las acciones de hábito; pierde las de paso.
- Borrar `src/app/(app)/development/habits/actions.ts`.
- Mover `src/app/(app)/development/habits/HabitForm.tsx` → `src/app/(app)/development/routines/HabitForm.tsx`.
- Mover `src/app/(app)/development/habits/HabitRow.tsx` → `src/app/(app)/development/routines/HabitRow.tsx`.
- Mover `src/app/(app)/development/habits/HabitTemplates.tsx` → `src/app/(app)/development/routines/HabitTemplates.tsx`.
- Modificar `src/app/(app)/development/routines/RoutineForm.tsx` (identidad; fuera `StepForm`), `RoutineRunner.tsx`, `RoutineTemplates.tsx`, `page.tsx`.
- Reemplazar `src/app/(app)/development/habits/page.tsx` por un `redirect`.
- Modificar `src/app/(app)/development/page.tsx`, `src/components/nav-items.ts`.
- Modificar `src/app/(app)/admin/HabitTemplateFields.tsx`, `src/app/(app)/admin/[kind]/page.tsx`, `src/app/(app)/admin/[kind]/[slug]/page.tsx`, `src/lib/domain/templates/schema.ts`.
- Regenerar `src/types/database.types.ts`.

**Documentación**
- Modificar `docs/DECISIONS.md`, `docs/UX_MAP.md`, `docs/TRACEABILITY.md`.

---

## Tarea 1: El dominio deja de contar pasos y empieza a contar hábitos

**Archivos:**
- Modificar: `src/lib/domain/development/routines.ts`
- Probar: `tests/domain/development-routines.test.ts`

**Interfaces:**
- Consume: nada de tareas anteriores.
- Produce:
  - `interface RoutineHabitLike { id: string; durationMin: number }`
  - `routineProgress(doneHabitIds: string[], habits: RoutineHabitLike[]): { done: number; total: number; pct: number; remainingMin: number }`
  - `routineFitsBlock(habits: RoutineHabitLike[], block: { start: string; end: string } | null): boolean`
  - `routineRunComplete(habitIds: string[], doneHabitIds: string[]): boolean`
  - `toggleHabitEffect(alreadyLoggedToday: boolean): "insert" | "delete"`
  - `routineDueToday` y `routineAdherence` no cambian de firma.
  - Desaparecen `StepLike`, `nextCompletedSteps`, `HabitLogEffect` y `habitLogEffect`.

- [ ] **Paso 1: Escribir las pruebas que fallan**

Abre `tests/domain/development-routines.test.ts`. Cambia el bloque de importación de arriba del archivo por este:

```ts
import {
  routineDueToday,
  routineProgress,
  routineFitsBlock,
  routineAdherence,
  routineRunComplete,
  toggleHabitEffect
} from "../../src/lib/domain/development/routines.ts";
```

Borra los tests existentes de `nextCompletedSteps` y de `habitLogEffect` (búscalos por esos nombres; son los únicos que los mencionan). Sustituye los tres tests cuyo nombre empieza por `routineProgress:` y el que empieza por `routineFitsBlock:` por estos, y añade los cinco últimos al final del archivo:

```ts
test("routineProgress: cuenta hábitos hechos y minutos que faltan", () => {
  const habits = [
    { id: "h1", durationMin: 10 },
    { id: "h2", durationMin: 15 },
    { id: "h3", durationMin: 5 }
  ];
  assert.deepStrictEqual(routineProgress(["h1"], habits), { done: 1, total: 3, pct: 33, remainingMin: 20 });
});

test("routineProgress: una rutina sin hábitos va en 0, no en NaN", () => {
  assert.deepStrictEqual(routineProgress([], []), { done: 0, total: 0, pct: 0, remainingMin: 0 });
});

test("routineProgress: ignora registros de hábitos que ya no están en la rutina", () => {
  const habits = [{ id: "h1", durationMin: 10 }];
  assert.strictEqual(routineProgress(["h1", "h-de-otra-rutina"], habits).done, 1);
});

test("routineFitsBlock: 30 min de hábitos no caben en un bloque de 20", () => {
  const habits = [{ id: "h1", durationMin: 20 }, { id: "h2", durationMin: 10 }];
  assert.strictEqual(routineFitsBlock(habits, { start: "06:00", end: "06:20" }), false);
  assert.strictEqual(routineFitsBlock(habits, { start: "06:00", end: "07:00" }), true);
});

test("routineRunComplete: se cierra solo cuando TODOS los hábitos tienen registro hoy", () => {
  assert.strictEqual(routineRunComplete(["h1", "h2"], ["h1"]), false);
  assert.strictEqual(routineRunComplete(["h1", "h2"], ["h1", "h2"]), true);
});

test("routineRunComplete: una rutina sin hábitos NO se da por hecha", () => {
  // Sin esto, una rutina recién creada aparecería cumplida sin haber hecho
  // nada, y contaminaría la adherencia a 30 días con días regalados.
  assert.strictEqual(routineRunComplete([], []), false);
});

test("routineRunComplete: registros de hábitos ajenos no cierran la rutina", () => {
  assert.strictEqual(routineRunComplete(["h1", "h2"], ["h1", "h9"]), false);
});

test("toggleHabitEffect: marcar inserta, desmarcar borra", () => {
  // La fusión cambia una conducta deliberada del modelo viejo: cuando el paso
  // y el hábito eran dos registros, desmarcar el paso NO borraba la racha.
  // Ahora son el mismo registro, así que desmarcar es desmarcar.
  assert.strictEqual(toggleHabitEffect(false), "insert");
  assert.strictEqual(toggleHabitEffect(true), "delete");
});
```

- [ ] **Paso 2: Correr las pruebas y ver que fallan**

Ejecuta: `pnpm exec node --experimental-strip-types --test tests/domain/development-routines.test.ts`

Esperado: FALLA. `SyntaxError` o `TypeError` porque `routineRunComplete` y `toggleHabitEffect` no existen todavía en el módulo.

- [ ] **Paso 3: Reescribir el dominio**

En `src/lib/domain/development/routines.ts`:

Sustituye el bloque de comentario de cabecera (las líneas que empiezan en `// LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO` y llegan hasta antes del `import`) por:

```ts
// LO QUE ESTE MÓDULO NO HACE, A PROPÓSITO
// No guarda horarios: el bloque sigue viviendo en `occupations`, y ahora lo
// referencia la rutina, no cada hábito. No calcula rachas: siguen viviendo en
// `habit_logs`, que desde la migración 0045 es TAMBIÉN la única fuente de
// "¿hice hoy este paso?" — por eso `routine_runs` ya no lleva la lista de
// pasos completados. La rutina aporta el ORDEN y la FRECUENCIA; el hábito
// aporta el registro.
```

Sustituye `export interface StepLike { ... }` por:

```ts
/**
 * Un hábito visto desde la rutina. Desde 0045 no hay una tabla de pasos: el
 * paso ES la fila del hábito, con su `position` y su `duration_min`.
 */
export interface RoutineHabitLike {
  id: string;
  durationMin: number;
}
```

Sustituye la función `routineProgress` completa por:

```ts
/**
 * `doneHabitIds` son los hábitos con registro en `habit_logs` para el día que
 * se está mirando. No hay un segundo lugar donde consultarlo.
 */
export function routineProgress(
  doneHabitIds: string[],
  habits: RoutineHabitLike[]
): { done: number; total: number; pct: number; remainingMin: number } {
  const done = new Set(doneHabitIds);
  const hechos = habits.filter((h) => done.has(h.id));
  return {
    done: hechos.length,
    total: habits.length,
    pct: habits.length === 0 ? 0 : Math.round((hechos.length / habits.length) * 100),
    remainingMin: habits.filter((h) => !done.has(h.id)).reduce((sum, h) => sum + h.durationMin, 0)
  };
}
```

Cambia la firma de `routineFitsBlock` para que reciba hábitos:

```ts
/** ¿Cabe la rutina en el bloque al que está anclada? Sin bloque, siempre cabe. */
export function routineFitsBlock(habits: RoutineHabitLike[], block: { start: string; end: string } | null): boolean {
  if (block === null) return true;
  const total = habits.reduce((sum, h) => sum + h.durationMin, 0);
  return total <= toMinutes(block.end) - toMinutes(block.start);
}
```

Borra `nextCompletedSteps`, el tipo `HabitLogEffect` y la función `habitLogEffect` con todo su comentario. En su lugar, al final del archivo:

```ts
/**
 * La ejecución del día se cierra cuando TODOS los hábitos de la rutina tienen
 * registro hoy.
 *
 * Una rutina sin hábitos devuelve `false` y no `true`: "todos los cero" es
 * cierto en lógica y falso en la vida. Darla por hecha regalaría días a la
 * adherencia de una rutina que nadie ha ejecutado.
 */
export function routineRunComplete(habitIds: string[], doneHabitIds: string[]): boolean {
  if (habitIds.length === 0) return false;
  const done = new Set(doneHabitIds);
  return habitIds.every((id) => done.has(id));
}

/**
 * Qué hacer con `habit_logs` al tocar la casilla de un hábito.
 *
 * Antes de 0045 el paso y el hábito eran dos registros y desmarcar el paso no
 * borraba la racha: el usuario podía haber cumplido el hábito por otra vía y
 * esta rutina no era dueña de negarlo. Ahora son el mismo registro, así que
 * desmarcar es desmarcar. Es un cambio de conducta, no un descuido.
 */
export function toggleHabitEffect(alreadyLoggedToday: boolean): "insert" | "delete" {
  return alreadyLoggedToday ? "delete" : "insert";
}
```

- [ ] **Paso 4: Correr las pruebas y ver que pasan**

Ejecuta: `pnpm exec node --experimental-strip-types --test tests/domain/development-routines.test.ts`

Esperado: PASA, todos los tests del archivo.

Ejecuta también: `pnpm test:unit`

Esperado: los demás archivos de `tests/domain/` siguen pasando. `pnpm typecheck` fallará todavía —las páginas siguen llamando a las firmas viejas—; eso se arregla en las tareas 3 a 5, no aquí.

- [ ] **Paso 5: Commit**

```bash
git add src/lib/domain/development/routines.ts tests/domain/development-routines.test.ts
git commit -m "$(cat <<'EOF'
Que el progreso de la rutina se lea donde vive la racha

routineProgress contaba ids guardados en routine_runs.completed_step_ids, un
segundo registro de "¿lo hice?" que convivía con habit_logs. Ahora cuenta
hábitos con registro del día, que es el único sitio donde eso consta.

Con el registro unificado, desmarcar deja de ser inofensivo: toggleHabitEffect
borra el log en vez de ignorar la orden. habitLogEffect existía justo para no
hacerlo, y deja de tener sentido cuando no hay dos registros que reconciliar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tarea 2: La migración, y la prueba de que no se lleva datos por delante

**Archivos:**
- Crear: `supabase/migrations/0045_habitos_dentro_de_rutinas.sql`
- Crear: `supabase/tests/0021_habitos_en_rutinas.sql`
- Crear: `scripts/backfill/0045_fixture.sql`
- Crear: `scripts/backfill/0045_asserts.sql`
- Crear: `scripts/verificar-backfill-0045.sh`
- Modificar: `supabase/tests/0003_rls_habits_household_budget.sql`
- Modificar: `supabase/tests/0007_rls_development.sql`
- Modificar: `supabase/tests/0013_rls_desarrollo_personal.sql`

**Interfaces:**
- Consume: nada de la tarea 1 (SQL puro).
- Produce, para las tareas 3 a 8:
  - `public.habits` con `routine_id uuid not null`, `position integer not null default 0`, `duration_min integer not null default 5`; **sin** `frequency` ni `occupation_id`.
  - `public.routines` con `identity text not null default ''`.
  - `public.routine_steps` ya no existe.
  - `public.routine_runs` sin `completed_step_ids`.
  - `public.guard_habit_routine_owner()` y el trigger `trg_guard_habit_routine_owner`.

- [ ] **Paso 1: Escribir el fixture de datos legados**

Crea `scripts/backfill/0045_fixture.sql`. Se ejecuta contra el esquema **anterior** a 0045, así que usa las columnas viejas (`habits.frequency`, `habits.occupation_id`, `routine_steps`):

```sql
-- scripts/backfill/0045_fixture.sql
-- Datos con la forma ANTERIOR a la migración 0045, para comprobar que el
-- backfill coloca cada hábito donde la spec dice. Lo corre
-- scripts/verificar-backfill-0045.sh, no `supabase test db`: una prueba pgTAP
-- normal se ejecuta sobre el esquema YA migrado, donde estas columnas no
-- existen y estos datos son imposibles de crear.

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'backfill-a@test.local'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'backfill-b@test.local')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- USUARIO A
-- ---------------------------------------------------------------------------
insert into public.occupations (id, user_id, title, start_time, end_time, category, occ_date)
values ('a0000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Mañana', '06:00', '07:00', 'Personal', current_date);

insert into public.routines (id, user_id, name, frequency, position, created_at)
values ('a1000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Cierre de día', 'Diario', 0, now());

-- Caso 1: hábito que YA es paso de una rutina. Hereda esa rutina, y con ella
-- la posición y la duración del paso.
insert into public.habits (id, user_id, name, frequency, category)
values ('a2000000-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Anotar el día', 'Diario', 'Personal');
insert into public.routine_steps (id, routine_id, position, title, duration_min, habit_id)
values ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        2, 'Anotar el día', 15, 'a2000000-0000-4000-8000-000000000001');

-- Caso 4: paso de texto libre, sin hábito detrás. Se convierte en hábito.
insert into public.routine_steps (id, routine_id, position, title, duration_min, habit_id)
values ('a3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001',
        3, 'Dejar la ropa lista', 4, null);

-- Caso 2: dos hábitos sueltos atados al mismo bloque. Forman una rutina que se
-- llama como el bloque. Dos son 'Diario' y uno 'Semanal' → gana 'Diario'.
insert into public.habits (id, user_id, name, frequency, category, occupation_id, created_at) values
  ('a2000000-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 'Meditar', 'Diario', 'Salud', 'a0000000-0000-4000-8000-000000000001', now() - interval '2 days'),
  ('a2000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001', 'Estirar', 'Diario', 'Salud', 'a0000000-0000-4000-8000-000000000001', now() - interval '1 day'),
  ('a2000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000001', 'Pesarme', 'Semanal', 'Salud', 'a0000000-0000-4000-8000-000000000001', now());

-- Caso 3: hábito suelto sin bloque. Va a una rutina por frecuencia.
insert into public.habits (id, user_id, name, frequency, category)
values ('a2000000-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000001',
        'Llamar a mamá', 'Semanal', 'Personal');

-- ---------------------------------------------------------------------------
-- USUARIO B — el hábito que está en DOS rutinas
-- ---------------------------------------------------------------------------
insert into public.routines (id, user_id, name, frequency, position, created_at) values
  ('b1000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 'Primera', 'Diario', 0, now()),
  ('b1000000-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000002', 'Segunda', 'Diario', 1, now());

insert into public.habits (id, user_id, name, frequency, category)
values ('b2000000-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002',
        'Beber agua', 'Diario', 'Salud');

insert into public.routine_steps (id, routine_id, position, title, duration_min, habit_id) values
  ('b3000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 0, 'Beber agua', 1, 'b2000000-0000-4000-8000-000000000001'),
  ('b3000000-0000-4000-8000-000000000002', 'b1000000-0000-4000-8000-000000000002', 0, 'Beber agua', 2, 'b2000000-0000-4000-8000-000000000001');
```

- [ ] **Paso 2: Escribir las aserciones del backfill**

Crea `scripts/backfill/0045_asserts.sql`. Se ejecuta **después** de aplicar 0045 y revienta con una excepción si algo no cuadra:

```sql
-- scripts/backfill/0045_asserts.sql
-- Corre DESPUÉS de aplicar 0045 sobre el fixture. Cada bloque cubre un caso de
-- la sección «Backfill» de la spec.

do $$
declare
  v_routine uuid;
  v_pos integer;
  v_dur integer;
  v_n integer;
begin
  -- Caso 1: el hábito que ya era paso conserva rutina, posición y duración.
  select routine_id, position, duration_min into v_routine, v_pos, v_dur
    from public.habits where id = 'a2000000-0000-4000-8000-000000000001';
  if v_routine is distinct from 'a1000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Caso 1: el hábito que ya era paso no heredó su rutina (obtuvo %)', v_routine;
  end if;
  if v_pos <> 2 or v_dur <> 15 then
    raise exception 'Caso 1: se perdieron posición o duración del paso (pos=%, dur=%)', v_pos, v_dur;
  end if;

  -- Caso 4: el paso de texto libre existe ahora como hábito, en su sitio.
  select count(*) into v_n from public.habits
   where name = 'Dejar la ropa lista'
     and routine_id = 'a1000000-0000-4000-8000-000000000001'
     and position = 3 and duration_min = 4 and category = 'Otros'
     and user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception 'Caso 4: el paso de texto libre no se convirtió en hábito (encontrados %)', v_n;
  end if;

  -- Caso 2: los tres hábitos del bloque comparten una rutina nueva llamada
  -- como el bloque, anclada a él, y con la frecuencia más común.
  select count(distinct routine_id) into v_n from public.habits
   where id in ('a2000000-0000-4000-8000-000000000002',
                'a2000000-0000-4000-8000-000000000003',
                'a2000000-0000-4000-8000-000000000004');
  if v_n <> 1 then
    raise exception 'Caso 2: los hábitos del bloque quedaron repartidos en % rutinas', v_n;
  end if;

  select routine_id into v_routine from public.habits
   where id = 'a2000000-0000-4000-8000-000000000002';
  select count(*) into v_n from public.routines
   where id = v_routine and name = 'Mañana' and frequency = 'Diario'
     and occupation_id = 'a0000000-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception 'Caso 2: la rutina del bloque no salió con nombre, frecuencia o ancla correctos';
  end if;

  -- Y el orden dentro de esa rutina es el de created_at.
  select position into v_pos from public.habits where id = 'a2000000-0000-4000-8000-000000000002';
  if v_pos <> 0 then
    raise exception 'Caso 2: el hábito más antiguo del bloque no quedó primero (pos=%)', v_pos;
  end if;
  select position into v_pos from public.habits where id = 'a2000000-0000-4000-8000-000000000004';
  if v_pos <> 2 then
    raise exception 'Caso 2: el hábito más reciente del bloque no quedó último (pos=%)', v_pos;
  end if;

  -- Caso 3: el suelto sin bloque va a una rutina nombrada por su frecuencia.
  select routine_id into v_routine from public.habits
   where id = 'a2000000-0000-4000-8000-000000000005';
  select count(*) into v_n from public.routines
   where id = v_routine and name = 'Hábitos semanales' and frequency = 'Semanal'
     and occupation_id is null;
  if v_n <> 1 then
    raise exception 'Caso 3: el hábito sin bloque no fue a «Hábitos semanales»';
  end if;

  -- Pérdida conocida: el hábito que estaba en dos rutinas se queda en la de
  -- menor position, y con la duración del paso de esa rutina.
  select routine_id, duration_min into v_routine, v_dur from public.habits
   where id = 'b2000000-0000-4000-8000-000000000001';
  if v_routine is distinct from 'b1000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Doble rutina: ganó la equivocada (obtuvo %)', v_routine;
  end if;
  if v_dur <> 1 then
    raise exception 'Doble rutina: se copió la duración del paso perdedor (dur=%)', v_dur;
  end if;

  -- Y no se duplicó para colocarlo en las dos.
  select count(*) into v_n from public.habits
   where user_id = 'bbbbbbbb-0000-4000-8000-000000000002' and name = 'Beber agua';
  if v_n <> 1 then
    raise exception 'Doble rutina: el hábito se duplicó (% filas), bifurcando la racha', v_n;
  end if;

  -- Nadie se quedó fuera: el not null habría reventado, pero decirlo explícito
  -- convierte un error de Postgres en un mensaje que se entiende.
  select count(*) into v_n from public.habits where routine_id is null;
  if v_n <> 0 then
    raise exception '% hábitos quedaron sin rutina', v_n;
  end if;

  raise notice 'Backfill 0045: los seis casos pasan.';
end $$;
```

- [ ] **Paso 3: Escribir el script de verificación**

Crea `scripts/verificar-backfill-0045.sh` y hazlo ejecutable:

```bash
#!/usr/bin/env bash
# Comprueba que el backfill de 0045 coloca los datos legados donde toca.
#
# No puede ser una prueba pgTAP normal: `supabase test db` corre sobre el
# esquema YA migrado, donde habits.frequency y routine_steps no existen y los
# datos de partida son imposibles de crear. Así que el script aparta la
# migración, reconstruye la base en su estado anterior, siembra el fixture,
# aplica 0045 a mano y comprueba el resultado.
#
# CUIDADO: hace `supabase db reset`. Borra la base LOCAL.
set -euo pipefail

MIG="supabase/migrations/0045_habitos_dentro_de_rutinas.sql"
SEED="supabase/seed.sql"
TMP="$(mktemp -d)"

# En esta máquina `psql` NO está instalado en el host, pero sí dentro del
# contenedor de la base local. Se usa el que haya, y si no hay ninguno se dice
# por qué en vez de fallar con "command not found".
CONTENEDOR="$(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -1)"
if command -v psql >/dev/null 2>&1; then
  correr() { psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "$1"; }
elif [ -n "$CONTENEDOR" ]; then
  # `-f -` no hace falta: psql lee de stdin, y ON_ERROR_STOP propaga el fallo
  # como código de salida distinto de cero, que es lo que `set -e` necesita.
  correr() { docker exec -i "$CONTENEDOR" psql -U postgres -v ON_ERROR_STOP=1 < "$1"; }
else
  echo "No encuentro psql ni el contenedor de la base local. ¿Corriste 'supabase start'?" >&2
  exit 1
fi

restaurar() {
  [ -f "$TMP/0045.sql" ] && mv "$TMP/0045.sql" "$MIG"
  [ -f "$TMP/seed.sql" ] && mv "$TMP/seed.sql" "$SEED"
  rmdir "$TMP" 2>/dev/null || true
}
trap restaurar EXIT

# La semilla también se aparta: está escrita para el esquema nuevo y no tiene
# nada que aportar a esta comprobación.
mv "$MIG" "$TMP/0045.sql"
mv "$SEED" "$TMP/seed.sql"

echo "→ Reconstruyendo la base en el estado anterior a 0045…"
supabase db reset

echo "→ Sembrando datos con la forma vieja…"
correr scripts/backfill/0045_fixture.sql

echo "→ Aplicando 0045…"
correr "$TMP/0045.sql"

echo "→ Comprobando…"
correr scripts/backfill/0045_asserts.sql

echo "✓ Backfill verificado."
```

Ejecuta: `chmod +x scripts/verificar-backfill-0045.sh`

- [ ] **Paso 4: Correr el script y ver que falla**

Ejecuta: `./scripts/verificar-backfill-0045.sh`

Esperado: FALLA en `mv "$MIG" "$TMP/0045.sql"` con «No such file or directory», porque la migración todavía no existe. Es el fallo correcto: confirma que el script busca lo que va a probar.

- [ ] **Paso 5: Escribir la migración**

Crea `supabase/migrations/0045_habitos_dentro_de_rutinas.sql`:

```sql
-- 0045_habitos_dentro_de_rutinas.sql
--
-- EL HÁBITO NO ES UNA ISLA.
--
-- Hasta aquí, `habits` y `routines` eran dos módulos que se rozaban sin
-- unirse: un hábito podía existir sin rutina, un paso podía ser texto libre
-- que nadie contaba, y las dos tablas guardaban su propia `frequency`. Había
-- dos sitios respondiendo «¿toca hoy?» y ninguno mandaba.
--
-- Los tres libros que inspiran el módulo describen la misma cosa: una rutina
-- es una cadena de hábitos, y el hábito se sostiene porque la cadena tira de
-- él. Esta migración lo escribe en el esquema:
--
--   habits.routine_id    obligatorio. Un hábito fuera de una rutina deja de
--                        ser representable, y no por convención de la app:
--                        por un `not null` que la base defiende sola.
--   habits.position      el orden dentro de la rutina, que ES el apilamiento.
--   habits.duration_min  lo que duraba el paso, que ahora dura el hábito.
--   routines.identity    «Soy alguien que no negocia sus mañanas». Cap. 2 de
--                        «Hábitos atómicos»: el hábito no se sostiene por la
--                        meta, se sostiene por quién crees que eres.
--
-- Y borra lo que quedó diciendo lo mismo dos veces: `habits.frequency` (la
-- dicta la rutina), `habits.occupation_id` (el bloque lo ancla la rutina),
-- `routine_steps` entera (el paso ES el hábito) y
-- `routine_runs.completed_step_ids` (el registro vive en `habit_logs`, que ya
-- es único por (habit_id, log_date)).

-- =============================================================================
-- Columnas nuevas
-- =============================================================================
alter table public.habits
  add column if not exists routine_id uuid references public.routines(id) on delete cascade,
  add column if not exists position integer not null default 0,
  add column if not exists duration_min integer not null default 5 check (duration_min > 0);

alter table public.routines
  add column if not exists identity text not null default '';

comment on column public.habits.routine_id is
  'La rutina a la que pertenece. `on delete cascade` y no `set null` como occupation_id (BR-026): el bloque horario es opcional y el hábito le sobrevive, pero sin rutina un hábito ya no puede existir.';
comment on column public.habits.position is
  'El orden dentro de la rutina. ES el apilamiento: «después de qué» se lee de la posición anterior, no de un campo que haya que mantener a mano.';
comment on column public.habits.duration_min is
  'Lo que duraba el paso. Se usa para decir si la rutina cabe en su bloque horario.';
comment on column public.routines.identity is
  'En quién te conviertes al sostenerla. Texto libre y opcional: una rutina sin identidad sigue funcionando, solo que apoyada en la fuerza de voluntad en vez de en quién crees que eres.';

-- =============================================================================
-- Backfill — ver la sección «Backfill» de la spec del 2026-09-01
-- =============================================================================
-- El orden importa: el primero que reclama un hábito se lo queda.
do $$
declare
  r record;
  v_routine_id uuid;
begin
  -- Paso 1. Los hábitos que YA son paso de una rutina heredan esa rutina, con
  -- la posición y la duración que tenía el paso.
  --
  -- `distinct on` resuelve el hábito que está en dos rutinas: gana la de menor
  -- `position`, y a igualdad la más antigua. Se descarta duplicar el hábito
  -- para ponerlo en las dos, que bifurcaría la racha — justo lo que 0024
  -- evitó al inventar `routine_steps.habit_id`.
  with elegido as (
    select distinct on (s.habit_id)
           s.habit_id, s.routine_id, s.position, s.duration_min
      from public.routine_steps s
      join public.routines rt on rt.id = s.routine_id
     where s.habit_id is not null
     order by s.habit_id, rt.position, rt.created_at, s.position
  )
  update public.habits h
     set routine_id = e.routine_id,
         position = e.position,
         duration_min = e.duration_min
    from elegido e
   where h.id = e.habit_id;

  -- Paso 2. Los sueltos con bloque horario se agrupan por bloque. Quien ató
  -- tres hábitos a «Mañana» ya había dicho que forman una rutina; lo único que
  -- faltaba era dónde anotarlo.
  for r in
    select h.user_id,
           h.occupation_id,
           o.title,
           (select h2.frequency
              from public.habits h2
             where h2.user_id = h.user_id
               and h2.occupation_id = h.occupation_id
               and h2.routine_id is null
             group by h2.frequency
             -- La más común; a igualdad gana 'Diario', que es el default de la
             -- tabla y el caso que no sorprende a nadie.
             order by count(*) desc, (h2.frequency <> 'Diario'), h2.frequency
             limit 1) as freq
      from public.habits h
      join public.occupations o on o.id = h.occupation_id
     where h.routine_id is null
     group by h.user_id, h.occupation_id, o.title
  loop
    insert into public.routines (user_id, name, frequency, occupation_id, active, position)
    values (r.user_id, r.title, r.freq, r.occupation_id, true,
            coalesce((select max(position) + 1 from public.routines where user_id = r.user_id), 0))
    returning id into v_routine_id;

    update public.habits h
       set routine_id = v_routine_id, position = sub.pos
      from (select id, (row_number() over (order by created_at, id) - 1) as pos
              from public.habits
             where routine_id is null
               and user_id = r.user_id
               and occupation_id = r.occupation_id) sub
     where h.id = sub.id;
  end loop;

  -- Paso 3. Los sueltos sin bloque se agrupan por frecuencia, que es el único
  -- dato que queda sobre cuándo tocaban. Sin esto perderían ese «cuándo».
  for r in
    select user_id, frequency
      from public.habits
     where routine_id is null and occupation_id is null
     group by user_id, frequency
  loop
    insert into public.routines (user_id, name, frequency, occupation_id, active, position)
    values (r.user_id,
            case r.frequency
              when 'Diario' then 'Hábitos diarios'
              when 'Semanal' then 'Hábitos semanales'
              when 'Entre semana' then 'Hábitos de entre semana'
              when 'Fin de semana' then 'Hábitos de fin de semana'
            end,
            r.frequency, null, true,
            coalesce((select max(position) + 1 from public.routines where user_id = r.user_id), 0))
    returning id into v_routine_id;

    update public.habits h
       set routine_id = v_routine_id, position = sub.pos
      from (select id, (row_number() over (order by created_at, id) - 1) as pos
              from public.habits
             where routine_id is null
               and user_id = r.user_id
               and occupation_id is null
               and frequency = r.frequency) sub
     where h.id = sub.id;
  end loop;

  -- Paso 4. Los pasos de texto libre se convierten en hábitos. Sin logs
  -- previos: nunca los tuvieron, y regalarle una racha a algo que nadie ha
  -- marcado sería mentir en la primera pantalla.
  insert into public.habits (user_id, name, category, routine_id, position, duration_min)
  select rt.user_id, s.title, 'Otros', s.routine_id, s.position, s.duration_min
    from public.routine_steps s
    join public.routines rt on rt.id = s.routine_id
   where s.habit_id is null;
end $$;

-- =============================================================================
-- Cierre del modelo
-- =============================================================================
-- El `set not null` es además la red de seguridad del backfill: si algún
-- hábito se quedó sin rutina, la migración entera revienta aquí y no deja una
-- base a medias.
alter table public.habits alter column routine_id set not null;

alter table public.habits drop column frequency;
alter table public.habits drop column occupation_id;
drop table public.routine_steps;
alter table public.routine_runs drop column completed_step_ids;

comment on table public.routine_runs is
  'Único por (routine_id, local_date). Ya no lleva la lista de pasos hechos: eso vive en habit_logs desde 0045. Sobrevive por started_at y completed_at, que dicen cuándo arrancaste la rutina y cuándo la cerraste — dato que ninguna otra tabla tiene.';

create index if not exists idx_habits_routine on public.habits(routine_id, position);

-- =============================================================================
-- La rutina tiene que ser TUYA
-- =============================================================================
-- Mismo agujero que cerró 0033 para `stack_after_habit_id`: las claves
-- foráneas NO evalúan RLS, así que `routine_id` aceptaría la rutina de otra
-- cuenta si alguien lo mandara a mano. No filtraría nada —seguirías sin poder
-- leer esa fila— pero dejaría una referencia cruzada entre cuentas que nadie
-- sabría explicar después.
create or replace function public.guard_habit_routine_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.routines r
    where r.id = new.routine_id and r.user_id = new.user_id
  ) then
    raise exception 'Solo puedes poner un hábito en una rutina tuya.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_habit_routine_owner on public.habits;
create trigger trg_guard_habit_routine_owner
  before insert or update of routine_id on public.habits
  for each row execute function public.guard_habit_routine_owner();

comment on function public.guard_habit_routine_owner is
  'Impide colgar un hábito de la rutina de otra cuenta. Necesario porque las claves foráneas no evalúan RLS.';
```

- [ ] **Paso 6: Correr el script y ver que pasa**

Ejecuta: `./scripts/verificar-backfill-0045.sh`

Esperado: termina con `✓ Backfill verificado.` y el `NOTICE: Backfill 0045: los seis casos pasan.`

Si falla en un `raise exception`, el mensaje dice qué caso y con qué valor. Arregla la migración, no la aserción.

- [ ] **Paso 7: Escribir el pgTAP del modelo nuevo**

Crea `supabase/tests/0021_habitos_en_rutinas.sql`:

```sql
-- 0021_habitos_en_rutinas.sql — pgTAP: el hábito vive dentro de su rutina
-- (migración 0045).
--
-- El backfill NO se prueba aquí: se ejecuta sobre el esquema anterior, que ya
-- no existe cuando esta prueba corre. Lo cubre
-- scripts/verificar-backfill-0045.sh.

begin;
select plan(8);

insert into auth.users (id, instance_id, aud, role, email) values
  ('c1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rut-titular@test.local'),
  ('c2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rut-otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('c1111111-1111-4111-8111-111111111111', 'Titular Rutinas'),
  ('c2222222-2222-4222-8222-222222222222', 'Otro Rutinas')
on conflict (user_id) do nothing;

-- El esquema dice lo que la spec prometió
select has_column('public', 'habits', 'routine_id', 'habits.routine_id existe (0045)');
select has_column('public', 'routines', 'identity', 'routines.identity existe (0045)');
select hasnt_column('public', 'habits', 'frequency', 'habits.frequency ya no existe: la dicta la rutina');
select hasnt_table('public', 'routine_steps', 'routine_steps ya no existe: el paso ES el hábito');

select set_config('request.jwt.claims', json_build_object('sub', 'c1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.routines (id, user_id, name, frequency, identity)
values ('c3333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111',
        'Mañana Milagrosa', 'Diario', 'Soy alguien que no negocia sus mañanas');

insert into public.habits (id, user_id, name, category, routine_id, position, duration_min)
values ('c4444444-4444-4444-8444-444444444444', 'c1111111-1111-4111-8111-111111111111',
        'Meditar', 'Salud', 'c3333333-3333-4333-8333-333333333333', 0, 10);

-- Un hábito sin rutina es imposible, y lo impide la BASE, no la aplicación
select throws_ok(
  $$ insert into public.habits (user_id, name, category)
     values ('c1111111-1111-4111-8111-111111111111', 'Huérfano', 'Otros') $$,
  '23502',
  null,
  'Un hábito sin routine_id no se puede insertar (not null)'
);

-- Borrar la rutina se lleva sus hábitos: sin rutina no pueden existir
delete from public.routines where id = 'c3333333-3333-4333-8333-333333333333';
select is_empty(
  $$ select 1 from public.habits where id = 'c4444444-4444-4444-8444-444444444444' $$,
  'Borrar la rutina borra sus hábitos (on delete cascade)'
);

-- El guard: no puedes colgar tu hábito de la rutina de otro
insert into public.routines (id, user_id, name, frequency)
values ('c5555555-5555-4555-8555-555555555555', 'c1111111-1111-4111-8111-111111111111', 'Propia', 'Diario');

set local role postgres;
insert into public.routines (id, user_id, name, frequency)
values ('c6666666-6666-4666-8666-666666666666', 'c2222222-2222-4222-8222-222222222222', 'Ajena', 'Diario');
set local role authenticated;

select throws_ok(
  $$ insert into public.habits (user_id, name, category, routine_id)
     values ('c1111111-1111-4111-8111-111111111111', 'Colado', 'Otros', 'c6666666-6666-4666-8666-666666666666') $$,
  'P0001',
  'Solo puedes poner un hábito en una rutina tuya.',
  'No puedes colgar un hábito de la rutina de otra cuenta (guard_habit_routine_owner)'
);

-- Y el otro usuario sigue sin ver nada (BR-027)
select set_config('request.jwt.claims', json_build_object('sub', 'c2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select is_empty(
  $$ select 1 from public.habits where user_id = 'c1111111-1111-4111-8111-111111111111' $$,
  'Otro usuario no ve los hábitos del titular (BR-027)'
);

select * from finish();
rollback;
```

- [ ] **Paso 8: Arreglar las tres pruebas pgTAP que insertan hábitos sin rutina**

Las tres fallarán con `23502` en cuanto `routine_id` sea `not null`.

En `supabase/tests/0003_rls_habits_household_budget.sql`, sustituye el `insert into public.habits` (línea 27) por una rutina anclada al bloque más el hábito dentro:

```sql
-- Desde 0045 el bloque horario lo ancla la RUTINA, no cada hábito, y ningún
-- hábito existe fuera de una rutina.
insert into public.routines (id, user_id, name, frequency, occupation_id)
values ('cccccccc-1111-4ccc-8ccc-cccccccccccc', '99999999-9999-4999-8999-999999999999', 'Lectura de noche', 'Diario', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

insert into public.habits (id, user_id, name, routine_id)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '99999999-9999-4999-8999-999999999999', 'Leer', 'cccccccc-1111-4ccc-8ccc-cccccccccccc');
```

La primera aserción («El hábito sobrevive a la eliminación de su ocupación») se queda tal cual: sigue siendo cierta, ahora porque el hábito nunca dependió del bloque. La segunda, que mira `habits.occupation_id`, apunta a una columna que ya no existe; sustitúyela por la equivalente sobre la rutina:

```sql
select is(
  (select occupation_id from public.routines where id = 'cccccccc-1111-4ccc-8ccc-cccccccccccc'),
  null,
  'occupation_id de la rutina queda en null tras eliminar la ocupación (BR-026), y el hábito ni se entera'
);
```

El número de aserciones no cambia, así que el `select plan(N)` de este archivo se queda como está.

En `supabase/tests/0007_rls_development.sql`:

1. Antes del `insert into public.habits` (línea 32), mueve el `insert into public.routines` que hoy está debajo, y añade `routine_id` al hábito:

```sql
insert into public.routines (id, user_id, name, occupation_id)
values ('77777777-7777-4777-8777-777777777777', '11111111-1111-4111-8111-111111111111', 'Rutina matutina', '55555555-5555-4555-8555-555555555555');

insert into public.habits (id, user_id, name, routine_id)
values ('66666666-6666-4666-8666-666666666666', '11111111-1111-4111-8111-111111111111', 'Meditar', '77777777-7777-4777-8777-777777777777');
```

2. Borra el `insert into public.routine_steps` (línea 38).
3. Sustituye la aserción «habit_id del paso queda en null al borrar el hábito, el paso sobrevive» por:

```sql
-- Desde 0045 no hay pasos: borrar el hábito borra la fila y la rutina se queda
-- sin él. Lo que 0024 protegía —que la racha no se bifurcara— ya no puede
-- ocurrir, porque no hay dos registros que reconciliar.
select is(
  (select count(*)::int from public.habits where routine_id = '77777777-7777-4777-8777-777777777777'),
  0,
  'Borrar el hábito lo quita de la rutina, no deja un paso huérfano'
);
```

4. Borra la aserción «Otro usuario no ve los pasos de rutina del titular, protegidos vía el padre» y baja `select plan(10)` a `select plan(9)`.

En `supabase/tests/0013_rls_desarrollo_personal.sql`, el `insert into public.habits` de la línea 32 crea dos hábitos de dos usuarios distintos, y corre con el rol `postgres` (antes del `set local role authenticated`). Cada uno necesita una rutina suya. Sustituye ese `insert` por:

```sql
insert into public.routines (id, user_id, name, frequency) values
  ('f6666666-6666-4666-8666-666666666666', 'f1111111-1111-4111-8111-111111111111', 'Rutina del titular', 'Diario'),
  ('f7777777-7777-4777-8777-777777777777', 'f2222222-2222-4222-8222-222222222222', 'Rutina del otro', 'Diario')
on conflict (id) do nothing;

insert into public.habits (id, user_id, name, routine_id) values
  ('f4444444-4444-4444-8444-444444444444', 'f1111111-1111-4111-8111-111111111111', 'Leer', 'f6666666-6666-4666-8666-666666666666'),
  ('f5555555-5555-4555-8555-555555555555', 'f2222222-2222-4222-8222-222222222222', 'Correr (de otro)', 'f7777777-7777-4777-8777-777777777777')
on conflict (id) do nothing;
```

Las aserciones de ese archivo no cambian: siguen probando `habits_no_self_stack` y el trigger de apilamiento de 0033, que 0045 no toca.

- [ ] **Paso 9: Correr la suite de base entera**

Ejecuta: `supabase db reset && supabase db test`

Esperado: PASA. Todos los archivos de `supabase/tests/`, incluido el nuevo `0021`.

Si `supabase db reset` falla, será en `seed.sql`, que todavía inserta hábitos con `frequency` y `occupation_id`. Arréglalo aquí mismo con lo mínimo para que el reset pase (crear una rutina y colgarle el hábito); el retoque completo de la semilla es la tarea 8.

- [ ] **Paso 10: Commit**

```bash
git add supabase/migrations/0045_habitos_dentro_de_rutinas.sql \
        supabase/tests/0021_habitos_en_rutinas.sql \
        scripts/backfill/ \
        scripts/verificar-backfill-0045.sh \
        supabase/tests/0003_rls_habits_household_budget.sql \
        supabase/tests/0007_rls_development.sql \
        supabase/tests/0013_rls_desarrollo_personal.sql \
        supabase/seed.sql
git commit -m "$(cat <<'EOF'
Meter cada hábito dentro de la rutina que tira de él

habits gana routine_id obligatorio, position y duration_min, y absorbe lo que
era routine_steps. Se van habits.frequency y habits.occupation_id: la rutina ya
decía las dos cosas, y dos sitios diciendo lo mismo es un sitio donde mentir.

El backfill reconstruye la intención que ya estaba en los datos —quien ató tres
hábitos al bloque "Mañana" ya había dicho que forman una rutina— en vez de
tirarla a una carpeta genérica. scripts/verificar-backfill-0045.sh lo comprueba
sobre datos con la forma vieja, que es la única forma de probarlo: una prueba
pgTAP normal corre sobre el esquema ya migrado.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tarea 3: Las acciones del servidor se mudan a la rutina

**Archivos:**
- Modificar: `src/app/(app)/development/routines/actions.ts`
- Borrar: `src/app/(app)/development/habits/actions.ts`
- Regenerar: `src/types/database.types.ts`

**Interfaces:**
- Consume: de la tarea 1, `toggleHabitEffect`, `routineRunComplete`; de la tarea 2, el esquema nuevo.
- Produce, desde `@/app/(app)/development/routines/actions`:
  - `upsertRoutine(id: string | null, formData: FormData): Promise<void>`
  - `deleteRoutine(id: string): Promise<void>`
  - `upsertHabit(routineId: string, id: string | null, formData: FormData): Promise<void>`
  - `deleteHabit(id: string): Promise<void>`
  - `toggleHabitToday(routineId: string, habitId: string): Promise<void>`
  - `createRoutineFromTemplate(templateId: string, occupationId: string): Promise<ActionResult & { id?: string }>` (firma intacta; el cuerpo cambia en la tarea 6)
  - Desaparecen `upsertRoutineStep` y `deleteRoutineStep`.

- [ ] **Paso 1: Regenerar los tipos de la base**

Ejecuta: `supabase start` (si no está levantada) y luego `pnpm gen:types:local`

Esperado: `src/types/database.types.ts` cambia — `habits` gana `routine_id`, `position` y `duration_min` y pierde `frequency` y `occupation_id`; `routines` gana `identity`; `routine_steps` desaparece; `routine_runs` pierde `completed_step_ids`.

Comprueba: `grep -c "routine_steps" src/types/database.types.ts` → debe imprimir `0`.

- [ ] **Paso 2: Ver el alcance de la rotura**

Ejecuta: `pnpm typecheck`

Esperado: FALLA, con errores en `routines/actions.ts`, `habits/actions.ts`, las páginas y los formularios. Anota la lista: es el mapa de las tareas 3 a 5.

- [ ] **Paso 3: Reescribir las acciones**

En `src/app/(app)/development/routines/actions.ts`:

Cambia el import del dominio:

```ts
import { toggleHabitEffect, routineRunComplete } from "@/lib/domain/development/routines.ts";
```

Añade `identity` al esquema y al payload de la rutina:

```ts
const routineSchema = z.object({
  name: z.string().min(1),
  frequency: z.enum(["Diario", "Semanal", "Entre semana", "Fin de semana"]),
  occupationId: z.string().uuid().optional().or(z.literal("")),
  // Cap. 2 de «Hábitos atómicos»: opcional, porque una rutina sin identidad
  // sigue siendo una rutina — solo que sostenida por fuerza de voluntad.
  identity: z.string().max(160).optional().default(""),
  active: z.coerce.boolean().default(true)
});
```

En `upsertRoutine`, añade `identity: formData.get("identity") ?? ""` al objeto que se le pasa a `routineSchema.parse`, y `identity: parsed.identity.trim()` al `payload`.

Borra entero el bloque que va desde `const stepSchema = z.object({` hasta el final de `deleteRoutineStep`, y también la función `toggleRoutineStep` completa. En su lugar, pega:

```ts
const habitSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["Salud", "Aprendizaje", "Trabajo", "Personal", "Otros"]),
  durationMin: z.coerce.number().int().min(1).default(5),
  position: z.coerce.number().int().min(0).default(0),
  // Los tres campos de «Hábitos atómicos» (migración 0033). Opcionales: un
  // hábito sin señal sigue siendo un hábito válido, solo que más frágil.
  cue: z.string().max(240).optional().default(""),
  twoMinVersion: z.string().max(240).optional().default(""),
  stackAfterHabitId: z.string().uuid().optional().or(z.literal(""))
});

/**
 * Crear o editar un hábito. `routineId` es un parámetro y no un campo del
 * formulario porque desde 0045 no hay hábito sin rutina: el formulario se abre
 * siempre desde dentro de una, y no hay estado en el que la pregunta «¿de qué
 * rutina?» quede abierta.
 *
 * Ya no recibe `frequency` —la dicta la rutina— ni `occupationId` —el bloque lo
 * ancla la rutina—. Las dos columnas se fueron en 0045.
 */
export async function upsertHabit(routineId: string, id: string | null, formData: FormData) {
  const parsed = habitSchema.parse({
    name: formData.get("name"),
    category: formData.get("category"),
    durationMin: formData.get("durationMin") ?? 5,
    position: formData.get("position") ?? 0,
    cue: formData.get("cue") ?? "",
    twoMinVersion: formData.get("twoMinVersion") ?? "",
    stackAfterHabitId: formData.get("stackAfterHabitId") ?? ""
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    name: parsed.name,
    category: parsed.category,
    routine_id: routineId,
    position: parsed.position,
    duration_min: parsed.durationMin,
    cue: parsed.cue.trim(),
    two_min_version: parsed.twoMinVersion.trim(),
    stack_after_habit_id: parsed.stackAfterHabitId || null
  };

  if (id) {
    const { error } = await supabase.from("habits").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("habits").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
}

export async function deleteHabit(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("habits").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
}

/**
 * Marca o desmarca el hábito de hoy, y de paso abre o cierra la ejecución de su
 * rutina.
 *
 * Un solo registro: `habit_logs`. Antes de 0045 había dos —el paso en
 * `routine_runs.completed_step_ids` y el hábito en `habit_logs`— y esta acción
 * tenía que reconciliarlos. Ahora `routine_runs` solo guarda CUÁNDO se cerró la
 * rutina, y quién decide si está cerrada es `routineRunComplete`.
 */
export async function toggleHabitToday(routineId: string, habitId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const today = todayLocal(await getUserTimeZone());

  const [{ data: log }, { data: habits }] = await Promise.all([
    supabase.from("habit_logs").select("id").eq("habit_id", habitId).eq("log_date", today).maybeSingle(),
    supabase.from("habits").select("id").eq("routine_id", routineId)
  ]);

  if (toggleHabitEffect(Boolean(log)) === "delete") {
    const { error } = await supabase.from("habit_logs").delete().eq("id", log!.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.uncomplete", object: habitId });
  } else {
    const { error } = await supabase.from("habit_logs").insert({ habit_id: habitId, log_date: today });
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.complete", object: habitId });
  }

  // Se relee el día DESPUÉS de escribir: así el cierre de la rutina refleja el
  // estado real y no el que teníamos antes del clic.
  const habitIds = (habits ?? []).map((h) => h.id);
  const { data: logsHoy } = await supabase
    .from("habit_logs")
    .select("habit_id")
    .eq("log_date", today)
    .in("habit_id", habitIds.length > 0 ? habitIds : ["00000000-0000-0000-0000-000000000000"]);

  const cerrada = routineRunComplete(habitIds, (logsHoy ?? []).map((l) => l.habit_id));

  // upsert con onConflict: dos clics simultáneos no crean dos ejecuciones del
  // mismo día — el índice único (routine_id, local_date) lo resuelve en la base.
  // `started_at` no viaja en el payload, así que la primera hora se conserva.
  const { error } = await supabase
    .from("routine_runs")
    .upsert(
      { routine_id: routineId, local_date: today, completed_at: cerrada ? new Date().toISOString() : null },
      { onConflict: "routine_id,local_date" }
    );
  if (error) throw new Error(error.message);

  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
}
```

- [ ] **Paso 4: Borrar las acciones viejas de hábito**

Ejecuta: `git rm "src/app/(app)/development/habits/actions.ts"`

- [ ] **Paso 5: Comprobar que este archivo ya no tiene errores propios**

Ejecuta: `pnpm typecheck 2>&1 | grep "development/routines/actions.ts"`

Esperado: no imprime nada. `pnpm typecheck` en general **sigue fallando** por las páginas y los formularios; eso es lo que arreglan las tareas 4 y 5.

- [ ] **Paso 6: Commit**

```bash
git add src/app/\(app\)/development/routines/actions.ts src/types/database.types.ts
git commit -m "$(cat <<'EOF'
Que crear un hábito sea crear un eslabón de una rutina

upsertHabit se muda a las acciones de rutina y recibe routineId como parámetro,
no como campo: desde 0045 no existe el estado en el que la pregunta "¿de qué
rutina?" siga abierta. Pierde frequency y occupationId, que ya no son suyos.

toggleHabitToday sustituye a toggleRoutineStep y a la vieja toggleHabitToday.
Escribe en habit_logs, relee el día y deja que routineRunComplete decida si la
ejecución se cierra. Ya no hay dos registros que reconciliar.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tarea 4: Los formularios y la fila del hábito

**Archivos:**
- Mover y modificar: `src/app/(app)/development/habits/HabitForm.tsx` → `src/app/(app)/development/routines/HabitForm.tsx`
- Mover y modificar: `src/app/(app)/development/habits/HabitRow.tsx` → `src/app/(app)/development/routines/HabitRow.tsx`
- Modificar: `src/app/(app)/development/routines/RoutineForm.tsx`

**Interfaces:**
- Consume: de la tarea 3, `upsertHabit`, `deleteHabit`, `toggleHabitToday`, `upsertRoutine`, `deleteRoutine`.
- Produce:
  - `routines/HabitForm.tsx` — `default HabitForm({ routineId, habit?, otherHabits?, prefill?, label?, position? })`, y `HabitFields({ routineId, habit?, otherHabits, prefill?, position, close })`. Tipos exportados: `HabitLite`, `HabitOption`, `HabitPrefill`.
  - `routines/HabitRow.tsx` — `default HabitRow({ routineId, habit, doneToday, streak, action? })`, con `habit: { id, name, category, durationMin, cue, twoMinVersion, stackAfterName }`.
  - `routines/RoutineForm.tsx` — `default RoutineForm({ routine?, occupations })` con `routine: { id, name, frequency, occupationId, identity, active }`. Desaparecen `StepForm`, `StepFields` y los tipos `StepLite` y `HabitLite`. Sigue exportando `OccupationLite`, que importan `page.tsx` y las plantillas.

- [ ] **Paso 1: Mover los dos archivos**

```bash
git mv "src/app/(app)/development/habits/HabitForm.tsx" "src/app/(app)/development/routines/HabitForm.tsx"
git mv "src/app/(app)/development/habits/HabitRow.tsx" "src/app/(app)/development/routines/HabitRow.tsx"
```

- [ ] **Paso 2: Adaptar `HabitForm.tsx`**

En `src/app/(app)/development/routines/HabitForm.tsx`:

Sustituye la interfaz `HabitLite` y borra la interfaz local `OccupationLite` (ya no se usa):

```ts
export interface HabitLite {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  cue: string;
  twoMinVersion: string;
  stackAfterHabitId: string | null;
}
```

Cambia `HabitPrefill` para que no lleve frecuencia:

```ts
export interface HabitPrefill {
  name: string;
  category: string;
  cue: string;
  twoMinVersion: string;
}
```

Cambia las props de los dos componentes: fuera `occupations`, dentro `routineId` y `position`.

```ts
export default function HabitForm({
  routineId,
  habit,
  otherHabits = [],
  prefill,
  label,
  position = 0
}: {
  routineId: string;
  habit?: HabitLite;
  otherHabits?: HabitOption[];
  prefill?: HabitPrefill;
  label?: string;
  /** Posición por defecto de un hábito nuevo: el final de la rutina. */
  position?: number;
}) {
  return (
    <FormSheet
      label={label ?? (habit ? "Editar" : "+ Hábito")}
      title={habit ? "Editar hábito" : "Nuevo hábito"}
      variant={habit ? "ghost" : "primary"}
    >
      {(close) => (
        <HabitFields
          routineId={routineId}
          habit={habit}
          otherHabits={otherHabits}
          prefill={prefill}
          position={position}
          close={close}
        />
      )}
    </FormSheet>
  );
}
```

En `HabitFields`, cambia la firma igual (fuera `occupations`, dentro `routineId` y `position: number`), el import a `import { upsertHabit, deleteHabit } from "./actions";` y la llamada a `await upsertHabit(routineId, habit?.id ?? null, fd);`.

Dentro del formulario: sustituye el `<div className="grid grid-cols-1 sm:grid-cols-2 gap-3">` que contiene Frecuencia y Categoría por este, que cambia frecuencia por duración:

```tsx
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Categoría">
          <select name="category" defaultValue={habit?.category ?? prefill?.category ?? "Salud"}>
            <option>Salud</option>
            <option>Aprendizaje</option>
            <option>Trabajo</option>
            <option>Personal</option>
            <option>Otros</option>
          </select>
        </Field>
        <Field label="Minutos">
          <input name="durationMin" type="number" min={1} defaultValue={habit?.durationMin ?? 5} required />
        </Field>
      </div>

      <Field label="Orden dentro de la rutina">
        <input name="position" type="number" min={0} defaultValue={position} />
      </Field>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        El orden ES el apilamiento: cada hábito se dispara después del anterior.
      </p>
```

El orden es un campo visible y editable, no un dato oculto: desde 0045 es lo que dice «después de qué», así que esconderlo dejaría el apilamiento sin forma de corregirse. Quien renderiza el formulario pasa `position={habit.position}` al editar y `position={habits.length}` al crear (tarea 5).

Sustituye el bloque completo del bloque horario (el `<Field label="Bloque de Autogestión del Tiempo">` con su `<p>` explicativo) por:

```tsx
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        La frecuencia y el bloque horario los pone la rutina: este hábito toca cuando toca ella.
      </p>
```

- [ ] **Paso 3: Adaptar `HabitRow.tsx`**

En `src/app/(app)/development/routines/HabitRow.tsx`: borra la interfaz `OccupationLite`, y cambia las props y el cuerpo:

```tsx
export default function HabitRow({
  routineId,
  habit,
  doneToday,
  streak,
  action
}: {
  routineId: string;
  habit: {
    id: string;
    name: string;
    category: string;
    durationMin: number;
    /** «Después de X…» — la intención de implementación (migración 0033). */
    cue: string;
    twoMinVersion: string;
    /** Nombre del hábito ancla, ya resuelto en el servidor. */
    stackAfterName: string | null;
  };
  doneToday: boolean;
  streak: number;
  /** Botón de edición: viaja desde el Server Component para vivir en la fila. */
  action?: ReactNode;
}) {
```

Cambia la llamada del botón a `onClick={() => startTransition(() => toggleHabitToday(routineId, habit.id))}`.

Y en la línea de metadatos, sustituye frecuencia y ocupación por duración y categoría:

```tsx
          <span className="text-xs" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
            {habit.durationMin} min · {habit.category}
          </span>
```

- [ ] **Paso 4: Adaptar `RoutineForm.tsx`**

En `src/app/(app)/development/routines/RoutineForm.tsx`:

Cambia el import a `import { upsertRoutine, deleteRoutine } from "./actions";`

Añade `identity` a `RoutineLite`:

```ts
interface RoutineLite {
  id: string;
  name: string;
  frequency: string;
  occupationId: string | null;
  identity: string;
  active: boolean;
}
```

Después del campo «Nombre de la rutina», añade el de identidad:

```tsx
      <Field label="¿En quién te conviertes al sostenerla?">
        <input
          name="identity"
          placeholder="Ej. soy alguien que no negocia sus mañanas"
          defaultValue={routine?.identity ?? ""}
          maxLength={160}
          autoCapitalize="sentences"
        />
      </Field>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Opcional, y lo más útil del formulario. Una rutina se abandona cuando compite con quien crees que eres, y se
        sostiene cuando lo confirma.
      </p>
```

Borra `StepForm`, `StepFields` y la interfaz `StepLite` — todo el bloque desde `interface StepLite {` hasta el final del archivo.

Borra también `export interface HabitLite { id: string; name: string }`: existía solo para el selector de hábito de `StepForm` y no la importa nadie más (compruébalo con `grep -rn "HabitLite" --include=*.tsx src` antes de borrarla). `OccupationLite` sí se queda: la importan `page.tsx` y las plantillas.

- [ ] **Paso 5: Comprobar los tres archivos**

Ejecuta: `pnpm typecheck 2>&1 | grep -E "HabitForm|HabitRow|RoutineForm"`

Esperado: no imprime nada. El typecheck global sigue rojo por `routines/page.tsx`, `habits/page.tsx`, `development/page.tsx` y las plantillas.

Ejecuta: `pnpm lint`

Esperado: sin errores en los tres archivos.

- [ ] **Paso 6: Commit**

```bash
git add -A "src/app/(app)/development/routines" "src/app/(app)/development/habits"
git commit -m "$(cat <<'EOF'
Mudar el formulario del hábito a la casa de la rutina

HabitForm y HabitRow se van a routines/, que es donde se usan desde 0045. El
formulario pierde frecuencia y bloque horario —los pone la rutina— y gana
duración y orden. El orden no es decoración: es el apilamiento, y por eso se
edita como un dato y no se deduce.

RoutineForm gana la identidad y pierde StepForm, que ya no tiene tabla detrás.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tarea 5: La pantalla única, la navegación y el panel

**Archivos:**
- Modificar: `src/app/(app)/development/routines/RoutineRunner.tsx`
- Modificar: `src/app/(app)/development/routines/page.tsx`
- Reemplazar: `src/app/(app)/development/habits/page.tsx`
- Modificar: `src/app/(app)/development/page.tsx`
- Modificar: `src/components/nav-items.ts`

**Interfaces:**
- Consume: de la tarea 4, `HabitRow`, `HabitForm`, `RoutineForm`; de la tarea 1, `routineProgress`, `routineFitsBlock`, `routineDueToday`, `routineAdherence`.
- Produce: `RoutineRunner` con `{ routineId, habits: RunnerHabit[], today }`, donde `RunnerHabit = { id, name, category, durationMin, cue, twoMinVersion, stackAfterName, doneToday, streak, action? }`.

- [ ] **Paso 1: Reescribir `RoutineRunner.tsx`**

Sustituye el archivo entero por:

```tsx
"use client";

import type { ReactNode } from "react";
import HabitRow from "./HabitRow";

export interface RunnerHabit {
  id: string;
  name: string;
  category: string;
  durationMin: number;
  cue: string;
  twoMinVersion: string;
  stackAfterName: string | null;
  doneToday: boolean;
  streak: number;
  /** Botón de edición del hábito; llega ya renderizado desde el servidor. */
  action?: ReactNode;
}

/**
 * El ejecutor ya no pinta casillas propias: pinta filas de hábito, que son las
 * mismas que se veían en /development/habits antes de 0045. Una sola forma de
 * marcar un hábito en toda la aplicación.
 *
 * `today` llega como prop desde el Server Component (D-018): el cliente nunca
 * calcula la fecha, porque la fecha correcta es la de la zona horaria del
 * perfil, no la del navegador.
 */
export default function RoutineRunner({
  routineId,
  habits,
  today
}: {
  routineId: string;
  habits: RunnerHabit[];
  today: string;
}) {
  if (!habits.length) {
    return (
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        Esta rutina todavía no tiene hábitos.
      </p>
    );
  }

  return (
    <div className="mt-2.5 flex flex-col">
      {habits.map((h) => (
        <HabitRow
          key={h.id}
          routineId={routineId}
          habit={{
            id: h.id,
            name: h.name,
            category: h.category,
            durationMin: h.durationMin,
            cue: h.cue,
            twoMinVersion: h.twoMinVersion,
            stackAfterName: h.stackAfterName
          }}
          doneToday={h.doneToday}
          streak={h.streak}
          action={h.action}
        />
      ))}
      <p className="text-xs mt-2" style={{ color: "var(--muted)" }}>
        Ejecución del {today}.
      </p>
    </div>
  );
}
```

- [ ] **Paso 2: Reescribir `routines/page.tsx`**

Sustituye el archivo entero por:

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, Progress } from "@/components/ui";
import { todayLocal, addDaysISO } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import {
  routineDueToday,
  routineProgress,
  routineFitsBlock,
  routineAdherence,
  type Frequency
} from "@/lib/domain/development/routines.ts";
import { habitStreak, habitDoneToday } from "@/lib/domain/habits.ts";
import { CardHeader, ModuleNote, SectionHeader } from "../FormSheet";
import RoutineForm, { type OccupationLite } from "./RoutineForm";
import RoutineTemplates from "./RoutineTemplates";
import HabitTemplates from "./HabitTemplates";
import HabitForm from "./HabitForm";
import RoutineRunner, { type RunnerHabit } from "./RoutineRunner";
import { listTemplates } from "@/lib/data/templates";
import { getSessionUser } from "@/lib/data/session";

export default async function RoutinesPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // "Hoy" se calcula ANTES de consultar: la ventana de adherencia depende de él.
  const today = todayLocal(await getUserTimeZone());
  const from = addDaysISO(today, -29);

  const [{ data: routines }, { data: habits }, { data: occupations }, { data: habitLogs }, { data: runs }] =
    await Promise.all([
      supabase.from("routines").select("*").order("position"),
      supabase.from("habits").select("*").order("position"),
      supabase.from("occupations").select("id, title, start_time, end_time"),
      supabase.from("habit_logs").select("habit_id, log_date"),
      supabase.from("routine_runs").select("*").gte("local_date", from).lte("local_date", today)
    ]);

  const occById = new Map((occupations ?? []).map((o) => [o.id, o]));
  const habitById = new Map((habits ?? []).map((h) => [h.id, h.name]));
  const logs = (habitLogs ?? []).map((l) => ({ habitId: l.habit_id, date: l.log_date }));
  const doneToday = new Set(logs.filter((l) => l.date === today).map((l) => l.habitId));

  const occOptions: OccupationLite[] = (occupations ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    start: o.start_time.slice(0, 5),
    end: o.end_time.slice(0, 5)
  }));
  // Candidatos para apilar: todos los hábitos del usuario, de cualquier rutina.
  // El apilamiento puede cruzar rutinas; el orden solo describe el de la propia.
  const habitOptions = (habits ?? []).map((h) => ({ id: h.id, name: h.name }));

  const rows = (routines ?? []).map((r) => {
    const own = (habits ?? []).filter((h) => h.routine_id === r.id);
    const habitLikes = own.map((h) => ({ id: h.id, durationMin: h.duration_min }));
    const occ = r.occupation_id ? occById.get(r.occupation_id) ?? null : null;
    const block = occ ? { start: occ.start_time, end: occ.end_time } : null;
    const completedDates = (runs ?? [])
      .filter((x) => x.routine_id === r.id && x.completed_at !== null)
      .map((x) => x.local_date);
    const doneIds = own.filter((h) => doneToday.has(h.id)).map((h) => h.id);

    return {
      routine: r,
      habits: own,
      runnerHabits: own.map<RunnerHabit>((h) => ({
        id: h.id,
        name: h.name,
        category: h.category,
        durationMin: h.duration_min,
        cue: h.cue,
        twoMinVersion: h.two_min_version,
        stackAfterName: h.stack_after_habit_id ? habitById.get(h.stack_after_habit_id) ?? null : null,
        doneToday: habitDoneToday(h.id, logs, today),
        streak: habitStreak(h.id, logs, today),
        action: (
          <HabitForm
            routineId={r.id}
            position={h.position}
            otherHabits={habitOptions}
            habit={{
              id: h.id,
              name: h.name,
              category: h.category,
              durationMin: h.duration_min,
              cue: h.cue,
              twoMinVersion: h.two_min_version,
              stackAfterHabitId: h.stack_after_habit_id
            }}
          />
        )
      })),
      due: routineDueToday(r.frequency as Frequency, today),
      progress: routineProgress(doneIds, habitLikes),
      fits: routineFitsBlock(habitLikes, block),
      occ,
      adherence: routineAdherence(completedDates, r.frequency as Frequency, from, today)
    };
  });

  const hoy = rows.filter((r) => r.due && r.routine.active);
  const otras = rows.filter((r) => !r.due || !r.routine.active);

  function renderRoutine(row: (typeof rows)[number], dimmed: boolean) {
    const { routine, occ, progress, fits, adherence, runnerHabits, habits: own } = row;
    return (
      <Card key={routine.id}>
        <div style={dimmed ? { opacity: 0.65 } : undefined}>
          <CardHeader
            title={routine.name}
            meta={
              <>
                <Chip kind="info">{routine.frequency}</Chip>
                {!routine.active && <Chip>Inactiva</Chip>}
                {occ && (
                  <Chip kind="purple">
                    {occ.title} {occ.start_time.slice(0, 5)}–{occ.end_time.slice(0, 5)}
                  </Chip>
                )}
                {!fits && <Chip kind="warn">No cabe en el bloque</Chip>}
                <Chip kind={adherence >= 70 ? "ok" : adherence >= 40 ? "warn" : "bad"}>{adherence}% a 30 días</Chip>
              </>
            }
            action={
              <RoutineForm
                routine={{
                  id: routine.id,
                  name: routine.name,
                  frequency: routine.frequency,
                  occupationId: routine.occupation_id,
                  identity: routine.identity,
                  active: routine.active
                }}
                occupations={occOptions}
              />
            }
          />
        </div>

        {/* La identidad preside la rutina y no se esconde en el formulario:
            su trabajo es recordarte por qué la sostienes, y encerrada en la
            pantalla de edición no la lee nadie. */}
        {routine.identity && (
          <p className="ah-why mt-2">{routine.identity}</p>
        )}

        <div className="mt-2.5">
          <div className="flex justify-between gap-2 text-xs mb-1" style={{ color: "var(--muted)" }}>
            <span>
              {progress.done} de {progress.total} hábitos
            </span>
            <span className="flex-shrink-0">{progress.remainingMin} min por delante</span>
          </div>
          <Progress pct={progress.pct} kind={!fits ? "warn" : undefined} />
        </div>

        <RoutineRunner routineId={routine.id} habits={runnerHabits} today={today} />

        <div className="mt-2.5">
          <HabitForm routineId={routine.id} position={own.length} otherHabits={habitOptions} label="+ Hábito" />
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3.5">
      <ModuleNote>
        Cada hábito vive dentro de una rutina y toca cuando toca ella. El bloque horario sigue viviendo en Autogestión
        del Tiempo: la rutina se ancla a uno que ya existe. Todo esto es privado, sin relación con Workspaces (BR-027).
      </ModuleNote>

      <SectionHeader
        action={
          <span className="flex gap-2">
            <HabitTemplates
              routines={(routines ?? []).map((r) => ({ id: r.id, name: r.name }))}
              otherHabits={habitOptions}
              templates={await listTemplates("habit")}
            />
            <RoutineTemplates occupations={occOptions} templates={await listTemplates("routine")} />
            <RoutineForm occupations={occOptions} />
          </span>
        }
      >
        Rutinas de hoy
      </SectionHeader>

      {!rows.length && (
        <Card>
          <EmptyState
            icon="🔁"
            text="Crea tu primera rutina, o parte de una plantilla: Mañana Milagrosa (S.A.V.E.R.S.) o el Club de las 5 AM (20/20/20). Ánclala a un bloque de tu Autogestión del Tiempo, y sus hábitos llevarán racha desde el primer día."
          />
        </Card>
      )}

      {rows.length > 0 && !hoy.length && (
        <Card>
          <EmptyState icon="🔁" text="Hoy no toca ninguna rutina." />
        </Card>
      )}

      {hoy.map((r) => renderRoutine(r, false))}

      {otras.length > 0 && (
        <>
          <h3 className="font-bold mt-2">Otras rutinas</h3>
          {otras.map((r) => renderRoutine(r, true))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Paso 3: Convertir `habits/page.tsx` en un redirect**

Sustituye `src/app/(app)/development/habits/page.tsx` entero por:

```tsx
import { redirect } from "next/navigation";

/**
 * Desde 0045 no hay hábitos sueltos que listar: cada uno vive dentro de su
 * rutina, y se ve y se marca allí.
 *
 * La ruta no se borra porque hay enlaces vivos apuntando aquí —el panel del
 * módulo, Metas Personales, y lo que el usuario tenga guardado— y un 404 no
 * explica nada.
 */
export default function HabitsPage() {
  redirect("/development/routines");
}
```

- [ ] **Paso 4: Actualizar la navegación**

En `src/components/nav-items.ts`, sustituye las dos entradas de rutinas y hábitos por una sola:

```ts
  { href: "/development/routines", label: "Rutinas y Hábitos", group: "Personal Development OS", icon: "routines", color: "var(--c-orange)" },
  // "Hábitos" ya no es una entrada: desde 0045 un hábito no existe fuera de su
  // rutina, así que una pantalla propia solo podía enseñar una lista sin el
  // contexto que la hace legible. /development/habits sobrevive como redirect.
  { href: "/development/habits", label: "Hábitos", group: "Personal Development OS", icon: "habits", color: "var(--c-orange)", hidden: true },
```

El item oculto se queda porque de esta lista sale el título de la barra superior, igual que se explica para `/notebooks` y `/admin`.

- [ ] **Paso 5: Actualizar el panel del módulo**

En `src/app/(app)/development/page.tsx`, en el `Promise.all`, sustituye la consulta de pasos:

```ts
    supabase.from("routine_steps").select("*").order("position"),
```

por:

```ts
    supabase.from("habits").select("id, routine_id, duration_min").order("position"),
```

Renombra la variable desestructurada `steps` a `habits` y, donde el archivo calcule el progreso de una rutina, sustituye el filtrado de pasos y la llamada a `routineProgress`. Busca el uso de `routineProgress` en el archivo y adáptalo a la firma nueva: necesita los ids de hábito con registro de hoy, así que añade también al `Promise.all`:

```ts
    supabase.from("habit_logs").select("habit_id").eq("log_date", today),
```

y calcula:

```ts
  const propios = (habits ?? []).filter((h) => h.routine_id === r.id);
  const hechos = (logsHoy ?? []).map((l) => l.habit_id);
  const progress = routineProgress(hechos, propios.map((h) => ({ id: h.id, durationMin: h.duration_min })));
```

Si el archivo muestra en algún sitio la palabra «pasos», cámbiala por «hábitos».

- [ ] **Paso 6: Comprobar tipos, lint y build**

Ejecuta: `pnpm typecheck`

Esperado: quedan errores **solo** en `RoutineTemplates.tsx`, en `HabitTemplates.tsx` y en `admin/`. Los arregla la tarea 6. En concreto, `routines/page.tsx` importa `./HabitTemplates`, un archivo que todavía vive en `habits/`: el import estará roto hasta el paso 5 de la tarea 6, que es el que lo mueve. Es deuda de una tarea, no un despiste. Si aparecen errores en cualquier otro archivo, arréglalos aquí.

Ejecuta: `pnpm lint`

Esperado: sin errores nuevos.

- [ ] **Paso 7: Commit**

```bash
git add -A "src/app/(app)/development" src/components/nav-items.ts
git commit -m "$(cat <<'EOF'
Enseñar la rutina de hoy con sus hábitos dentro, y no dos listas

Una sola pantalla: arriba lo que toca hoy en modo ejecución, con la identidad
de la rutina presidiendo y la racha de cada hábito en su propia fila; debajo,
las demás. El ejecutor deja de pintar casillas propias y pinta filas de hábito,
así que marcar un hábito se ve y se hace igual en toda la aplicación.

/development/habits queda como redirect: hay enlaces vivos apuntando ahí y un
404 no explica nada.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tarea 6: Las plantillas siembran hábitos, no pasos

**Archivos:**
- Mover y modificar: `src/app/(app)/development/habits/HabitTemplates.tsx` → `src/app/(app)/development/routines/HabitTemplates.tsx`
- Modificar: `src/app/(app)/development/routines/RoutineTemplates.tsx`
- Modificar: `src/app/(app)/development/routines/actions.ts` (`createRoutineFromTemplate`)
- Modificar: `src/lib/domain/templates/schema.ts`
- Modificar: `src/app/(app)/admin/HabitTemplateFields.tsx`, `src/app/(app)/admin/[kind]/page.tsx`, `src/app/(app)/admin/[kind]/[slug]/page.tsx`
- Modificar: `src/lib/domain/development/templates.ts`
- Probar: `tests/domain/development-templates.test.ts`

**Interfaces:**
- Consume: de la tarea 4, `HabitFields` y `HabitOption`.
- Produce: `HabitTemplates({ routines, otherHabits, templates })` con `routines: { id: string; name: string }[]`. `HabitTemplate` sin campo `frequency`.

**Nota de contexto:** el panel de administración (`src/app/(app)/admin/`, migración 0044) llega de la rama `feat/panel-admin-plantillas`. Si esa rama todavía no está fusionada en esta, los archivos de `admin/` no existirán: sáltate los pasos que los mencionan y anótalo en el commit.

- [ ] **Paso 1: Escribir la prueba que falla**

En `tests/domain/development-templates.test.ts`, busca los tests que construyen una `HabitTemplate` de mentira y quítales el campo `frequency`. Añade al final:

```ts
test("HabitTemplate ya no lleva frecuencia: la dicta la rutina", () => {
  // Se comprueba sobre el esquema, que es donde la ausencia importa: el panel
  // de administración valida contra él antes de publicar una plantilla.
  const plantilla = {
    id: "leer",
    name: "Leer 20 minutos",
    category: "Aprendizaje",
    cue: "Después de meterme a la cama",
    twoMinVersion: "Leer una página",
    why: "Dos minutos que no se pueden fallar",
    frequency: "Diario"
  };
  const parsed = habitTemplateSchema.parse(plantilla) as Record<string, unknown>;
  assert.strictEqual(parsed.frequency, undefined);
});
```

Añade al bloque de imports del archivo:

```ts
import { habitTemplateSchema } from "../../src/lib/domain/templates/schema.ts";
```

- [ ] **Paso 2: Correr la prueba y ver que falla**

Ejecuta: `pnpm exec node --experimental-strip-types --test tests/domain/development-templates.test.ts`

Esperado: FALLA. `parsed.frequency` vale `"Diario"` porque el esquema todavía lo acepta.

- [ ] **Paso 3: Quitar la frecuencia de la plantilla de hábito**

En `src/lib/domain/templates/schema.ts`, en `habitTemplateSchema`, borra la línea `frequency: frecuencia,`. Añade encima del esquema:

```ts
// Sin `frequency` desde 0045: un hábito toca cuando toca su rutina, así que una
// plantilla de hábito que propusiera una frecuencia estaría proponiendo algo
// que el formulario ya no puede guardar.
```

`frecuencia` sigue usándose en `routineTemplateSchema`; no la borres.

En `src/lib/domain/development/templates.ts`, borra `frequency: Frequency;` de la interfaz `HabitTemplate` (la de `RoutineTemplate` se queda).

- [ ] **Paso 4: Correr la prueba y ver que pasa**

Ejecuta: `pnpm exec node --experimental-strip-types --test tests/domain/development-templates.test.ts`

Esperado: PASA.

- [ ] **Paso 5: Mover y adaptar `HabitTemplates.tsx`**

```bash
git mv "src/app/(app)/development/habits/HabitTemplates.tsx" "src/app/(app)/development/routines/HabitTemplates.tsx"
```

En el archivo movido: borra la interfaz `OccupationLite`, cambia el import a `import { HabitFields, type HabitOption } from "./HabitForm";` y sustituye las props `occupations` por `routines` en los dos componentes.

Sustituye el bloque `if (elegida) { ... }` de `Contenido` por este, que añade el paso de elegir rutina destino:

```tsx
  if (elegida) {
    if (!routineId) {
      return (
        <div className="flex flex-col gap-3">
          <button type="button" className="nb-crumb-back" style={{ alignSelf: "flex-start" }} onClick={() => setElegida(null)}>
            ← Todas las plantillas
          </button>
          <div className="ah-why">{elegida.why}</div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            ¿A qué rutina se suma? Un hábito solo se sostiene dentro de una cadena: la rutina es la que decide cuándo
            toca y la que tira de él los días malos.
          </p>
          {routines.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              Todavía no tienes ninguna rutina. Crea una primero —o parte de una plantilla de rutina— y vuelve aquí.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {routines.map((r) => (
                <button key={r.id} type="button" className="ah-card" onClick={() => setRoutineId(r.id)}>
                  <span className="ah-card-name">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <button type="button" className="nb-crumb-back" style={{ alignSelf: "flex-start" }} onClick={() => setRoutineId("")}>
          ← Otra rutina
        </button>
        <div className="ah-why">{elegida.why}</div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Cámbialo todo lo que haga falta antes de guardar: la señal solo funciona si describe <b>tu</b> día.
        </p>
        <HabitFields
          routineId={routineId}
          otherHabits={otherHabits}
          position={0}
          prefill={{
            name: elegida.name,
            category: elegida.category,
            cue: elegida.cue,
            twoMinVersion: elegida.twoMinVersion
          }}
          close={close}
        />
      </div>
    );
  }
```

Añade `const [routineId, setRoutineId] = useState("");` junto al `useState` de `elegida`, y en el `onClick` que hace `setElegida(null)` añade también `setRoutineId("")`.

- [ ] **Paso 6: Que la plantilla de rutina siembre hábitos**

En `src/app/(app)/development/routines/actions.ts`, dentro de `createRoutineFromTemplate`:

Sustituye el comentario del segundo punto de la cabecera de la función (el que empieza «Si un paso corresponde a un hábito que el usuario ya lleva») por:

```
 *   - La plantilla siembra HÁBITOS, no pasos: desde 0045 son lo mismo, así que
 *     cada paso de la plantilla nace con racha propia desde el primer día.
 *     `matchHabitForStep` ya no sirve para ligar —no hay nada que ligar— pero
 *     sí para NO duplicar: si el usuario ya tiene ese hábito en otra rutina, se
 *     salta, porque un hábito solo puede estar en una.
```

Sustituye el bloque que va desde `const steps = template.steps.map(` hasta el `return { ok: true, id: routine.id as string };` por:

```ts
  // Los hábitos que el usuario ya tiene, para no sembrar un duplicado que
  // bifurcaría la racha en dos filas con el mismo nombre.
  const { data: existentes } = await supabase.from("habits").select("id, name");

  const nuevos = template.steps
    .filter((step) => matchHabitForStep(step.habitHint ?? step.title, existentes ?? []) === null)
    .map((step, index) => ({
      user_id: user.id,
      routine_id: routine.id,
      name: step.title,
      category: "Otros" as const,
      position: index,
      duration_min: step.durationMin,
      cue: "",
      two_min_version: ""
    }));

  if (nuevos.length > 0) {
    const { error: habitsError } = await supabase.from("habits").insert(nuevos);
    if (habitsError) {
      // Una rutina sin hábitos no sirve de nada y es peor que no haberla creado:
      // el usuario tendría que borrarla a mano para volver a intentarlo.
      await supabase.from("routines").delete().eq("id", routine.id);
      return { ok: false, reason: describeDbError(habitsError) };
    }
  }

  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
  return { ok: true, id: routine.id as string };
```

Añade `identity: ""` al `insert` de `routines` de esa misma función, para que la rutina nazca con la columna explícita.

- [ ] **Paso 7: Quitar la frecuencia del panel de administración**

*(Sáltate este paso si `src/app/(app)/admin/` no existe todavía en esta rama.)*

En `src/app/(app)/admin/HabitTemplateFields.tsx`, borra el `<select>` de `frequency` y su `<Field>` contenedor.

En `src/app/(app)/admin/[kind]/page.tsx` línea 32, sustituye:

```ts
  return `${h.category} · ${h.frequency}`;
```

por:

```ts
  // Sin frecuencia desde 0045: la pone la rutina a la que se sume el hábito.
  return h.category;
```

En `src/app/(app)/admin/[kind]/[slug]/page.tsx`, borra las dos líneas `frequency: "Diario",` de los objetos de plantilla en blanco.

En `src/app/(app)/admin/TemplateEditor.tsx` línea 221, sustituye el texto:

```tsx
        Prellena el formulario de hábito: {t.category} · {t.frequency}.
```

por:

```tsx
        Prellena el formulario de hábito: {t.category}.
```

- [ ] **Paso 8: Limpiar el catálogo sembrado**

*(Sáltate este paso si `supabase/migrations/0044_admin_catalogo_plantillas.sql` no existe en esta rama.)*

Las diez plantillas de hábito sembradas en 0044 llevan `"frequency"` dentro de su JSON. Como el esquema ya no la acepta, quítala del JSON con una migración de datos al final de `0045_habitos_dentro_de_rutinas.sql`:

```sql
-- Las plantillas de hábito sembradas en 0044 traen "frequency" en su JSON, que
-- el esquema de validación ya no acepta. Se les quita aquí y no a mano en el
-- panel: son datos, y una migración de esquema que deja datos inválidos detrás
-- no está terminada.
update public.template_catalog
   set payload = payload - 'frequency'
 where kind = 'habit' and payload ? 'frequency';
```

Vuelve a correr `supabase db reset && supabase db test` después de añadirlo.

- [ ] **Paso 9: Verificar en verde**

Ejecuta: `pnpm typecheck`

Esperado: PASA, sin errores.

Ejecuta: `pnpm lint && pnpm test:unit && pnpm build`

Esperado: los tres pasan.

- [ ] **Paso 10: Commit**

```bash
git add -A src tests supabase
git commit -m "$(cat <<'EOF'
Que una plantilla de rutina nazca con hábitos que llevan racha

Mañana Milagrosa y el Club de las 5 AM sembraban pasos, que no contaban nada.
Ahora siembran hábitos, así que la rutina lleva racha desde el primer día. Si el
usuario ya tiene uno de esos hábitos en otra rutina, se salta: uno solo puede
estar en una, y duplicarlo bifurcaría la racha.

La plantilla de hábito pierde la frecuencia y gana un paso previo: a qué rutina
se suma. Un hábito suelto ya no es un estado que la aplicación pueda producir.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tarea 7: El motor de recomendaciones lee la frecuencia de la rutina

**Archivos:**
- Modificar: `src/lib/domain/insights/facts/habits.ts`
- Modificar: `src/lib/insights/actions.ts`
- Probar: `tests/domain/insights-habits.test.ts`

**Interfaces:**
- Consume: de la tarea 2, el esquema nuevo.
- Produce: `HabitFactLike` pasa a ser `{ id: string; name: string; routineId: string; routineFrequency: HabitFrequency }`; `RoutineFactLike` pasa a ser `{ id: string; name: string; habitCount: number }`.

- [ ] **Paso 1: Escribir la prueba que falla**

En `tests/domain/insights-habits.test.ts`, sustituye el helper `habito` (línea 11) por:

```ts
function habito(id: string, over: Partial<HabitFactLike> = {}): HabitFactLike {
  return { id, name: `Hábito ${id}`, routineId: "r1", routineFrequency: "Diario", ...over };
}
```

y añade el import del tipo si no está: `import type { HabitFactLike } from "../../src/lib/domain/insights/facts/habits.ts";`

Sustituye el test de la línea 95 (`habito("h1", { frequency: "Semanal" })`) por:

```ts
test("no opina sobre un hábito cuya rutina no es diaria", () => {
  // Contar 8 de 30 en un hábito cuya rutina es semanal diría que va fatal
  // cuando va perfecto. La frecuencia la pone la rutina desde 0045.
  const facts = habitsFacts(snapshot({ habits: [habito("h1", { routineFrequency: "Semanal" })], logs }), HOY);
  assert.strictEqual(facts.filter((f) => f.id.startsWith("habits.low-adherence")).length, 0);
});
```

Lee el archivo antes de editar: `logs` y `snapshot` ya existen y hay que reutilizarlos tal cual.

- [ ] **Paso 2: Correr la prueba y ver que falla**

Ejecuta: `pnpm exec node --experimental-strip-types --test tests/domain/insights-habits.test.ts`

Esperado: FALLA. El tipo `HabitFactLike` no tiene `routineFrequency`.

- [ ] **Paso 3: Adaptar el extractor de hechos**

En `src/lib/domain/insights/facts/habits.ts`, sustituye las dos interfaces:

```ts
export interface HabitFactLike {
  id: string;
  name: string;
  /** La rutina a la que pertenece (0045): un hábito no existe fuera de una. */
  routineId: string;
  /**
   * La frecuencia de esa rutina. El hábito ya no tiene una propia: toca cuando
   * toca su rutina, y ese es el dato con el que se puede juzgar su adherencia.
   */
  routineFrequency: HabitFrequency;
}

export interface RoutineFactLike {
  id: string;
  name: string;
  habitCount: number;
}
```

En `lowAdherenceFacts`, sustituye `if (habit.frequency !== "Diario") continue;` por:

```ts
    if (habit.routineFrequency !== "Diario") continue;
```

Busca en el resto del archivo cualquier uso de `stepCount` y sustitúyelo por `habitCount`, y cualquier texto visible que diga «pasos» por «hábitos».

- [ ] **Paso 4: Adaptar la capa de datos del motor**

En `src/lib/insights/actions.ts` (líneas 175-190 aproximadamente), sustituye las dos consultas y el mapeo:

```ts
        supabase.from("habits").select("id, name, routine_id, routines(frequency)").eq("user_id", userId),
        supabase.from("routines").select("id, name, habits(id)").eq("user_id", userId),
```

y el mapeo correspondiente:

```ts
            routineId: h.routine_id,
            routineFrequency: (h.routines?.frequency ?? "Diario") as HabitFrequency,
```

```ts
          routines: (routines ?? []).map((r) => ({ id: r.id, name: r.name, habitCount: (r.habits ?? []).length })),
```

Lee el archivo antes de editar: la forma exacta del `.map()` y el nombre de las variables desestructuradas tienen que respetarse. Borra `frequency: h.frequency as HabitFrequency` y `occupationId: h.occupation_id`, que ya no existen en la tabla.

- [ ] **Paso 5: Correr las pruebas y ver que pasan**

Ejecuta: `pnpm exec node --experimental-strip-types --test tests/domain/insights-habits.test.ts`

Esperado: PASA.

Ejecuta: `pnpm typecheck && pnpm test:unit`

Esperado: los dos pasan.

- [ ] **Paso 6: Commit**

```bash
git add src/lib/domain/insights/facts/habits.ts src/lib/insights/actions.ts tests/domain/insights-habits.test.ts
git commit -m "$(cat <<'EOF'
Que el motor pregunte a la rutina cuándo tocaba el hábito

lowAdherenceFacts se saltaba los hábitos no diarios leyendo habits.frequency,
columna que 0045 se llevó. Ahora lee la de su rutina, que es quien lo dice.
Sin esto el motor juzgaría un hábito semanal por los treinta días del mes y
diría que va fatal cuando va perfecto.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Tarea 8: La semilla, la documentación y la verificación completa

**Archivos:**
- Modificar: `supabase/seed.sql`
- Modificar: `docs/DECISIONS.md`, `docs/UX_MAP.md`, `docs/TRACEABILITY.md`

**Interfaces:**
- Consume: todo lo anterior.
- Produce: la rama lista para revisión.

- [ ] **Paso 1: Actualizar la semilla**

En `supabase/seed.sql`, busca el `insert into public.habits` de alrededor de la línea 286. Antes de él, crea la rutina que ancla el bloque de lectura, y cuelga el hábito de ella:

```sql
  -- Desde 0045 el hábito no existe fuera de una rutina, y es la rutina la que
  -- se ancla al bloque horario. La identidad viene rellena a propósito: es lo
  -- primero que se ve en la pantalla y en local se vería siempre vacía.
  insert into public.routines (id, user_id, name, frequency, occupation_id, identity, active, position)
  values (v_rut_noche, v_user_id, 'Cierre de la noche', 'Diario', v_occ_lectura,
          'Soy alguien que termina el día leyendo, no rascando el teléfono', true, 0)
  on conflict (id) do update set
    name = excluded.name, occupation_id = excluded.occupation_id, identity = excluded.identity;

  insert into public.habits (id, user_id, name, category, routine_id, position, duration_min, cue, two_min_version)
  values (v_hab1, v_user_id, 'Leer 20 minutos', 'Aprendizaje', v_rut_noche, 0, 20,
          'Después de meterme a la cama', 'Leer una página')
  on conflict (id) do update set
    name = excluded.name, routine_id = excluded.routine_id,
    duration_min = excluded.duration_min,
    cue = excluded.cue, two_min_version = excluded.two_min_version;
```

Declara `v_rut_noche uuid := '…';` junto a las demás variables del bloque `declare` del archivo, con un uuid fijo que no colisione con los que ya hay (búscalos con `grep -o "'[0-9a-f-]\{36\}'" supabase/seed.sql | sort -u`).

Recorre el resto de `seed.sql` buscando cualquier otro `insert into public.habits`, `insert into public.routine_steps` o referencia a `completed_step_ids`, y adáptalo o bórralo.

- [ ] **Paso 2: Documentar las decisiones**

En `docs/DECISIONS.md`, añade al final de la sección de decisiones técnicas:

```markdown
### Hábitos dentro de rutinas (Personal Development OS, septiembre 2026)
- **D-086 Un hábito no existe fuera de una rutina**: `habits.routine_id` es
  `not null` (migración 0045) y `routine_steps` desaparece — el paso ES el
  hábito. Se descartó dejar la relación opcional o mantener una tabla de unión:
  las dos habrían dejado la invariante en manos de la aplicación, y la
  aplicación no puede defenderla contra un `insert` que no pase por ella. Con
  ello se van también `habits.frequency` (la dicta la rutina) y
  `habits.occupation_id` (el bloque lo ancla la rutina): dos sitios diciendo lo
  mismo es un sitio donde mentir.
- **D-087 `habit_logs` es la única fuente de "¿lo hice hoy?"**: se borra
  `routine_runs.completed_step_ids`, que era un segundo registro de lo mismo.
  Consecuencia deliberada: desmarcar un hábito dentro de la rutina ahora **sí**
  borra el registro del día. Antes no lo hacía —`habitLogEffect`— porque el
  usuario podía haberlo cumplido por otra vía y la rutina no era dueña de
  negarlo; con un solo registro esa ambigüedad no existe.
```

- [ ] **Paso 3: Actualizar el mapa de la interfaz**

En `docs/UX_MAP.md`, busca las filas de `/development/habits` y `/development/routines`. Fusiónalas en una:

```markdown
| Rutinas y Hábitos | `/development/routines` | `routines/page.tsx` | `routines`, `habits`, `habit_logs`, `routine_runs`, `occupations` | `upsertRoutine`, `deleteRoutine`, `upsertHabit`, `deleteHabit`, `toggleHabitToday`, `createRoutineFromTemplate` |
| (redirect) | `/development/habits` | `habits/page.tsx` | — | redirige a `/development/routines` desde 0045 |
```

Respeta el número y el orden de columnas que use la tabla real del archivo: léela antes de escribir.

- [ ] **Paso 4: Actualizar la trazabilidad**

En `docs/TRACEABILITY.md`, busca las filas de `FR-HAB-001`, `FR-HAB-002` y `FR-HAB-006`. Cambia la ruta y el componente de `/development/habits` y `habits/HabitForm.tsx` a `/development/routines` y `routines/HabitForm.tsx`. Añade a `FR-HAB-006` (BR-026) la nota:

```
Desde 0045 el bloque lo ancla la rutina, no el hábito: borrar la ocupación deja `routines.occupation_id` en null y la rutina —con sus hábitos— sobrevive.
```

- [ ] **Paso 5: La verificación completa**

**Aviso:** el comando siguiente termina en `supabase db reset` y **borra la base local**. Si hay datos reales en local, avísale a tu humano antes de correrlo.

Ejecuta: `pnpm verify`

Esperado: PASA entero — `typecheck`, `lint`, `test:unit`, `build`, `supabase db reset` y `supabase db test`.

Ejecuta también, porque `pnpm verify` no lo cubre: `./scripts/verificar-backfill-0045.sh`

Esperado: `✓ Backfill verificado.`

- [ ] **Paso 6: Comprobar a mano lo que ninguna prueba ve**

Ejecuta: `pnpm dev` y abre `http://localhost:3000/development/routines`. Comprueba:

1. La rutina «Cierre de la noche» aparece con su identidad debajo del título.
2. «Leer 20 minutos» sale como fila con su racha, su señal y su versión de dos minutos.
3. Marcarla tacha la fila y sube la barra de progreso a 100 %.
4. Desmarcarla la devuelve a 0 % **y baja la racha** — es el cambio de conducta de D-087.
5. `/development/habits` redirige aquí.
6. El menú lateral muestra «Rutinas y Hábitos» y ya no muestra «Hábitos».
7. «+ Hábito» dentro de una rutina crea uno sin preguntar por frecuencia ni bloque.
8. «Plantillas» de hábito pide primero a qué rutina se suma.
9. En `/development/goals`, un resultado clave con fuente «hábito» sigue ofreciendo la lista de hábitos y guardando el que elijas. La spec da por hecho que `key_results` no necesita cambios; esta es la comprobación de que es verdad.

- [ ] **Paso 7: Commit**

```bash
git add supabase/seed.sql docs/
git commit -m "$(cat <<'EOF'
Contar en la documentación por qué el hábito dejó de estar solo

D-086 y D-087 dejan por escrito las dos decisiones que un lector futuro no
podría deducir del esquema: por qué la relación es obligatoria en la BASE y no
en la aplicación, y por qué desmarcar ahora sí borra la racha cuando antes
deliberadamente no lo hacía.

La semilla arranca con una rutina que tiene identidad, para que la pantalla no
se vea en local como si el campo no existiera.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Al terminar

Antes de abrir el PR, corre `superpowers:requesting-code-review`. La revisión tiene que mirar con especial cuidado:

- **El backfill.** Es lo único del plan que toca datos que ya existen y que no se pueden reconstruir. `scripts/verificar-backfill-0045.sh` cubre seis casos; pregúntate si hay un séptimo en los datos reales.
- **Las dos pérdidas conocidas** de la spec: el hábito que estaba en dos rutinas y la convivencia de `stack_after_habit_id` con el orden de la rutina.
- **La conducta nueva de desmarcar** (D-087). Es lo que más va a sorprender a quien ya usaba la aplicación.

La rama sale de `main` y todavía no lleva `feat/panel-admin-plantillas`. Si esa rama se fusiona antes que esta, rebasa y vuelve a correr la tarea 6 completa: es la única que toca los mismos archivos.
