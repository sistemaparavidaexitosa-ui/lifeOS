# Plan de lectura programable — diseño

Fecha: 2026-09-01 · Módulo: Personal Development OS · Biblioteca

## El problema

La Biblioteca ya sabe **dónde vas** en cada libro. `books.current_page` guarda la página,
`book_progress` (migración 0034) guarda un punto por día local y
`src/lib/domain/development/reading.ts` convierte eso en velocidad, fecha estimada de término y
aviso de lectura estancada.

Lo que no sabe es **qué pensabas leer y cuándo**. De ahí salen tres huecos concretos:

1. Home dice "Hoy estás leyendo" eligiendo el libro `Leyendo` con `updated_at` más reciente. Eso es
   una heurística sobre qué tocaste al final, no sobre qué decidiste leer. Con tres libros abiertos
   señala al que abriste por curiosidad, no al que te importa.
2. El Panel de Desarrollo Personal no menciona la lectura. Compone metas y rutinas y nada más, así
   que el módulo con más señal diaria del OS es invisible en su propio panel.
3. El historial de ritmo casi no se alimenta: la única forma de registrar avance es abrir el
   formulario completo del libro. Un cálculo de velocidad que nadie alimenta da siempre la misma
   respuesta, "sin datos suficientes".

## La decisión: una cola semanal

Se programa asignando libros a **semanas**. No fechas objetivo por libro, no cadencia de páginas
por día: semanas. Es la unidad en la que la gente piensa la lectura ("este mes me leo dos") y la que
permite decir literalmente *el libro de esta semana es X*.

### Una fila por (libro, semana)

Un libro de tres semanas son tres filas. La alternativa —una fila con rango `desde`/`hasta`— ahorra
filas y cuesta aritmética de solapamiento en cada lectura. Con una fila por semana:

- "los libros de esta semana" es un `where week_start = ?` indexado, sin cálculo;
- mover, quitar o reordenar una semana es tocar una fila;
- el formulario hace la multiplicación (primera semana + cuántas semanas) y la tabla se queda tonta.

Es el mismo patrón que ya usan `habit_logs` (por `log_date`), `routine_runs` (por `local_date`) y
`book_progress`: una fila por unidad de tiempo, con un `unique` que hace idempotente el doble clic.

### El lunes como ancla

`routineDueToday("Semanal")` ya ancla la semana al lunes, y `/planning` arranca en lunes. La
columna lo impone con un `check (extract(dow from week_start) = 1)` en vez de confiar en que cada
llamador normalice: una semana que empieza en martes rompería silenciosamente la agrupación.

## Qué es "urgente" en una cola

Una cola por sí sola no mide si vas a tiempo, pero sí sabe algo que ninguna otra cosa sabe: **una
semana ya pasó**. Un libro programado para una semana anterior que sigue sin terminar está
atrasado, y eso es toda la urgencia que hace falta. `focusBook` elige en tres escalones:

1. **Atrasado** — el de la semana pasada más vieja, sin terminar.
2. **Esta semana** — el de menor `position` entre los de la semana actual.
3. **Sin plan** — respaldo: el libro `Leyendo` con `updated_at` más reciente.

El tercer escalón es exactamente lo que Home hace hoy. Mientras la cola esté vacía nadie pierde
nada, y la tarjeta nunca se queda en blanco.

El escalón se propaga a la UI como texto: Home dice **"El libro de esta semana"** cuando viene del
plan y **"Hoy estás leyendo"** cuando es el respaldo. La pantalla no promete un plan que no existe
— la misma regla por la que `estimatedFinish` devuelve siempre su `basis` y no pinta fecha con
`sin datos`.

## Ritmo exigido vs. ritmo real

`requiredPace` calcula las páginas/día necesarias para terminar dentro de la **última semana
programada**. Junto a `readingVelocity()`, que ya mide el ritmo real, produce la única frase que
convierte una lista en un plan: *"necesitas 22 págs./día, vas a 14"*.

Devuelve `null` sin plan o sin `total_pages`. Regla de la casa (`reading.ts`): **nunca un número
inventado**, porque una cifra inventada se lee igual que una calculada y así es como se le pierde
la confianza a la pantalla.

## Fronteras

- **Nada de esto es compartido.** La lectura sigue siendo seguimiento personal privado, sin
  relación con Workspaces (BR-027). Por eso `reading_plan_weeks` no lleva `user_id` propio: hereda
  la privacidad del libro padre vía RLS, como `book_notes` y `book_progress`.
- **El dominio no toca Supabase.** `reading-plan.ts` es puro y probado con `node:test`, como
  `reading.ts` y `routines.ts`. El Panel de Desarrollo recibe todo resuelto: su cabecera dice que si
  aparece aritmética nueva ahí, va en el dominio.
- **Una sola fuente de verdad para el libro foco.** `loadReadingFocus()` en
  `src/lib/data/development.ts`, envuelta en `cache()`. Home, el Panel y la Biblioteca leen de ahí;
  tres consultas independientes podrían discrepar entre sí en la misma pantalla.
- **Avance rápido solo en la Biblioteca.** Home queda de solo lectura con su enlace. Es donde se
  mira, no donde se trabaja.
