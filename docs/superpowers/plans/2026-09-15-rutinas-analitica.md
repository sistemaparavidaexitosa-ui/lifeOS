# F2 · Analítica de hábitos con Recharts · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** la pestaña **Analítica** de Rutinas, con KPIs, curva diaria, tendencia semanal, heatmap mensual, línea de rachas, radar por área y tabla por hábito, en rangos de 7, 30, 90 y 365 días.

**Architecture:**
- **Módulo puro `habit-dashboard.ts`.** Compone las primitivas de F1 (`slotStates`, `completionRate`, `habitStreaks`) en series y KPIs. El cargador ya existe: `loadHabitSeries`.
- **Pestañas.** Un `layout.tsx` en `development/routines` pone Hoy | Analítica.
- **Gráficas.** Son islas cliente en `src/components/charts/`, que solo importa la ruta de Analítica. El heatmap es una rejilla CSS en servidor.

**Tech Stack:** Recharts 3.10.1 con `react-is` 19.1.2 (versiones exactas), Next.js 15, TypeScript con `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-15-identidad-y-analitica-design.md` (§ Definiciones de métricas, § Árbol de componentes).

## Global Constraints

- `recharts` es la única dependencia nueva, a versión exacta, y queda justificada en D-158.
- Toda cifra sale de `habit-dashboard.ts` con pruebas; los componentes solo pintan.
- Los colores salen de variables CSS del tema (`var(--accent)` y demás). Nada de hex sueltos por gráfica. Hay que respetar `data-theme`.
- Antes de escribir código de gráficas se carga la skill `dataviz`.
- Verificación en navegador contra `pnpm build && pnpm start`, con la CSP con nonce activa.
- Español en UI, comentarios y commits.

## Definiciones (v1)

**Cumplimiento del día**
- Es la media de pct de las ranuras diarias juzgadas ese día.
- Una ranura semanal se atribuye a su domingo, o a hoy si la semana sigue abierta y ya está completada.
- Si ese día no hay nada juzgado, el valor es `null`.

**Día sólido**
- Un día es sólido si su cumplimiento es ≥ 80.
- **Racha de días sólidos:** se recorre hacia atrás desde hoy. Hoy, si aún no llega a 80, es neutro; un día sin nada juzgado también es neutro; un día juzgado con menos de 80 corta.

**Indicadores del rango**
- **Disciplina:** días sólidos ÷ días juzgados de los últimos 30.
- **Éxito del rango:** ranuras completadas ÷ (completadas + omitidas + sin registro). Se cuentan ranuras, no porcentajes.
- **Momentum:** `completionRate` a 7 días − a 30 días.
- **Tendencia mensual:** los 30 días recientes contra los 30 anteriores.
- **Periodos:** hoy, semana ISO en curso, mes, trimestre y año naturales, cada uno hasta hoy.

**Por hábito**
- **Consistencia:** `round(0,7 × tasa30 ponderada + 0,3 × tasa90)`, donde las ranuras de los últimos 7 días pesan 2. Si no hay tasa90, se usa la tasa30.
- **Omisiones del rango:** omitidas + sin registro.

**Series para gráficas**
- **Rachas (timeline):** corridas de ranuras completadas por hábito dentro del rango. Un pospuesto no corta.
- **Radar por área:** tasa30 por área, con el mapeo de categoría Salud→Salud, Aprendizaje→Aprendizaje, Trabajo→Carrera, Personal/Otros→Personal.

## Tareas

### Task 1: `habit-dashboard.ts` (TDD)

**Files:** Create `src/lib/domain/development/habit-dashboard.ts`, `tests/domain/habit-dashboard.test.ts`.

**Produces:**

```ts
export type Rango = 7 | 30 | 90 | 365;
export function parseRango(v: string | undefined): Rango                       // por defecto 30
export interface DayPoint { date: string; pct: number | null; judged: number; done: number }
export function dailyCurve(series: HabitSeries[], fromISO: string, toISO: string, todayISO: string): DayPoint[]
export function solidDaysStreak(curve: DayPoint[], todayISO: string): number
export function disciplineIndex(curve: DayPoint[], todayISO: string): number | null   // sobre los últimos 30 puntos
export function successRate(series: HabitSeries[], fromISO: string, toISO: string, todayISO: string): number | null
export interface WeekPoint { weekStart: string; pct: number | null }
export function weeklyTrend(series: HabitSeries[], fromISO: string, todayISO: string): WeekPoint[]
export interface PeriodRates { day: number | null; week: number | null; month: number | null; quarter: number | null; year: number | null }
export function periodRates(series: HabitSeries[], todayISO: string): PeriodRates
export function momentum(series: HabitSeries[], todayISO: string): number | null
export function monthlyTrend(series: HabitSeries[], todayISO: string): { current: number | null; previous: number | null; delta: number | null }
export interface HabitRow { habitId: string; rate30: number | null; rate90: number | null; rateRange: number | null; consistency: number | null; current: number; longest: number; unit: "día" | "semana"; misses: number }
export function habitRows(series: HabitSeries[], rangeFromISO: string, todayISO: string): HabitRow[]
export interface StreakSegment { habitId: string; start: string; end: string; length: number }
export function streakSegments(series: HabitSeries[], fromISO: string, todayISO: string): StreakSegment[]
export function areaOfCategory(category: string): string
export function areaRates(series: HabitSeries[], areaOf: (habitId: string) => string, todayISO: string): { area: string; pct: number | null }[]
export function monthGrid(yearMonth: string): (string | null)[][]            // semanas de lunes a domingo; null fuera del mes
```

**Pruebas:** una o dos por función con fechas fijas. Casos obligatorios:
- una ranura semanal completada cuenta en su domingo;
- hoy por debajo de 80 no corta la racha de días sólidos;
- un pospuesto no corta un segmento;
- `monthGrid("2026-09")` empieza el martes 1 con un `null` el lunes;
- `parseRango("abc")` devuelve 30.

### Task 2: dependencia, pestañas y cargador de la vista

- **Dependencias:** `pnpm add recharts@3.10.1 react-is@19.1.2`. Después, `pnpm build` y revisión de la CSP.
- **`routines/layout.tsx` + `RoutineTabs.tsx`:**
  - `RoutineTabs` es cliente y usa `usePathname`;
  - dos enlaces con `aria-current`;
  - estilo de chips, igual que los selectores existentes.
- **`src/lib/data/habit-analytics.ts`:**
  - `loadHabitMeta()`: `habits(id, name, category)`, `cache`.
  - `loadDashboard(rango)`: series de 400 días más el cálculo del dominio, en un solo DTO serializable.

### Task 3: gráficas y página

Primero se carga la skill `dataviz`.

**Componentes en `src/components/charts/`:**
- **Servidor:**
  - `ChartCard`: título, subtítulo, leyenda y el hijo;
  - `MetricCard`: etiqueta, valor, delta con signo y ayuda;
  - `MonthlyHeatmap`: rejilla CSS con `color-mix` sobre `--accent` por tramos de 20 %, `title` y `aria-label` por celda.
- **Cliente:**
  - `CompletionCurve`: `AreaChart`;
  - `WeeklyTrend`: `BarChart`;
  - `StreakTimeline`: `BarChart` horizontal con rango `[inicio, fin]` en días desde el origen;
  - `LifeAreasRadar`: `RadarChart`.
  - Todos van con `ResponsiveContainer` y alto fijo, y tooltips con fecha legible en `es-MX`.

**Página `analytics/page.tsx`:**
- `RangePicker` con enlaces `?rango=`;
- `KpiGrid` con 8 `MetricCard`:
  - Días sólidos
  - Hoy
  - Semana
  - Tendencia mensual
  - Éxito del rango
  - Disciplina
  - Momentum
  - Mejor racha
- las gráficas en rejilla `md:grid-cols-2`;
- `HabitTable` con desplazamiento horizontal propio en móvil.

**Estados vacíos:**
- sin hábitos, `EmptyState` con enlace a Hoy;
- con menos de 7 días de datos, aviso de «pocos datos».

### Task 4: verificación, D-158 y PR

- **Chequeos:** `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build`.
- **Playwright:**
  - `/development/routines/analytics` en claro a 1280 px y en oscuro a 400 px;
  - cambio de rango;
  - sin errores de consola, salvo el websocket local ya conocido;
  - revisar capturas.
- **D-158:** Recharts rompe D-008, con el porqué y el coste (≈ 100 KB solo en la ruta de Analítica).
- **PR** con base `feat/rutinas-registro-rico`.
