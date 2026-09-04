# Hábitos dentro de rutinas — diseño

Fecha: 2026-09-01
Módulo: Personal Development OS
Estado: aprobado en brainstorming, pendiente de plan de implementación

## El problema

Hoy hábitos y rutinas son dos módulos con dos rutas, dos pantallas y dos
flujos de plantillas. La base los deja rozarse (`routine_steps.habit_id`
permite que un paso *apunte* a un hábito) pero no los une: un hábito puede
existir sin rutina, un paso puede ser texto libre que nadie cuenta, y ambas
tablas guardan su propia `frequency`, así que hay dos sitios respondiendo
«¿toca hoy?» sin que ninguno mande.

Los tres libros que inspiran el módulo —*Hábitos atómicos*, *Mañanas
milagrosas*, *El club de las 5 AM*— describen la misma cosa: una rutina es
una cadena de hábitos, y el hábito se sostiene porque la cadena lo arrastra.
La aplicación modela las dos mitades por separado y deja al usuario el
trabajo de unirlas en su cabeza.

## La decisión

**Todo hábito vive en una rutina.** No hay hábitos sueltos. La rutina es la
unidad del módulo y el hábito es su átomo.

De esa decisión se derivan las demás:

- **La rutina manda sobre la frecuencia.** `habits.frequency` desaparece: el
  hábito toca cuando toca su rutina. Un dato, un dueño. «Pesas los lunes» y
  «meditar a diario» son dos rutinas, que es lo que son en la vida real.
- **Un paso *es* un hábito.** `routine_steps` desaparece; `habits` absorbe
  `routine_id`, `position` y `duration_min`. La invariante la defiende la
  base de datos con un `not null`, no la aplicación con una promesa.
- **Una sola pantalla.** `/development/routines` pasa a llamarse «Rutinas y
  Hábitos» y absorbe todo; `/development/habits` redirige.
- **La rutina declara una identidad.** Campo `identity` en `routines`, que
  preside el ejecutor: *«Soy alguien que no negocia sus mañanas.»* Es el
  capítulo 2 de *Hábitos atómicos* — el hábito no se sostiene por la meta,
  se sostiene por quién crees que eres.

## 1 · Modelo de datos

Migración `0045_habitos_dentro_de_rutinas.sql`.

### Columnas nuevas

```sql
alter table public.habits
  add column routine_id uuid references public.routines(id) on delete cascade,
  add column position integer not null default 0,
  add column duration_min integer not null default 5 check (duration_min > 0);

alter table public.routines
  add column identity text not null default '';
```

`on delete cascade` y no `set null`: sin rutina un hábito no puede existir,
así que borrar la rutina se lleva sus hábitos. Es la diferencia con
`occupation_id`, que sí usa `set null` porque el bloque horario es opcional
(BR-026).

### Backfill

En este orden. El primero que reclama un hábito se lo queda:

1. **Hábitos que ya son paso de una rutina** (`routine_steps.habit_id`):
   heredan esa rutina, con `position` y `duration_min` copiados del paso.
2. **Sueltos con `occupation_id`**: se agrupan por bloque. Una rutina por
   bloque, nombre = título del bloque, `occupation_id` = ese bloque,
   frecuencia = la más común entre sus hábitos (empate → `Diario`).
3. **Sueltos sin bloque**: se agrupan por frecuencia. «Hábitos diarios»,
   «Hábitos de entre semana», «Hábitos semanales», «Hábitos de fin de
   semana» — solo se crean las que hagan falta.
4. **Pasos de texto libre** (`routine_steps.habit_id is null`): se convierten
   en hábitos nuevos. Nombre = título del paso, categoría `Otros`, misma
   rutina, misma posición, misma duración, sin logs previos.

Detalles que el backfill tiene que fijar para no dejarlos al azar:

- **`position`** de los hábitos que llegan por los pasos 2 y 3: por
  `habits.created_at` ascendente dentro de su rutina nueva. Es el único orden
  que ya existía en la pantalla de hábitos.
- **`duration_min`** de esos mismos: el default de 5 minutos. No hay dato
  previo del que deducirlo y cinco minutos es lo que ya asume 0024.
- **Nombre de rutina repetido**: si el título del bloque coincide con el de
  una rutina que el usuario ya tiene, la rutina nueva se crea igual con ese
  nombre. `routines` no tiene unicidad por nombre y renombrar a ciegas sería
  peor que dejar dos entradas que el usuario distingue y fusiona a mano.

El criterio de los pasos 2 y 3 es reconstruir la intención que ya estaba en
los datos en vez de tirarla: quien ató tres hábitos al bloque «Mañana» ya
había dicho que forman una rutina, solo que la aplicación no tenía dónde
anotarlo.

### Cierre del modelo

```sql
alter table public.habits alter column routine_id set not null;
alter table public.habits drop column frequency;
alter table public.habits drop column occupation_id;
drop table public.routine_steps;
alter table public.routine_runs drop column completed_step_ids;
```

`habits.occupation_id` se va porque la rutina ya dice a qué bloque
pertenece. Dejarlo daría dos sitios donde decir lo mismo y ninguna forma de
saber cuál manda — el mismo criterio con el que 0033 se negó a añadir «a qué
hora» al hábito.

`routine_runs.completed_step_ids` se va porque `habit_logs` ya es único por
`(habit_id, log_date)`: el registro del hábito *es* el registro del paso.
`routine_runs` sobrevive por `started_at` y `completed_at`, que dicen cuándo
arrancaste la rutina y cuándo la cerraste — dato que ninguna otra tabla
tiene.

### El dueño de la rutina

Las claves foráneas no evalúan RLS: `routine_id` aceptaría el id de la
rutina de otra cuenta si alguien lo mandara a mano. Se cierra con un trigger
calcado de `guard_habit_stack_owner` (0033):

```sql
create or replace function public.guard_habit_routine_owner()
returns trigger language plpgsql security definer set search_path = public as $$
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
```

`habits.user_id` se conserva: la política RLS lo usa directamente y es más
barato que subconsultar la rutina en cada fila.

### Dos pérdidas conocidas

- **Hábito en dos rutinas.** El esquema actual no lo impide y el nuevo no lo
  permite. Gana la rutina de menor `routines.position`, y a igualdad de
  posición la de `created_at` más antiguo; el otro paso desaparece con
  `routine_steps`. Se descarta duplicar el hábito: bifurcaría la racha, que
  es justo lo que 0024 evitó al inventar `routine_steps.habit_id`.
- **`stack_after_habit_id` sobrevive** por decisión explícita del dueño. Queda
  una tensión: la posición dentro de la rutina *también* dice «después de
  qué». Se mitiga en la UI —la fila muestra el apilamiento explícito solo
  cuando apunta fuera del orden natural de la rutina— pero es deuda anotada,
  no resuelta.

## 2 · Dominio

`src/lib/domain/development/routines.ts`, lógica pura sin React ni Supabase.

- **`routineProgress(habits, logsDeHoy)`** — deja de recibir
  `completedStepIds`. Recibe los hábitos de la rutina y los `habit_logs` del
  día. `habit_logs` es la única fuente de «¿lo hice?».
- **`habitLogEffect()` desaparece.** Existía para no bifurcar la racha entre
  dos registros —el paso y el hábito— y por eso desmarcar un paso no
  desmarcaba el hábito. Ya no hay dos registros. La sustituye
  `toggleHabitEffect(alreadyLoggedToday) → "insert" | "delete"`: marcar es
  marcar, desmarcar es desmarcar. Es un cambio de conducta real y deliberado.
- **`routineFitsBlock()`** conserva su forma; lee `duration_min` de los
  hábitos en vez de los pasos.
- **`routineAdherence()`** sin cambios: sigue leyendo `routine_runs`.
- **`routineRunComplete(habits, logsDeHoy)`** — nueva. La ejecución del día se
  cierra (`completed_at`) cuando todos los hábitos de la rutina tienen
  registro hoy. Una rutina sin hábitos no se considera completa.
- **`src/lib/domain/habits.ts`** (`habitStreak`, `habitDoneToday`) no cambia:
  sigue operando sobre `habit_logs`.
- **`src/lib/domain/insights/facts/habits.ts`** filtra hoy por
  `habit.frequency !== "Diario"`. Pasa a leer la frecuencia de la rutina del
  hábito; el tipo del fact cambia en consecuencia.

## 3 · Pantalla y navegación

- `nav-items.ts`: «Rutinas» pasa a **«Rutinas y Hábitos»**. La entrada
  «Hábitos» se elimina.
- `/development/habits` queda como `redirect("/development/routines")`. Hay
  enlaces vivos apuntando ahí desde el panel del módulo y desde Metas.
- **La página**: la rutina que toca hoy arriba, en modo ejecución; las demás
  plegadas debajo. La identidad preside la cabecera, junto al bloque horario
  y la adherencia a 30 días. Cada fila es un hábito con su casilla, su
  duración y su racha; al expandir, su señal, su versión de dos minutos y el
  botón de editar.
- **Archivos**: `HabitRow.tsx` y `HabitForm.tsx` se mudan de `habits/` a
  `routines/`. `habits/actions.ts` se funde en `routines/actions.ts`.
  `habits/page.tsx` se queda solo con el redirect. `HabitForm` pierde
  frecuencia y bloque horario, gana rutina, duración y posición. `RoutineForm`
  gana `identity`.

## 4 · Plantillas, integraciones y pruebas

- **Plantillas de hábito** (`HabitTemplates`): hoy crean un hábito suelto.
  Ahora piden rutina destino, o la crean al vuelo.
- **Plantillas de rutina** (`RoutineTemplates`): ya sembraban pasos; ahora
  siembran hábitos, y por fin pueden traer la señal y la versión de dos
  minutos de cada uno de una vez. Mañana Milagrosa (S.A.V.E.R.S.) y el Club
  de las 5 AM (20/20/20) pasan a sembrar hábitos con racha desde el día uno.
- **Panel de admin** (migración 0044, hoy sin fusionar): el editor de
  plantilla de hábito pierde el selector de frecuencia — la dicta la rutina.
- **Metas personales**: `key_results` con `source_kind = 'habit'` sigue
  funcionando sin tocar nada; el hábito conserva su id y sus logs.
- **Pruebas**:
  - `tests/domain/development-routines.test.ts` — progreso desde logs, toggle,
    cierre del día, ajuste al bloque.
  - `tests/domain/insights-habits.test.ts` — frecuencia leída de la rutina.
  - `supabase/tests/0007_rls_development.sql` — reescrita sin `routine_steps`,
    con el nuevo guard de dueño de rutina.
  - Prueba de la migración sobre datos sembrados que cubra los cuatro casos
    del backfill más el hábito en dos rutinas.
  - `supabase/seed.sql` actualizado.

## Orden de trabajo

Esta rama va **después** de cerrar `feat/panel-admin-plantillas`. Las dos
tocan las plantillas de hábito; hacerlas a la vez garantiza conflictos.

## Fuera de alcance

Apuntado, no incluido:

- **Modo mínimos**: botón que colapsa la rutina a la `two_min_version` de cada
  hábito para el día malo.
- **Nunca fallar dos veces**: aviso en la fila del hábito que se falló la
  última vez que tocaba.
- **El disparador sube a la rutina**: `routines.cue` y eliminación de
  `stack_after_habit_id`.
- Heatmap de 30 días por rutina.
- `key_results.source_kind = 'routine'` (adherencia como resultado clave).
- Proponer la creación del bloque horario cuando la rutina no tiene ninguno.
