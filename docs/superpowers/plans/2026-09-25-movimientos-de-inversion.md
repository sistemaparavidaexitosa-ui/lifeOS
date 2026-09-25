# Movimientos de inversión, curvas y el Centro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada posición de `/investments` guarda sus movimientos (aportación, retiro, rendimiento, valuación), dibuja su curva, hay una curva global, y el Centro puede enseñarlas y proponer movimientos que la persona confirma.

**Architecture:** Una tabla nueva `investment_movements` es la verdad; un trigger mantiene `investments.principal/valuation/as_of` como resumen, así ningún lector actual cambia. Las curvas se calculan en TS con funciones puras (`src/lib/domain/money/curva-inversion.ts`), con la misma semántica que el trigger, probada con la misma tabla de casos en node y en pgTAP. El Centro gana una capacidad «inversiones» (ver) y un bloque «propuesta_movimiento» (proponer), que se pinta como sección `propuestaMovimiento` con un botón que llama a la misma server action que la página.

**Tech Stack:** Next 15.5 (App Router, server actions, `params` es `Promise`), React 19, Supabase (Postgres + RLS + pgTAP), zod 3, Recharts 3, `node --test` con `--experimental-strip-types` (imports relativos con `.ts`).

**Spec:** `docs/superpowers/specs/2026-09-25-movimientos-de-inversion-design.md`

## Global Constraints

- Rama: `feat/movimientos-inversion` (ya creada desde `origin/main`, spec ya commiteado).
- Tipos de movimiento, exactos: `aportacion`, `retiro`, `rendimiento`, `valuacion`.
- `amount > 0`, salvo `valuacion`, que admite `0` (una posición que lo perdió todo). Tope `1e12`. Nota ≤ 200.
- Sin `update` de movimientos: se borran y se registran de nuevo.
- Una valuación es el valor AL CIERRE de su día: los flujos de su misma fecha ya están dentro.
- Nunca convertir monedas: lo que no está en la moneda del perfil no suma y se dice.
- Un retiro no puede dejar el valor de la posición por debajo de 0 en su fecha.
- El modelo nunca escribe en la base: propone; la persona guarda.
- Fecha de una propuesta: ni futura ni de hace más de 10 años (3653 días).
- Grants: tablas y funciones nuevas sólo a `authenticated` (+ `service_role` en la tabla); `revoke … from public, anon` en la función (ver comentario de la migración 0074: `execute` lo concede `PUBLIC`).
- **NO correr `pnpm verify` ni `supabase db reset`**: borran la base local. Para aplicar la migración en local: `supabase migration up`. Para pgTAP: `supabase test db`.
- Con `pnpm dev` la app no hidrata (CSP). Para navegador: `pnpm build && pnpm start`.
- Comentarios y textos de interfaz en español, en el tono del repo (explican el POR QUÉ).
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Flujo el mismo día que una valuación** — no se debe contar dos veces (la valuación ya lo incluye). Pinned en Task 1 (caso C3) y Task 2 (pgTAP C3).
2. **Borrar el último movimiento de una posición** — la posición queda en 0/0 sin romper, y su página no truena con curva vacía. Pinned en Task 2 (pgTAP «vacía») y Task 1 (`curvaDePosicion([])`).
3. **Propuesta del Centro contra una posición que el modelo no leyó / inventó** — el bloque no sale. Pinned en Task 7 (`resolverPropuesta` con fila ausente).
4. **Retiro mayor que el valor** — la acción lo rechaza con mensaje, también desde el Centro. Pinned en Task 1 (`retiroPermitido`).
5. **Posiciones en otra moneda** — no suman a la curva global y se dice cuántas. Pinned en Task 1 (`curvaGlobal` con USD) y Task 6 (nota de la sección global).

## File Structure

| Archivo | Qué hace |
|---|---|
| `src/lib/domain/money/curva-inversion.ts` (nuevo) | Tipos de movimiento, `estadoAl`, `valorAl`, `curvaDePosicion`, `curvaGlobal`, `rendimientoPct`, `recortarCurva`, `retiroPermitido`. Puro. |
| `tests/domain/curva-inversion.test.ts` (nuevo) | Tabla de casos compartida + curvas. |
| `supabase/migrations/0077_movimientos_de_inversion.sql` (nuevo) | Tabla, RLS, grants, `recalcular_inversion`, trigger, `crear_posicion`, relleno. |
| `supabase/tests/0047_movimientos_de_inversion.sql` (nuevo) | pgTAP: misma tabla de casos, RLS, grants. |
| `src/types/database.types.ts` | Regenerado. |
| `src/lib/money/inversiones.ts` (nuevo) | `leerPosiciones(supabase)`: posiciones con sus movimientos. SERVIDOR. |
| `src/app/(app)/investments/actions.ts` | `crearPosicion`, `actualizarPosicion`, `deleteInvestment`, `registrarMovimiento`, `borrarMovimiento`. |
| `src/app/(app)/investments/InvestmentForm.tsx` | Sin capital/valor; aportación inicial al crear. |
| `src/components/charts/InvestmentCurve.tsx` (nuevo) | Recharts: valor (área) + capital (punteada). |
| `src/app/(app)/investments/page.tsx` | Curva global arriba; nombre enlaza al detalle. |
| `src/app/(app)/investments/[id]/page.tsx` (nuevo) | Detalle de posición. |
| `src/app/(app)/investments/[id]/MovimientoForm.tsx` (nuevo) | Alta de movimiento. |
| `src/app/(app)/investments/[id]/MovimientosLista.tsx` (nuevo) | Lista con «Eliminar». |
| `src/lib/domain/centro/agente/inversiones.ts` (nuevo) | Capacidad «inversiones», parte pura. |
| `tests/domain/centro-agente-inversiones.test.ts` (nuevo) | |
| `src/lib/centro/agente/capacidades.ts` | Hidratador `inversiones`; `mercado/portafolio` usa la curva global. |
| `src/lib/insights/context.ts` | `investment_movements` consultable. |
| `src/lib/domain/centro/agente/contrato.ts` | Capacidad nueva + bloque `propuesta_movimiento`. |
| `src/lib/domain/centro/agente/propuesta-movimiento.ts` (nuevo) | `resolverPropuesta`. Puro. |
| `tests/domain/centro-agente-propuesta.test.ts` (nuevo) | |
| `src/lib/domain/centro/runtime/secciones.ts` / `validador.ts` | Kind `propuestaMovimiento`. |
| `src/lib/centro/agente/pensar.ts` | Caso `propuesta_movimiento`. |
| `src/components/centro-runtime/secciones/PropuestaMovimiento.tsx` (nuevo) + `index.ts` | Componente con Guardar/Descartar. |
| `src/lib/domain/centro/agente/prompt.ts` | Enseña capacidad y bloque. |
| `docs/DECISIONS.md` | D-200…D-202. |

---

### Task 1: Curvas puras

**Files:**
- Create: `src/lib/domain/money/curva-inversion.ts`
- Test: `tests/domain/curva-inversion.test.ts`

**Interfaces:**
- Consumes: `round2` de `src/lib/domain/budget.ts`.
- Produces (todo exportado):
  - `TIPOS_DE_MOVIMIENTO: readonly ["aportacion","retiro","rendimiento","valuacion"]`, `type TipoDeMovimiento`
  - `interface MovimientoPuro { id?: string; kind: TipoDeMovimiento; amount: number; occurred_on: string; created_at: string; note?: string }`
  - `interface PuntoDeCurva { fecha: string; valor: number; capital: number }`
  - `interface PosicionConMovimientos { id: string; name: string; currency: string; movimientos: MovimientoPuro[] }`
  - `estadoAl(movs, fecha): { valor: number; capital: number }`
  - `valorAl(movs, fecha): number`
  - `curvaDePosicion(movs, hasta): PuntoDeCurva[]`
  - `curvaGlobal(posiciones: { currency: string; movimientos: MovimientoPuro[] }[], moneda, hasta): { puntos: PuntoDeCurva[]; fuera: number }`
  - `rendimientoPct(p: { valor: number; capital: number }): number | null`
  - `recortarCurva<T>(puntos: T[], max?: number): T[]` (por defecto 400: el tope de `portfolio.serie` en el validador)
  - `retiroPermitido(movs, nuevo: { amount: number; occurred_on: string }): boolean`
  - `CASOS_COMPARTIDOS` (la tabla de casos que Task 2 replica en pgTAP)

- [ ] **Step 1: Write the failing test**

`tests/domain/curva-inversion.test.ts`:

```ts
// tests/domain/curva-inversion.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CASOS_COMPARTIDOS,
  estadoAl,
  valorAl,
  curvaDePosicion,
  curvaGlobal,
  rendimientoPct,
  recortarCurva,
  retiroPermitido,
  type MovimientoPuro
} from "../../src/lib/domain/money/curva-inversion.ts";

// LA MISMA TABLA vive en supabase/tests/0047_movimientos_de_inversion.sql
// contra el trigger. Si una cambia, la otra también.
for (const c of CASOS_COMPARTIDOS) {
  test(`Caso compartido ${c.nombre}`, () => {
    const ultimo = c.movs.reduce((f, m) => (m.occurred_on > f ? m.occurred_on : f), "0000-00-00");
    assert.deepStrictEqual(estadoAl(c.movs, ultimo), c.esperado);
  });
}

test("Sin movimientos: 0 y 0, y curva vacía", () => {
  assert.deepStrictEqual(estadoAl([], "2026-09-25"), { valor: 0, capital: 0 });
  assert.deepStrictEqual(curvaDePosicion([], "2026-09-25"), []);
});

const m = (kind: MovimientoPuro["kind"], amount: number, occurred_on: string, created_at = `${occurred_on}T12:00:00Z`): MovimientoPuro => ({
  kind,
  amount,
  occurred_on,
  created_at
});

test("Lo que pasa después de la fecha no cuenta", () => {
  const movs = [m("aportacion", 1000, "2026-01-01"), m("aportacion", 500, "2026-03-01")];
  assert.deepStrictEqual(estadoAl(movs, "2026-02-01"), { valor: 1000, capital: 1000 });
  assert.strictEqual(valorAl(movs, "2025-12-31"), 0);
});

test("Curva de una posición: un punto por fecha con movimiento, más hoy arrastrando el último", () => {
  const movs = [m("aportacion", 1000, "2026-01-01"), m("valuacion", 1100, "2026-02-01"), m("aportacion", 200, "2026-02-01")];
  assert.deepStrictEqual(curvaDePosicion(movs, "2026-03-01"), [
    { fecha: "2026-01-01", valor: 1000, capital: 1000 },
    { fecha: "2026-02-01", valor: 1100, capital: 1200 },
    { fecha: "2026-03-01", valor: 1100, capital: 1200 }
  ]);
});

test("Curva de una posición: si el último movimiento es hoy, no se repite el punto", () => {
  const movs = [m("aportacion", 1000, "2026-09-25")];
  assert.deepStrictEqual(curvaDePosicion(movs, "2026-09-25"), [{ fecha: "2026-09-25", valor: 1000, capital: 1000 }]);
});

test("Curva global: arrastra cada posición entre sus movimientos y no suma otra moneda", () => {
  const r = curvaGlobal(
    [
      { currency: "MXN", movimientos: [m("aportacion", 1000, "2026-01-01")] },
      { currency: "MXN", movimientos: [m("aportacion", 500, "2026-02-01"), m("valuacion", 600, "2026-03-01")] },
      { currency: "USD", movimientos: [m("aportacion", 99, "2026-01-15")] }
    ],
    "MXN",
    "2026-04-01"
  );
  assert.strictEqual(r.fuera, 1);
  assert.deepStrictEqual(r.puntos, [
    { fecha: "2026-01-01", valor: 1000, capital: 1000 },
    { fecha: "2026-02-01", valor: 1500, capital: 1500 },
    { fecha: "2026-03-01", valor: 1600, capital: 1500 },
    { fecha: "2026-04-01", valor: 1600, capital: 1500 }
  ]);
});

test("Curva global sin nada en tu moneda: vacía, y dice cuántas quedaron fuera", () => {
  const r = curvaGlobal([{ currency: "USD", movimientos: [m("aportacion", 1, "2026-01-01")] }], "MXN", "2026-02-01");
  assert.deepStrictEqual(r, { puntos: [], fuera: 1 });
});

test("Rendimiento simple, y null sin capital", () => {
  assert.strictEqual(rendimientoPct({ valor: 1100, capital: 1000 }), 10);
  assert.strictEqual(rendimientoPct({ valor: 950, capital: 1000 }), -5);
  assert.strictEqual(rendimientoPct({ valor: 1003.33, capital: 1000 }), 0.3);
  assert.strictEqual(rendimientoPct({ valor: 50, capital: 0 }), null);
});

test("Recortar conserva primero y último y no pasa del tope", () => {
  const puntos = Array.from({ length: 1000 }, (_, i) => i);
  const r = recortarCurva(puntos, 400);
  assert.strictEqual(r.length, 400);
  assert.strictEqual(r[0], 0);
  assert.strictEqual(r[399], 999);
  assert.deepStrictEqual(recortarCurva([1, 2, 3], 400), [1, 2, 3]);
});

test("Un retiro no puede dejar la posición bajo cero en su fecha", () => {
  const movs = [m("aportacion", 1000, "2026-01-01"), m("valuacion", 800, "2026-02-01")];
  assert.strictEqual(retiroPermitido(movs, { amount: 800, occurred_on: "2026-02-10" }), true);
  assert.strictEqual(retiroPermitido(movs, { amount: 800.01, occurred_on: "2026-02-10" }), false);
  // Antes de la valuación, valía 1000.
  assert.strictEqual(retiroPermitido(movs, { amount: 1000, occurred_on: "2026-01-15" }), true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/curva-inversion.test.ts`
Expected: FAIL — `Cannot find module '.../curva-inversion.ts'`.

- [ ] **Step 3: Write the implementation**

`src/lib/domain/money/curva-inversion.ts`:

```ts
// src/lib/domain/money/curva-inversion.ts
// La evolución de una inversión a partir de sus movimientos (D-201). Puro,
// probado en tests/domain/curva-inversion.test.ts.
//
// LA MISMA SEMÁNTICA VIVE DOS VECES. Aquí, para dibujar la curva; y en SQL
// (`recalcular_inversion`, migración 0077), para el resumen que guarda
// `investments`. Las dos se prueban con `CASOS_COMPARTIDOS`: si una cambia sin
// la otra, la página diría un valor y la curva otro.
//
// Una VALUACIÓN es el valor al cierre de su día: los flujos de esa misma fecha
// ya están dentro. Lo que se aporta, rinde o retira DESPUÉS se le suma o resta.
// Un RENDIMIENTO sube el valor y no el capital: si se cobró fuera, la persona
// registra además un retiro.

import { round2 } from "../budget.ts";

export const TIPOS_DE_MOVIMIENTO = ["aportacion", "retiro", "rendimiento", "valuacion"] as const;
export type TipoDeMovimiento = (typeof TIPOS_DE_MOVIMIENTO)[number];

export interface MovimientoPuro {
  id?: string;
  kind: TipoDeMovimiento;
  amount: number;
  occurred_on: string;
  created_at: string;
  note?: string;
}

export interface PuntoDeCurva {
  fecha: string;
  valor: number;
  capital: number;
}

export interface PosicionConMovimientos {
  id: string;
  name: string;
  currency: string;
  movimientos: MovimientoPuro[];
}

/** El tope de `portfolio.serie` en el validador del runtime. */
export const MAX_PUNTOS = 400;

const SIGNO: Record<TipoDeMovimiento, number> = { aportacion: 1, rendimiento: 1, retiro: -1, valuacion: 0 };

function ordenados(movs: MovimientoPuro[]): MovimientoPuro[] {
  return [...movs].sort((a, b) =>
    a.occurred_on === b.occurred_on ? a.created_at.localeCompare(b.created_at) : a.occurred_on.localeCompare(b.occurred_on)
  );
}

export function estadoAl(movs: MovimientoPuro[], fecha: string): { valor: number; capital: number } {
  const hasta = ordenados(movs).filter((x) => x.occurred_on <= fecha);
  let capital = 0;
  let ultima: MovimientoPuro | null = null;
  for (const x of hasta) {
    if (x.kind === "aportacion") capital += x.amount;
    if (x.kind === "retiro") capital -= x.amount;
    if (x.kind === "valuacion") ultima = x; // ordenados: la última gana, y en empate la creada después
  }
  let valor = ultima ? ultima.amount : 0;
  for (const x of hasta) {
    if (x.kind === "valuacion") continue;
    if (ultima && x.occurred_on <= ultima.occurred_on) continue;
    valor += SIGNO[x.kind] * x.amount;
  }
  return { valor: round2(valor), capital: round2(capital) };
}

export function valorAl(movs: MovimientoPuro[], fecha: string): number {
  return estadoAl(movs, fecha).valor;
}

function fechasCon(movs: MovimientoPuro[], hasta: string): string[] {
  const fechas = [...new Set(movs.map((x) => x.occurred_on).filter((f) => f <= hasta))].sort();
  if (fechas.length && fechas[fechas.length - 1]! < hasta) fechas.push(hasta);
  return fechas;
}

export function curvaDePosicion(movs: MovimientoPuro[], hasta: string): PuntoDeCurva[] {
  return fechasCon(movs, hasta).map((fecha) => ({ fecha, ...estadoAl(movs, fecha) }));
}

export function curvaGlobal(
  posiciones: { currency: string; movimientos: MovimientoPuro[] }[],
  moneda: string,
  hasta: string
): { puntos: PuntoDeCurva[]; fuera: number } {
  const propias = posiciones.filter((p) => p.currency === moneda);
  const fuera = posiciones.length - propias.length;
  const fechas = fechasCon(propias.flatMap((p) => p.movimientos), hasta);
  const puntos = fechas.map((fecha) => {
    let valor = 0;
    let capital = 0;
    for (const p of propias) {
      const e = estadoAl(p.movimientos, fecha);
      valor += e.valor;
      capital += e.capital;
    }
    return { fecha, valor: round2(valor), capital: round2(capital) };
  });
  return { puntos, fuera };
}

/** (valor − capital) / capital, en % con un decimal. `null` sin capital que medir. */
export function rendimientoPct(p: { valor: number; capital: number }): number | null {
  if (p.capital <= 0) return null;
  return Math.round(((p.valor - p.capital) / p.capital) * 1000) / 10;
}

/** Como mucho `max` puntos, repartidos, con el primero y el último siempre dentro. */
export function recortarCurva<T>(puntos: T[], max: number = MAX_PUNTOS): T[] {
  if (puntos.length <= max) return puntos;
  return Array.from({ length: max }, (_, i) => puntos[Math.round((i * (puntos.length - 1)) / (max - 1))]!);
}

export function retiroPermitido(movs: MovimientoPuro[], nuevo: { amount: number; occurred_on: string }): boolean {
  return valorAl(movs, nuevo.occurred_on) - nuevo.amount >= -0.005;
}

/**
 * La tabla que prueban las DOS implementaciones (esta y el trigger). Fechas
 * fijas, `created_at` explícito donde el orden importa.
 */
export const CASOS_COMPARTIDOS: { nombre: string; movs: MovimientoPuro[]; esperado: { valor: number; capital: number } }[] = [
  {
    nombre: "C1 sin valuación",
    movs: [
      { kind: "aportacion", amount: 1000, occurred_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
      { kind: "aportacion", amount: 500, occurred_on: "2026-01-02", created_at: "2026-01-02T10:00:00Z" },
      { kind: "rendimiento", amount: 20, occurred_on: "2026-01-03", created_at: "2026-01-03T10:00:00Z" },
      { kind: "retiro", amount: 100, occurred_on: "2026-01-04", created_at: "2026-01-04T10:00:00Z" }
    ],
    esperado: { valor: 1420, capital: 1400 }
  },
  {
    nombre: "C2 valuación y luego flujo",
    movs: [
      { kind: "aportacion", amount: 1000, occurred_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
      { kind: "valuacion", amount: 1100, occurred_on: "2026-01-02", created_at: "2026-01-02T10:00:00Z" },
      { kind: "aportacion", amount: 200, occurred_on: "2026-01-03", created_at: "2026-01-03T10:00:00Z" }
    ],
    esperado: { valor: 1300, capital: 1200 }
  },
  {
    nombre: "C3 flujo el mismo día que la valuación",
    movs: [
      { kind: "aportacion", amount: 1000, occurred_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
      { kind: "aportacion", amount: 500, occurred_on: "2026-01-02", created_at: "2026-01-02T11:00:00Z" },
      { kind: "valuacion", amount: 1600, occurred_on: "2026-01-02", created_at: "2026-01-02T10:00:00Z" }
    ],
    esperado: { valor: 1600, capital: 1500 }
  },
  {
    nombre: "C4 dos valuaciones el mismo día",
    movs: [
      { kind: "valuacion", amount: 900, occurred_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
      { kind: "valuacion", amount: 950, occurred_on: "2026-01-01", created_at: "2026-01-01T11:00:00Z" }
    ],
    esperado: { valor: 950, capital: 0 }
  },
  {
    nombre: "C5 retiro después de valuar",
    movs: [
      { kind: "aportacion", amount: 1000, occurred_on: "2026-01-01", created_at: "2026-01-01T10:00:00Z" },
      { kind: "valuacion", amount: 1200, occurred_on: "2026-01-02", created_at: "2026-01-02T10:00:00Z" },
      { kind: "retiro", amount: 300, occurred_on: "2026-01-03", created_at: "2026-01-03T10:00:00Z" }
    ],
    esperado: { valor: 900, capital: 700 }
  }
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/curva-inversion.test.ts`
Expected: PASS, todos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/money/curva-inversion.ts tests/domain/curva-inversion.test.ts
git commit -m "D-201: la curva de una inversión, a partir de sus movimientos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Migración 0077 y pgTAP

**Files:**
- Create: `supabase/migrations/0077_movimientos_de_inversion.sql`
- Create: `supabase/tests/0047_movimientos_de_inversion.sql`
- Modify: `src/types/database.types.ts` (regenerado)

**Interfaces:**
- Consumes: la semántica y `CASOS_COMPARTIDOS` de Task 1 (se replican a mano).
- Produces: tabla `public.investment_movements (id, user_id, investment_id, kind, amount, occurred_on, note, created_at)`; función `public.crear_posicion(p_kind text, p_name text, p_institution text, p_broker text, p_rate numeric, p_source text, p_currency text, p_monto numeric, p_fecha date, p_family_member_id uuid default null) returns uuid`; función `public.recalcular_inversion(p_id uuid)`; tipos regenerados.

- [ ] **Step 1: Write the failing pgTAP test**

`supabase/tests/0047_movimientos_de_inversion.sql`:

```sql
-- 0047_movimientos_de_inversion.sql — pgTAP: migración 0077.
--
-- Los movimientos son la verdad y `investments` guarda el resumen. Lo que se
-- prueba: que el trigger resume con la MISMA semántica que la curva en TS
-- (los casos C1…C5 son `CASOS_COMPARTIDOS` de curva-inversion.ts, a mano), que
-- el relleno conserva los números que había, y que nadie ve ni escribe los
-- movimientos de otra persona.

begin;
select plan(21);

insert into auth.users (id, instance_id, aud, role, email) values
  ('e8111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mov-duena@test.local'),
  ('e8222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'mov-otra@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('e8111111-1111-4111-8111-111111111111', 'Dueña Mov'),
  ('e8222222-2222-4222-8222-222222222222', 'Otra Mov')
on conflict (user_id) do nothing;

-- Grants, antes de cambiar de rol.
select ok(
  not has_function_privilege('anon', 'public.crear_posicion(text,text,text,text,numeric,text,text,numeric,date,uuid)', 'execute'),
  'anon no puede llamar a crear_posicion'
);
select ok(
  not has_table_privilege('anon', 'public.investment_movements', 'select'),
  'anon no puede leer investment_movements'
);

select set_config('request.jwt.claims', json_build_object('sub', 'e8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.investments (id, user_id, kind, name, as_of) values
  ('e8000001-0000-4000-8000-000000000001', 'e8111111-1111-4111-8111-111111111111', 'fija', 'C1', '2025-12-01'),
  ('e8000002-0000-4000-8000-000000000002', 'e8111111-1111-4111-8111-111111111111', 'fija', 'C2', '2025-12-01'),
  ('e8000003-0000-4000-8000-000000000003', 'e8111111-1111-4111-8111-111111111111', 'fija', 'C3', '2025-12-01'),
  ('e8000004-0000-4000-8000-000000000004', 'e8111111-1111-4111-8111-111111111111', 'fija', 'C4', '2025-12-01'),
  ('e8000005-0000-4000-8000-000000000005', 'e8111111-1111-4111-8111-111111111111', 'fija', 'C5', '2025-12-01'),
  ('e8000006-0000-4000-8000-000000000006', 'e8111111-1111-4111-8111-111111111111', 'fija', 'Relleno', '2025-12-01'),
  ('e8000007-0000-4000-8000-000000000007', 'e8111111-1111-4111-8111-111111111111', 'fija', 'Perdida', '2025-12-01');

insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on, created_at) values
  ('e8111111-1111-4111-8111-111111111111', 'e8000001-0000-4000-8000-000000000001', 'aportacion', 1000, '2026-01-01', '2026-01-01T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000001-0000-4000-8000-000000000001', 'aportacion', 500, '2026-01-02', '2026-01-02T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000001-0000-4000-8000-000000000001', 'rendimiento', 20, '2026-01-03', '2026-01-03T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000001-0000-4000-8000-000000000001', 'retiro', 100, '2026-01-04', '2026-01-04T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000002-0000-4000-8000-000000000002', 'aportacion', 1000, '2026-01-01', '2026-01-01T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000002-0000-4000-8000-000000000002', 'valuacion', 1100, '2026-01-02', '2026-01-02T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000002-0000-4000-8000-000000000002', 'aportacion', 200, '2026-01-03', '2026-01-03T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000003-0000-4000-8000-000000000003', 'aportacion', 1000, '2026-01-01', '2026-01-01T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000003-0000-4000-8000-000000000003', 'aportacion', 500, '2026-01-02', '2026-01-02T11:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000003-0000-4000-8000-000000000003', 'valuacion', 1600, '2026-01-02', '2026-01-02T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000004-0000-4000-8000-000000000004', 'valuacion', 900, '2026-01-01', '2026-01-01T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000004-0000-4000-8000-000000000004', 'valuacion', 950, '2026-01-01', '2026-01-01T11:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000005-0000-4000-8000-000000000005', 'aportacion', 1000, '2026-01-01', '2026-01-01T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000005-0000-4000-8000-000000000005', 'valuacion', 1200, '2026-01-02', '2026-01-02T10:00:00Z'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000005-0000-4000-8000-000000000005', 'retiro', 300, '2026-01-03', '2026-01-03T10:00:00Z');

select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C1'), array[1420, 1400]::numeric[], 'C1 sin valuación');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C2'), array[1300, 1200]::numeric[], 'C2 valuación y luego flujo');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C3'), array[1600, 1500]::numeric[], 'C3 flujo el mismo día que la valuación');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C4'), array[950, 0]::numeric[], 'C4 dos valuaciones el mismo día');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C5'), array[900, 700]::numeric[], 'C5 retiro después de valuar');
select is((select as_of from public.investments where name = 'C1'), '2026-01-04'::date, 'as_of = el último movimiento');

-- Borrar hasta dejarla vacía.
delete from public.investment_movements where investment_id = 'e8000004-0000-4000-8000-000000000004';
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'C4'), array[0, 0]::numeric[], 'Sin movimientos: 0 y 0');
select is((select as_of from public.investments where name = 'C4'), '2026-01-01'::date, 'Sin movimientos: as_of intacto');

-- Lo mismo que hace el relleno de la migración: aportación = principal y
-- valuación = valuation, a la misma fecha. Los números no se mueven.
insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on) values
  ('e8111111-1111-4111-8111-111111111111', 'e8000006-0000-4000-8000-000000000006', 'aportacion', 1000, '2026-02-01'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000006-0000-4000-8000-000000000006', 'valuacion', 1234.5, '2026-02-01');
select is((select array[valuation, principal]::numeric[] from public.investments where name = 'Relleno'), array[1234.5, 1000]::numeric[], 'Relleno conserva capital y valor');

-- Una valuación de 0 es legítima (la perdió toda); una aportación de 0, no.
insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on) values
  ('e8111111-1111-4111-8111-111111111111', 'e8000007-0000-4000-8000-000000000007', 'aportacion', 500, '2026-02-01'),
  ('e8111111-1111-4111-8111-111111111111', 'e8000007-0000-4000-8000-000000000007', 'valuacion', 0, '2026-02-02');
select is((select valuation from public.investments where name = 'Perdida'), 0::numeric, 'Valuación en 0 se admite');
select throws_ok(
  $$insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on)
    values ('e8111111-1111-4111-8111-111111111111', 'e8000007-0000-4000-8000-000000000007', 'aportacion', 0, '2026-02-03')$$,
  '23514',
  null,
  'Una aportación de 0 no se admite'
);

-- crear_posicion: posición y aportación inicial, juntas.
select ok(
  public.crear_posicion('fija', 'CETES 28d', 'Banxico', '', 10.5, 'Estado de cuenta', 'MXN', 5000, '2026-03-01') is not null,
  'crear_posicion devuelve el id'
);
select is(
  (select array[valuation, principal]::numeric[] from public.investments where name = 'CETES 28d'),
  array[5000, 5000]::numeric[],
  'crear_posicion deja la aportación inicial como capital y valor'
);
select is(
  (select count(*)::int from public.investment_movements m join public.investments i on i.id = m.investment_id where i.name = 'CETES 28d'),
  1,
  'crear_posicion registra un movimiento'
);
select throws_ok(
  $$select public.crear_posicion('fija', 'Rota', '', '', 0, 'x', 'MXN', 0, '2026-03-01')$$,
  '23514',
  null,
  'crear_posicion sin aportación no crea nada'
);
select is((select count(*)::int from public.investments where name = 'Rota'), 0, 'Ni la posición queda a medias');

-- La otra persona.
select set_config('request.jwt.claims', json_build_object('sub', 'e8222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.investment_movements), 0, 'La otra persona no ve movimientos ajenos');
select throws_ok(
  $$insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on)
    values ('e8222222-2222-4222-8222-222222222222', 'e8000001-0000-4000-8000-000000000001', 'aportacion', 1, '2026-02-01')$$,
  '42501',
  null,
  'Nadie registra movimientos en una posición ajena'
);
delete from public.investment_movements where investment_id = 'e8000001-0000-4000-8000-000000000001';

select set_config('request.jwt.claims', json_build_object('sub', 'e8111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
select is(
  (select count(*)::int from public.investment_movements where investment_id = 'e8000001-0000-4000-8000-000000000001'),
  4,
  'Ni los borra'
);

select * from finish();
rollback;
```

Cuenta: 2 (grants) + 6 (casos + as_of) + 2 (vacía) + 1 (relleno) + 2 (valuación 0) + 5 (crear_posicion) + 3 (otra persona) = 21. Si añades o quitas una prueba, ajusta `plan(21)`: pgTAP falla si no cuadra.

- [ ] **Step 2: Run to verify it fails**

Run: `supabase test db 2>&1 | tail -20`
Expected: FAIL en 0047 (`relation "public.investment_movements" does not exist`). Las demás suites pasan.

- [ ] **Step 3: Write the migration**

`supabase/migrations/0077_movimientos_de_inversion.sql`:

```sql
-- 0077 · Los movimientos de una inversión (D-200)
--
-- Hasta aquí una posición era UNA foto: `principal`, `valuation`, `as_of`.
-- Con una foto no hay curva. Desde aquí la verdad son sus movimientos
-- (aportación, retiro, rendimiento, valuación) y `investments` guarda el
-- RESUMEN, que mantiene un trigger. Así `/wealth`, `/debt`, `/reports`,
-- `/household`, el grafo y «mercado» siguen leyendo `valuation` sin enterarse.
--
-- LA SEMÁNTICA VIVE DOS VECES: aquí y en `curva-inversion.ts`. Las dos se
-- prueban con los mismos casos (supabase/tests/0047 y
-- tests/domain/curva-inversion.test.ts). Una valuación es el valor al CIERRE
-- de su día; los flujos posteriores se le suman o restan; el rendimiento sube
-- el valor y no el capital.

create table if not exists public.investment_movements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  kind          text not null check (kind in ('aportacion', 'retiro', 'rendimiento', 'valuacion')),
  -- Una valuación en 0 es legítima (se perdió todo); un flujo de 0 no es nada.
  amount        numeric(20, 6) not null check (amount <= 1e12 and (amount > 0 or (kind = 'valuacion' and amount = 0))),
  occurred_on   date not null,
  note          text not null default '' check (char_length(note) <= 200),
  created_at    timestamptz not null default now()
);

create index if not exists idx_investment_movements_pos
  on public.investment_movements (investment_id, occurred_on, created_at);

alter table public.investment_movements enable row level security;

-- Sin `update`: un movimiento mal capturado se borra y se registra de nuevo.
drop policy if exists investment_movements_select on public.investment_movements;
create policy investment_movements_select on public.investment_movements
  for select using (user_id = auth.uid());

drop policy if exists investment_movements_insert on public.investment_movements;
create policy investment_movements_insert on public.investment_movements
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.investments i where i.id = investment_id and i.user_id = auth.uid())
  );

drop policy if exists investment_movements_delete on public.investment_movements;
create policy investment_movements_delete on public.investment_movements
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.investment_movements to authenticated;
grant all privileges on public.investment_movements to service_role;
revoke all on public.investment_movements from anon;

comment on table public.investment_movements is
  'Movimientos de una inversión (D-200): la verdad de la que `investments` guarda el resumen vía `recalcular_inversion`.';

-- El resumen de UNA posición. SECURITY INVOKER: corre con la RLS de quien
-- escribió el movimiento, que es la dueña de la posición.
create or replace function public.recalcular_inversion(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_ultimo    date;
  v_capital   numeric;
  v_val_monto numeric;
  v_val_fecha date;
  v_valor     numeric;
begin
  select max(occurred_on) into v_ultimo from public.investment_movements where investment_id = p_id;

  if v_ultimo is null then
    update public.investments set principal = 0, valuation = 0 where id = p_id;
    return;
  end if;

  select coalesce(sum(case kind when 'aportacion' then amount when 'retiro' then -amount else 0 end), 0)
    into v_capital
    from public.investment_movements where investment_id = p_id;

  select amount, occurred_on into v_val_monto, v_val_fecha
    from public.investment_movements
   where investment_id = p_id and kind = 'valuacion'
   order by occurred_on desc, created_at desc
   limit 1;

  select coalesce(v_val_monto, 0)
       + coalesce(sum(case kind when 'retiro' then -amount else amount end), 0)
    into v_valor
    from public.investment_movements
   where investment_id = p_id
     and kind <> 'valuacion'
     and (v_val_fecha is null or occurred_on > v_val_fecha);

  update public.investments
     set principal = v_capital, valuation = v_valor, as_of = v_ultimo
   where id = p_id;
end;
$fn$;

revoke execute on function public.recalcular_inversion(uuid) from public, anon;
grant execute on function public.recalcular_inversion(uuid) to authenticated, service_role;

create or replace function public.trg_investment_movements_resumen()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  perform public.recalcular_inversion(coalesce(new.investment_id, old.investment_id));
  return null;
end;
$fn$;

revoke execute on function public.trg_investment_movements_resumen() from public, anon;

drop trigger if exists trg_investment_movements_resumen on public.investment_movements;
create trigger trg_investment_movements_resumen
  after insert or delete on public.investment_movements
  for each row execute function public.trg_investment_movements_resumen();

-- Alta de una posición con su aportación inicial, en una transacción: una
-- posición sin movimientos sería una posición en 0 que nadie pidió.
create or replace function public.crear_posicion(
  p_kind text,
  p_name text,
  p_institution text,
  p_broker text,
  p_rate numeric,
  p_source text,
  p_currency text,
  p_monto numeric,
  p_fecha date,
  -- Al final y con default: así los tipos generados lo dan como opcional y
  -- «sin titular» se pasa omitiéndolo, no con un null que el tipo no admite.
  p_family_member_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  insert into public.investments (user_id, kind, name, institution, broker, rate, source, family_member_id, currency, as_of)
  values (auth.uid(), p_kind, p_name, coalesce(p_institution, ''), coalesce(p_broker, ''), coalesce(p_rate, 0),
          coalesce(p_source, ''), p_family_member_id, p_currency, p_fecha)
  returning id into v_id;

  insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on, note)
  values (auth.uid(), v_id, 'aportacion', p_monto, p_fecha, 'Aportación inicial');

  return v_id;
end;
$fn$;

revoke execute on function public.crear_posicion(text, text, text, text, numeric, text, text, numeric, date, uuid) from public, anon;
grant execute on function public.crear_posicion(text, text, text, text, numeric, text, text, numeric, date, uuid) to authenticated, service_role;

-- Relleno: cada posición existente arranca con lo que ya decía. Con la
-- semántica de arriba, el trigger devuelve los mismos `principal` y
-- `valuation`: la aportación entra primero y la valuación, del mismo día,
-- manda sobre ella.
insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on, note, created_at)
select i.user_id, i.id, 'aportacion', i.principal, i.as_of, 'Saldo inicial (migración)', now()
  from public.investments i
 where i.principal > 0
   and not exists (select 1 from public.investment_movements m where m.investment_id = i.id);

insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on, note, created_at)
select i.user_id, i.id, 'valuacion', i.valuation, i.as_of, 'Saldo inicial (migración)', now() + interval '1 second'
  from public.investments i
 where (i.principal > 0 or i.valuation > 0)
   and not exists (select 1 from public.investment_movements m where m.investment_id = i.id and m.kind = 'valuacion');
```

Nota para el implementador: la segunda inserción corre DESPUÉS de la primera, así que su `not exists` mira sólo valuaciones. Una posición con `principal = 0` y `valuation > 0` recibe sólo la valuación (capital 0), igual que antes. La cláusula `where` de la primera usa `not exists` sobre cualquier movimiento para que la migración sea re-ejecutable sin duplicar.

- [ ] **Step 4: Apply locally and run pgTAP**

```bash
supabase migration up
supabase test db 2>&1 | tail -20
```
Expected: `supabase migration up` aplica sólo 0077 (sin borrar datos). Todas las suites PASS, incluida 0047 con 21 pruebas.

- [ ] **Step 5: Regenerate types and typecheck**

```bash
pnpm gen:types:local
git diff --stat src/types/database.types.ts
pnpm typecheck
```
Expected: el diff de tipos añade `investment_movements`, `crear_posicion`, `recalcular_inversion` (y `src/lib/domain/graph/catalog.generated.ts` puede cambiar: inclúyelo si cambia). Typecheck limpio.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/0077_movimientos_de_inversion.sql supabase/tests/0047_movimientos_de_inversion.sql src/types/database.types.ts src/lib/domain/graph/catalog.generated.ts
git commit -m "D-200: los movimientos de una inversión son la verdad; investments guarda el resumen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lectura y acciones del servidor

**Files:**
- Create: `src/lib/money/inversiones.ts`
- Modify: `src/app/(app)/investments/actions.ts` (reescrito entero)

**Interfaces:**
- Consumes: `PosicionConMovimientos`, `MovimientoPuro`, `TipoDeMovimiento`, `TIPOS_DE_MOVIMIENTO`, `retiroPermitido` (Task 1); `crear_posicion` y tipos (Task 2).
- Produces:
  - `leerPosiciones(supabase: SupabaseClient<Database>): Promise<PosicionConMovimientos[]>` y `leerPosicion(supabase, id): Promise<(PosicionConMovimientos & { kind: string; institution: string; broker: string; rate: number; source: string; family_member_id: string | null }) | null>`
  - `type ResultadoDeAccion = { ok: true } | { ok: false; reason: string }`
  - `crearPosicion(fd: FormData): Promise<ResultadoDeAccion & { id?: string }>`
  - `actualizarPosicion(id: string, fd: FormData): Promise<ResultadoDeAccion>`
  - `deleteInvestment(id: string): Promise<void>` (se queda)
  - `registrarMovimiento(investmentId: string, fd: FormData): Promise<ResultadoDeAccion>` — campos `kind`, `amount`, `occurredOn`, `note`
  - `borrarMovimiento(id: string, investmentId: string): Promise<ResultadoDeAccion>`

Sin pruebas unitarias (son `server-only`); se prueban en navegador en Task 9. La lógica que merece prueba (`retiroPermitido`) ya la tiene en Task 1.

- [ ] **Step 1: Write the loader**

`src/lib/money/inversiones.ts`:

```ts
// src/lib/money/inversiones.ts
// Las posiciones con sus movimientos, bajo la RLS de quien pregunta (D-200).
// SERVIDOR. Lo usan /investments, su detalle y el Centro: una sola lectura
// para que la curva salga igual se mire desde donde se mire.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type { MovimientoPuro, PosicionConMovimientos, TipoDeMovimiento } from "@/lib/domain/money/curva-inversion.ts";

type Db = SupabaseClient<Database>;

const COLUMNAS_MOV = "id, kind, amount, occurred_on, note, created_at";

function aPuro(m: { id: string; kind: string; amount: number; occurred_on: string; note: string; created_at: string }): MovimientoPuro {
  return { id: m.id, kind: m.kind as TipoDeMovimiento, amount: Number(m.amount), occurred_on: m.occurred_on, note: m.note, created_at: m.created_at };
}

export async function leerPosiciones(supabase: Db): Promise<PosicionConMovimientos[]> {
  const { data, error } = await supabase
    .from("investments")
    .select(`id, name, currency, investment_movements(${COLUMNAS_MOV})`)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    currency: i.currency,
    movimientos: (i.investment_movements ?? []).map(aPuro)
  }));
}

export async function leerPosicion(supabase: Db, id: string) {
  const { data, error } = await supabase
    .from("investments")
    .select(`id, name, currency, kind, institution, broker, rate, source, family_member_id, investment_movements(${COLUMNAS_MOV})`)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const { investment_movements, ...resto } = data;
  return { ...resto, rate: Number(resto.rate), movimientos: (investment_movements ?? []).map(aPuro) };
}
```

Si `pnpm typecheck` se queja de la forma del embed, ajusta los tipos de `aPuro` a lo que generó Supabase (no uses `any`).

- [ ] **Step 2: Rewrite the actions**

`src/app/(app)/investments/actions.ts` (reemplaza el archivo entero):

```ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/data/session";
import { todayForUser } from "@/lib/data/profile";
import { round2 } from "@/lib/domain/budget.ts";
import { describeDbError } from "@/lib/supabase/errors";
import { retiroPermitido, TIPOS_DE_MOVIMIENTO } from "@/lib/domain/money/curva-inversion.ts";
import { fdate } from "@/lib/format";
import { leerPosicion } from "@/lib/money/inversiones";

export type ResultadoDeAccion = { ok: true } | { ok: false; reason: string };

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const UUID = z.string().uuid();

/** Lo que describe una posición. Capital y valor ya no: salen de sus movimientos (D-200). */
const posicionSchema = z.object({
  kind: z.enum(["fija", "variable"]),
  name: z.string().trim().min(1, "Falta el instrumento."),
  institutionOrBroker: z.string().optional().default(""),
  rate: z.coerce.number().default(0),
  source: z.string().trim().min(1, "Falta la fuente."),
  familyMemberId: z.string().uuid().optional().or(z.literal(""))
});

function leerPosicionDe(fd: FormData) {
  return posicionSchema.safeParse({
    kind: fd.get("kind"),
    name: fd.get("name"),
    institutionOrBroker: fd.get("institutionOrBroker") ?? "",
    rate: fd.get("rate") || 0,
    source: fd.get("source"),
    familyMemberId: fd.get("familyMemberId") ?? ""
  });
}

const primerError = (e: z.ZodError) => e.issues[0]?.message ?? "Datos inválidos.";

function revalidar(id?: string) {
  revalidatePath("/investments");
  if (id) revalidatePath(`/investments/${id}`);
}

/** FR-INV-001…007. Alta con su aportación inicial, atómica (`crear_posicion`). */
export async function crearPosicion(fd: FormData): Promise<ResultadoDeAccion & { id?: string }> {
  const p = leerPosicionDe(fd);
  if (!p.success) return { ok: false, reason: primerError(p.error) };
  const inicial = z
    .object({ monto: z.coerce.number().positive("La aportación inicial tiene que ser mayor que 0.").max(1e12), fecha: FECHA })
    .safeParse({ monto: fd.get("monto"), fecha: fd.get("fecha") });
  if (!inicial.success) return { ok: false, reason: primerError(inicial.error) };

  const { supabase, user } = await requireUser();
  if (inicial.data.fecha > (await todayForUser())) return { ok: false, reason: "La fecha no puede ser futura." };
  const { data: perfil } = await supabase.from("profiles").select("currency").eq("user_id", user.id).single();

  const { data, error } = await supabase.rpc("crear_posicion", {
    p_kind: p.data.kind,
    p_name: p.data.name,
    p_institution: p.data.kind === "fija" ? p.data.institutionOrBroker : "",
    p_broker: p.data.kind === "variable" ? p.data.institutionOrBroker : "",
    p_rate: p.data.rate,
    p_source: p.data.source,
    p_currency: perfil?.currency ?? "MXN",
    p_monto: round2(inicial.data.monto),
    p_fecha: inicial.data.fecha,
    ...(p.data.familyMemberId ? { p_family_member_id: p.data.familyMemberId } : {})
  });
  if (error) return { ok: false, reason: describeDbError(error) };
  revalidar(data ?? undefined);
  return { ok: true, id: data ?? undefined };
}

export async function actualizarPosicion(id: string, fd: FormData): Promise<ResultadoDeAccion> {
  if (!UUID.safeParse(id).success) return { ok: false, reason: "Posición inválida." };
  const p = leerPosicionDe(fd);
  if (!p.success) return { ok: false, reason: primerError(p.error) };
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("investments")
    .update({
      kind: p.data.kind,
      name: p.data.name,
      institution: p.data.kind === "fija" ? p.data.institutionOrBroker : "",
      broker: p.data.kind === "variable" ? p.data.institutionOrBroker : "",
      rate: p.data.rate,
      source: p.data.source,
      family_member_id: p.data.familyMemberId || null
    })
    .eq("id", id);
  if (error) return { ok: false, reason: describeDbError(error) };
  revalidar(id);
  return { ok: true };
}

export async function deleteInvestment(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("investments").delete().eq("id", id);
  if (error) throw new Error(describeDbError(error));
  revalidatePath("/investments");
}

const movimientoSchema = z
  .object({
    kind: z.enum(TIPOS_DE_MOVIMIENTO),
    amount: z.coerce.number().min(0).max(1e12),
    occurredOn: FECHA,
    note: z.string().trim().max(200).default("")
  })
  .refine((m) => m.kind === "valuacion" || m.amount > 0, { message: "El monto tiene que ser mayor que 0.", path: ["amount"] });

/**
 * La MISMA acción desde /investments/[id] y desde el Centro (D-202): lo que
 * propone el agente pasa por aquí igual que lo que teclea la persona.
 */
export async function registrarMovimiento(investmentId: string, fd: FormData): Promise<ResultadoDeAccion> {
  if (!UUID.safeParse(investmentId).success) return { ok: false, reason: "Posición inválida." };
  const m = movimientoSchema.safeParse({
    kind: fd.get("kind"),
    amount: fd.get("amount"),
    occurredOn: fd.get("occurredOn"),
    note: fd.get("note") ?? ""
  });
  if (!m.success) return { ok: false, reason: primerError(m.error) };

  const { supabase, user } = await requireUser();
  if (m.data.occurredOn > (await todayForUser())) return { ok: false, reason: "La fecha no puede ser futura." };

  const posicion = await leerPosicion(supabase, investmentId);
  if (!posicion) return { ok: false, reason: "No encuentro esa inversión." };

  const amount = round2(m.data.amount);
  if (m.data.kind === "retiro" && !retiroPermitido(posicion.movimientos, { amount, occurred_on: m.data.occurredOn })) {
    return { ok: false, reason: `El retiro supera el valor de la posición al ${fdate(m.data.occurredOn)}.` };
  }

  const { error } = await supabase.from("investment_movements").insert({
    user_id: user.id,
    investment_id: investmentId,
    kind: m.data.kind,
    amount,
    occurred_on: m.data.occurredOn,
    note: m.data.note
  });
  if (error) return { ok: false, reason: describeDbError(error) };
  revalidar(investmentId);
  return { ok: true };
}

export async function borrarMovimiento(id: string, investmentId: string): Promise<ResultadoDeAccion> {
  if (!UUID.safeParse(id).success || !UUID.safeParse(investmentId).success) return { ok: false, reason: "Movimiento inválido." };
  const { supabase } = await requireUser();
  const { error } = await supabase.from("investment_movements").delete().eq("id", id);
  if (error) return { ok: false, reason: describeDbError(error) };
  revalidar(investmentId);
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: falla SÓLO en `InvestmentForm.tsx` (sigue importando `upsertInvestment`). Eso lo arregla Task 4; no commitees con el typecheck roto: sigue a Task 4 y commitea las dos juntas.

---

### Task 4: `/investments`: formulario, curva global y enlace al detalle

**Files:**
- Create: `src/components/charts/InvestmentCurve.tsx`
- Modify: `src/app/(app)/investments/InvestmentForm.tsx`
- Modify: `src/app/(app)/investments/page.tsx`

**Interfaces:**
- Consumes: `crearPosicion`, `actualizarPosicion`, `deleteInvestment` (Task 3); `leerPosiciones` (Task 3); `curvaGlobal`, `rendimientoPct`, `PuntoDeCurva` (Task 1).
- Produces: `<InvestmentCurve data={PuntoDeCurva[]} currency={string} locale={string} />` (lo usa Task 5).

- [ ] **Step 1: The chart**

`src/components/charts/InvestmentCurve.tsx`:

```tsx
"use client";

import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PuntoDeCurva } from "@/lib/domain/money/curva-inversion.ts";
import { money, money0 } from "@/lib/format";
import ChartTooltip from "./ChartTooltip";
import { diaCorto, diaLargo } from "./format";

/**
 * La evolución de una inversión (o de todas). El VALOR es la serie que se lee
 * —área con lavado y línea de 2px—; el CAPITAL aportado va punteado y en gris:
 * es la referencia contra la que el valor gana o pierde, no otra serie igual
 * de importante. Entre dos movimientos no se inventan puntos.
 */
export default function InvestmentCurve({ data, currency, locale }: { data: PuntoDeCurva[]; currency: string; locale: string }) {
  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="fecha"
            tickFormatter={diaCorto}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--chart-grid)" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v: number) => money0(v, currency, locale)}
            tick={{ fill: "var(--muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={80}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeWidth: 1 }}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as PuntoDeCurva | undefined;
              if (!active || !p) return null;
              return <ChartTooltip value={money(p.valor, currency, locale)} label={diaLargo(p.fecha)} detail={`Capital aportado ${money(p.capital, currency, locale)}`} />;
            }}
          />
          <Line
            type="stepAfter"
            dataKey="capital"
            stroke="var(--muted)"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            isAnimationActive={false}
          />
          <Area
            type="linear"
            dataKey="valor"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="var(--chart-1)"
            fillOpacity={0.1}
            dot={false}
            activeDot={{ r: 4, fill: "var(--chart-1)", stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: The form**

`src/app/(app)/investments/InvestmentForm.tsx` — cambios exactos:

1. Import: `import { crearPosicion, actualizarPosicion, deleteInvestment } from "./actions";`
2. `InvestmentLite` pierde `principal`, `valuation`, `asOf`; queda `{ id, kind, name, institutionOrBroker, rate, source, familyMemberId }`.
3. El componente recibe además `today: string` (la fecha de hoy de la persona, la pasa la página).
4. El `action` del form pasa a:

```tsx
action={(fd) =>
  startTransition(async () => {
    const r = investment ? await actualizarPosicion(investment.id, fd) : await crearPosicion(fd);
    if (r.ok) {
      setOpen(false);
      setError(null);
    } else setError(r.reason);
  })
}
```

5. Sustituye los dos `grid` de «Capital invertido / Valor actual» y «asOf / Fuente» por:

```tsx
{!investment && (
  <div className="grid grid-cols-2 gap-2">
    <input name="monto" type="number" step="0.01" min="0.01" placeholder="Aportación inicial" required />
    <input name="fecha" type="date" defaultValue={today} max={today} required />
  </div>
)}
<input name="source" placeholder="Fuente" defaultValue={investment?.source ?? "Estado de cuenta"} required />
{investment && (
  <p className="text-xs" style={{ color: "var(--muted)" }}>
    El capital y el valor salen de los movimientos de la posición.
  </p>
)}
```

(El input de tasa se queda donde está.)

- [ ] **Step 3: The page**

`src/app/(app)/investments/page.tsx` — cambios exactos:

1. Imports nuevos:

```tsx
import Link from "next/link";
import InvestmentCurve from "@/components/charts/InvestmentCurve";
import { curvaGlobal, rendimientoPct } from "@/lib/domain/money/curva-inversion.ts";
import { leerPosiciones } from "@/lib/money/inversiones";
```

2. Tras el `Promise.all`, calcula hoy y la curva (sustituye el `todayInTimeZone(await getUserTimeZone())` del JSX por `hoy`):

```tsx
const hoy = todayInTimeZone(await getUserTimeZone());
const posiciones = await leerPosiciones(supabase);
const global = curvaGlobal(posiciones, profile.currency, hoy);
const ultimo = global.puntos[global.puntos.length - 1];
const rendGlobal = ultimo ? rendimientoPct(ultimo) : null;
```

3. Justo después de `<div className="flex flex-col gap-3.5">`, antes de la grid de dos tarjetas:

```tsx
{global.puntos.length >= 2 && ultimo && (
  <Card>
    <div className="flex items-baseline justify-between gap-3 mb-2">
      <h3 className="font-bold">Evolución de tus inversiones</h3>
      <span className="text-sm" style={{ color: "var(--muted)" }}>
        {money(ultimo.valor, profile.currency, profile.locale)}
        {rendGlobal !== null && (
          <b style={{ color: rendGlobal >= 0 ? "var(--ok)" : "var(--danger)", marginLeft: 8 }}>
            {rendGlobal >= 0 ? "+" : ""}{rendGlobal}%
          </b>
        )}
      </span>
    </div>
    <InvestmentCurve data={global.puntos} currency={profile.currency} locale={profile.locale} />
    <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
      Valor (línea) contra capital aportado (punteada). Rendimiento simple.
      {global.fuera > 0 && ` ${global.fuera} ${global.fuera === 1 ? "posición en otra moneda no suma" : "posiciones en otra moneda no suman"}.`}
    </p>
  </Card>
)}
```

4. En la fila de la tabla, el nombre enlaza: `<td className="py-2"><Link href={`/investments/${i.id}`}><b>{i.name}</b></Link></td>`.
5. Los dos `<InvestmentForm …>` reciben `today={hoy}`; el de edición pasa `investment={{ id: i.id, kind: i.kind, name: i.name, institutionOrBroker: i.institution || i.broker, rate: i.rate, source: i.source, familyMemberId: i.family_member_id }}`.
6. Cambia la columna «Fuente» a `{i.source} · {fdate(i.as_of)}` (igual que ahora: `as_of` ya lo mantiene el trigger).

- [ ] **Step 4: Typecheck, lint, tests**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit 2>&1 | tail -5
```
Expected: todo limpio; tests PASS.

- [ ] **Step 5: Commit (Tasks 3 y 4)**

```bash
git add src/lib/money/inversiones.ts "src/app/(app)/investments/actions.ts" "src/app/(app)/investments/InvestmentForm.tsx" "src/app/(app)/investments/page.tsx" src/components/charts/InvestmentCurve.tsx
git commit -m "D-200: /investments registra por movimientos y dibuja la curva global

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `/investments/[id]`

**Files:**
- Create: `src/app/(app)/investments/[id]/page.tsx`
- Create: `src/app/(app)/investments/[id]/MovimientoForm.tsx`
- Create: `src/app/(app)/investments/[id]/MovimientosLista.tsx`

**Interfaces:**
- Consumes: `leerPosicion` (Task 3), `registrarMovimiento`, `borrarMovimiento` (Task 3), `curvaDePosicion`, `rendimientoPct`, `MovimientoPuro`, `TipoDeMovimiento` (Task 1), `InvestmentCurve` (Task 4).
- Produces: la ruta `/investments/<uuid>` (la enlaza el componente del Centro en Task 8).

- [ ] **Step 1: The page**

`src/app/(app)/investments/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { getUserTimeZone } from "@/lib/data/profile";
import { todayInTimeZone } from "@/lib/domain/datetime.ts";
import { Card, EmptyState, Stat } from "@/components/ui";
import { money, fdate } from "@/lib/format";
import { curvaDePosicion, rendimientoPct } from "@/lib/domain/money/curva-inversion.ts";
import { leerPosicion } from "@/lib/money/inversiones";
import InvestmentCurve from "@/components/charts/InvestmentCurve";
import MovimientoForm from "./MovimientoForm";
import MovimientosLista from "./MovimientosLista";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Una posición: su curva, sus movimientos y dónde registrar el siguiente (D-200). */
export default async function PosicionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const supabase = await createClient();

  const [posicion, { data: profile }] = await Promise.all([
    leerPosicion(supabase, id),
    supabase.from("profiles").select("locale").eq("user_id", user.id).single()
  ]);
  if (!posicion) notFound();
  const locale = profile?.locale ?? "es-MX";
  const hoy = todayInTimeZone(await getUserTimeZone());

  const curva = curvaDePosicion(posicion.movimientos, hoy);
  const ultimo = curva[curva.length - 1] ?? { fecha: hoy, valor: 0, capital: 0 };
  const rend = rendimientoPct(ultimo);
  const recientes = [...posicion.movimientos].sort((a, b) =>
    a.occurred_on === b.occurred_on ? b.created_at.localeCompare(a.created_at) : b.occurred_on.localeCompare(a.occurred_on)
  );

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm">
        <Link href="/investments" style={{ color: "var(--muted)" }}>← Inversiones</Link>
      </div>
      <Card hero>
        <div className="text-xs" style={{ opacity: 0.85 }}>{posicion.name} · {posicion.institution || posicion.broker || "—"}</div>
        <div className="text-3xl font-black">{money(ultimo.valor, posicion.currency, locale)}</div>
        <div className="flex justify-between mt-1.5 text-sm">
          <span>Rendimiento simple</span>
          <b>{rend === null ? "—" : `${rend >= 0 ? "+" : ""}${rend}%`}</b>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-3.5">
        <Stat label="Capital aportado" value={money(ultimo.capital, posicion.currency, locale)} />
        <Stat label="Último movimiento" value={recientes[0] ? fdate(recientes[0].occurred_on) : "—"} />
      </div>
      <Card>
        <h3 className="font-bold mb-2">Evolución</h3>
        {curva.length >= 2 ? (
          <InvestmentCurve data={curva} currency={posicion.currency} locale={locale} />
        ) : (
          <EmptyState icon="📈" text="Registra una valuación o un movimiento más para ver la curva." />
        )}
      </Card>
      <Card>
        <h3 className="font-bold mb-2">Registrar movimiento</h3>
        <MovimientoForm investmentId={posicion.id} today={hoy} />
      </Card>
      <Card>
        <h3 className="font-bold mb-2">Movimientos</h3>
        {recientes.length ? (
          <MovimientosLista
            investmentId={posicion.id}
            currency={posicion.currency}
            locale={locale}
            movimientos={recientes.map((m) => ({ id: m.id!, kind: m.kind, amount: m.amount, occurred_on: m.occurred_on, note: m.note ?? "" }))}
          />
        ) : (
          <EmptyState icon="🧾" text="Sin movimientos." />
        )}
      </Card>
    </div>
  );
}
```

Verifica la firma de `Stat` en `src/components/ui.tsx:29` (`{ label, value, kind? }`) antes de usarlo.

- [ ] **Step 2: The form**

`src/app/(app)/investments/[id]/MovimientoForm.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import { registrarMovimiento } from "../actions";

export const ETIQUETA_DE_TIPO = {
  aportacion: "Aportación",
  retiro: "Retiro",
  rendimiento: "Rendimiento",
  valuacion: "Valuación"
} as const;

export default function MovimientoForm({ investmentId, today }: { investmentId: string; today: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={form}
      className="flex flex-col gap-2"
      action={(fd) =>
        startTransition(async () => {
          const r = await registrarMovimiento(investmentId, fd);
          if (r.ok) {
            setError(null);
            form.current?.reset();
          } else setError(r.reason);
        })
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <select name="kind" defaultValue="aportacion">
          {Object.entries(ETIQUETA_DE_TIPO).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input name="amount" type="number" step="0.01" min="0" placeholder="Monto" required />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input name="occurredOn" type="date" defaultValue={today} max={today} required />
        <input name="note" placeholder="Nota (opcional)" maxLength={200} />
      </div>
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Valuación = lo que vale la posición al cierre de ese día, con lo aportado ese día incluido.
      </p>
      {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary btn-sm" disabled={pending}>{pending ? "…" : "Registrar"}</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: The list**

`src/app/(app)/investments/[id]/MovimientosLista.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { money, fdate } from "@/lib/format";
import type { TipoDeMovimiento } from "@/lib/domain/money/curva-inversion.ts";
import { borrarMovimiento } from "../actions";
import { ETIQUETA_DE_TIPO } from "./MovimientoForm";

interface Fila {
  id: string;
  kind: TipoDeMovimiento;
  amount: number;
  occurred_on: string;
  note: string;
}

export default function MovimientosLista({ investmentId, movimientos, currency, locale }: { investmentId: string; movimientos: Fila[]; currency: string; locale: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && <div className="text-xs mb-2" style={{ color: "var(--danger)" }}>{error}</div>}
      <table className="w-full text-sm">
        <thead>
          <tr style={{ color: "var(--muted)" }} className="text-left">
            <th className="pb-2">Fecha</th>
            <th>Tipo</th>
            <th>Monto</th>
            <th>Nota</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {movimientos.map((m) => (
            <tr key={m.id} style={{ borderTop: "1px solid var(--line)" }}>
              <td className="py-2">{fdate(m.occurred_on)}</td>
              <td>{ETIQUETA_DE_TIPO[m.kind]}</td>
              <td style={{ color: m.kind === "retiro" ? "var(--danger)" : undefined }}>
                {m.kind === "retiro" ? "−" : ""}{money(m.amount, currency, locale)}
              </td>
              <td className="text-xs" style={{ color: "var(--muted)" }}>{m.note || "—"}</td>
              <td className="text-right">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await borrarMovimiento(m.id, investmentId);
                      setError(r.ok ? null : r.reason);
                    })
                  }
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
```

- [ ] **Step 4: Typecheck, lint, build**

```bash
pnpm typecheck && pnpm lint && pnpm build 2>&1 | tail -15
```
Expected: limpio; la build lista `/investments/[id]`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(app)/investments/[id]"
git commit -m "D-200: cada posición tiene su página, su curva y sus movimientos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Capacidad «inversiones» en el Centro

**Files:**
- Create: `src/lib/domain/centro/agente/inversiones.ts`
- Test: `tests/domain/centro-agente-inversiones.test.ts`
- Modify: `src/lib/domain/centro/agente/contrato.ts:30` (`CAPACIDADES`)
- Modify: `src/lib/centro/agente/capacidades.ts`
- Modify: `src/lib/insights/context.ts:145` (añadir `investment_movements` a `TABLAS_CONSULTABLES`)
- Modify: `src/lib/domain/centro/agente/prompt.ts`

**Interfaces:**
- Consumes: `curvaDePosicion`, `curvaGlobal`, `rendimientoPct`, `recortarCurva`, `PosicionConMovimientos`, `TipoDeMovimiento` (Task 1); `leerPosiciones` (Task 3); `money`, `fdate` (`src/lib/format.ts`); `recortar`, `LIMITES` (`runtime/secciones.ts`); `AnySection`.
- Produces:
  - `VISTAS_INVERSION = ["global","posicion","movimientos"] as const`
  - `leerParametrosInversiones(raw: unknown): { vista: "global" | "posicion" | "movimientos"; posicion: string | null }`
  - `seccionesDeInversiones(e: { parametros; moneda: string; locale: string; hoy: string; posiciones: PosicionConMovimientos[] }): AnySection[]`
  - `NOMBRE_DE_TIPO: Record<TipoDeMovimiento, string>`
  - `CAPACIDADES = ["mercado", "hoy", "inversiones"]`

- [ ] **Step 1: Write the failing test**

`tests/domain/centro-agente-inversiones.test.ts`:

```ts
// tests/domain/centro-agente-inversiones.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerParametrosInversiones, seccionesDeInversiones } from "../../src/lib/domain/centro/agente/inversiones.ts";
import { validarPorSeccion } from "../../src/lib/domain/centro/runtime/validador.ts";
import { money } from "../../src/lib/format.ts";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";

const mov = (id: string, kind: "aportacion" | "retiro" | "rendimiento" | "valuacion", amount: number, occurred_on: string) => ({
  id,
  kind,
  amount,
  occurred_on,
  created_at: `${occurred_on}T12:00:00Z`,
  note: ""
});

const posiciones = [
  { id: P1, name: "CETES 28d", currency: "MXN", movimientos: [mov("m1", "aportacion", 1000, "2026-01-01"), mov("m2", "valuacion", 1100, "2026-02-01")] },
  { id: P2, name: "Fibra", currency: "MXN", movimientos: [mov("m3", "aportacion", 500, "2026-01-15")] },
  { id: P3, name: "VOO", currency: "USD", movimientos: [mov("m4", "aportacion", 99, "2026-01-10")] }
];
const base = { moneda: "MXN", locale: "es-MX", hoy: "2026-03-01", posiciones };

test("Parámetros: global por defecto; acepta el uuid solo o como fila", () => {
  assert.deepStrictEqual(leerParametrosInversiones({}), { vista: "global", posicion: null });
  assert.deepStrictEqual(leerParametrosInversiones({ vista: "posicion", posicion: `fila:investments:${P1}` }), { vista: "posicion", posicion: P1 });
  assert.deepStrictEqual(leerParametrosInversiones({ vista: "posicion", posicion: P1 }), { vista: "posicion", posicion: P1 });
  assert.deepStrictEqual(leerParametrosInversiones({ vista: "volar", posicion: "no-uuid" }), { vista: "global", posicion: null });
});

test("Global: total, nota con capital, rendimiento y lo que no suma, y la curva", () => {
  const [s] = seccionesDeInversiones({ ...base, parametros: { vista: "global", posicion: null } });
  assert.ok(s && s.kind === "portfolio");
  assert.strictEqual(s.data.total, money(1600, "MXN", "es-MX"));
  assert.match(s.data.nota, /Capital aportado/);
  assert.match(s.data.nota, /\+6\.7%/);
  assert.match(s.data.nota, /1 posición en otra moneda no suma/);
  assert.deepStrictEqual(s.data.serie.map((p) => p.y), [1000, 1500, 1600, 1600]);
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
});

test("Global sin nada en tu moneda: vacío que lo dice", () => {
  const [s] = seccionesDeInversiones({ ...base, posiciones: [posiciones[2]!], parametros: { vista: "global", posicion: null } });
  assert.ok(s && s.kind === "emptyState");
  assert.match(s.data.mensaje, /otra moneda/);
});

test("Posición: su valor en SU moneda, con su nombre de título", () => {
  const [s] = seccionesDeInversiones({ ...base, parametros: { vista: "posicion", posicion: P3 } });
  assert.ok(s && s.kind === "portfolio");
  assert.strictEqual(s.title, "VOO");
  assert.strictEqual(s.data.total, money(99, "USD", "es-MX"));
});

test("Posición que no existe (o no es tuya): vacío, nunca la de otro", () => {
  const [s] = seccionesDeInversiones({ ...base, parametros: { vista: "posicion", posicion: "99999999-9999-4999-8999-999999999999" } });
  assert.ok(s && s.kind === "emptyState");
  assert.strictEqual(s.data.mensaje, "No encuentro esa inversión.");
});

test("Movimientos: tabla de los más recientes, con enlace a /investments", () => {
  const [s] = seccionesDeInversiones({ ...base, parametros: { vista: "movimientos", posicion: null } });
  assert.ok(s && s.kind === "table");
  assert.deepStrictEqual(s.data.columnas, ["Fecha", "Posición", "Tipo", "Monto"]);
  assert.strictEqual(s.data.filas[0]!.celdas[1], "CETES 28d");
  assert.strictEqual(s.data.filas[0]!.celdas[2], "Valuación");
  assert.strictEqual(s.data.filas[0]!.href, "/investments");
  assert.strictEqual(s.data.filas.length, 4);
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
});

test("Movimientos de una posición sin movimientos: vacío", () => {
  const vacia = { id: P1, name: "Nueva", currency: "MXN", movimientos: [] };
  const [s] = seccionesDeInversiones({ ...base, posiciones: [vacia], parametros: { vista: "movimientos", posicion: P1 } });
  assert.ok(s && s.kind === "emptyState");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-inversiones.test.ts`
Expected: FAIL — módulo no encontrado.

- [ ] **Step 3: Implement**

`src/lib/domain/centro/agente/inversiones.ts`:

```ts
// src/lib/domain/centro/agente/inversiones.ts
// La capacidad «inversiones», sin red (D-202). Pura, probada en
// tests/domain/centro-agente-inversiones.test.ts.
//
// Todas las cifras las calcula esto, con la misma curva que /investments: el
// modelo solo elige la vista y la posición. Una posición que no está entre
// las que la RLS devolvió no existe para el Centro.

import { curvaDePosicion, curvaGlobal, rendimientoPct, recortarCurva, type PosicionConMovimientos, type PuntoDeCurva, type TipoDeMovimiento } from "../../money/curva-inversion.ts";
import { fdate, money } from "../../../format.ts";
import { LIMITES, recortar } from "../runtime/secciones.ts";
import type { AnySection } from "../runtime/types.ts";

export const VISTAS_INVERSION = ["global", "posicion", "movimientos"] as const;
export type VistaInversion = (typeof VISTAS_INVERSION)[number];

export interface ParametrosInversiones {
  vista: VistaInversion;
  posicion: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MOVIMIENTOS = 10;

export const NOMBRE_DE_TIPO: Record<TipoDeMovimiento, string> = {
  aportacion: "Aportación",
  retiro: "Retiro",
  rendimiento: "Rendimiento",
  valuacion: "Valuación"
};

export function leerParametrosInversiones(raw: unknown): ParametrosInversiones {
  const r = (raw ?? {}) as Record<string, unknown>;
  const vista = (VISTAS_INVERSION as readonly string[]).includes(r.vista as string) ? (r.vista as VistaInversion) : "global";
  const crudo = typeof r.posicion === "string" ? r.posicion.replace(/^fila:investments:/, "") : "";
  return { vista, posicion: UUID.test(crudo) ? crudo : null };
}

function nota(p: PuntoDeCurva, moneda: string, locale: string, extra: string | null): string {
  const rend = rendimientoPct(p);
  const partes = [
    `Capital aportado ${money(p.capital, moneda, locale)}`,
    rend === null ? null : `rendimiento ${rend >= 0 ? "+" : ""}${rend}%`,
    `al ${fdate(p.fecha, locale)}`,
    extra
  ].filter(Boolean);
  return recortar(partes.join(" · "), 160);
}

const serieDe = (puntos: PuntoDeCurva[]) => (puntos.length >= 2 ? recortarCurva(puntos).map((p) => ({ x: p.fecha, y: p.valor })) : []);

const vacio = (id: string, title: string, mensaje: string): AnySection => ({ id, kind: "emptyState", title, data: { mensaje } });

export function seccionesDeInversiones(e: {
  parametros: ParametrosInversiones;
  moneda: string;
  locale: string;
  hoy: string;
  posiciones: PosicionConMovimientos[];
}): AnySection[] {
  const { parametros: p } = e;
  const elegida = p.posicion ? e.posiciones.find((x) => x.id === p.posicion) ?? null : null;
  if (p.posicion && !elegida) return [vacio("inversiones-posicion", "Inversiones", "No encuentro esa inversión.")];

  if (p.vista === "movimientos") {
    const fuente = elegida ? [elegida] : e.posiciones;
    const todos = fuente.flatMap((x) => x.movimientos.map((m) => ({ m, x })));
    todos.sort((a, b) =>
      a.m.occurred_on === b.m.occurred_on ? b.m.created_at.localeCompare(a.m.created_at) : b.m.occurred_on.localeCompare(a.m.occurred_on)
    );
    if (!todos.length) return [vacio("inversiones-movimientos", "Movimientos", "Aún no hay movimientos registrados.")];
    return [{
      id: "inversiones-movimientos",
      kind: "table",
      data: {
        titulo: elegida ? recortar(`Movimientos · ${elegida.name}`, 80) : "Últimos movimientos",
        columnas: ["Fecha", "Posición", "Tipo", "Monto"],
        filas: todos.slice(0, MAX_MOVIMIENTOS).map(({ m, x }, i) => ({
          id: m.id ?? `${x.id}-${i}`,
          celdas: [
            fdate(m.occurred_on, e.locale),
            recortar(x.name, LIMITES.celda),
            NOMBRE_DE_TIPO[m.kind],
            `${m.kind === "retiro" ? "−" : ""}${money(m.amount, x.currency, e.locale)}`
          ],
          href: "/investments"
        }))
      }
    }];
  }

  if (p.vista === "posicion" && elegida) {
    const curva = curvaDePosicion(elegida.movimientos, e.hoy);
    const ultimo = curva[curva.length - 1];
    if (!ultimo) return [vacio("inversiones-posicion", recortar(elegida.name, 80), "Esta inversión aún no tiene movimientos.")];
    return [{
      id: "inversiones-posicion",
      kind: "portfolio",
      title: recortar(elegida.name, 80),
      data: { total: money(ultimo.valor, elegida.currency, e.locale), nota: nota(ultimo, elegida.currency, e.locale, null), serie: serieDe(curva) }
    }];
  }

  const g = curvaGlobal(e.posiciones, e.moneda, e.hoy);
  const ultimo = g.puntos[g.puntos.length - 1];
  if (!ultimo) {
    const mensaje = g.fuera > 0 ? "Tus inversiones están en otra moneda y no se suman aquí." : "Aún no registras inversiones.";
    return [vacio("inversiones-global", "Tus inversiones", mensaje)];
  }
  const extra = g.fuera > 0 ? `${g.fuera} ${g.fuera === 1 ? "posición en otra moneda no suma" : "posiciones en otra moneda no suman"}` : null;
  return [{
    id: "inversiones-global",
    kind: "portfolio",
    title: "Tus inversiones",
    data: { total: money(ultimo.valor, e.moneda, e.locale), nota: nota(ultimo, e.moneda, e.locale, extra), serie: serieDe(g.puntos) }
  }];
}
```

Nota: `+6.7%` en la prueba sale de valor 1600 / capital 1500. Si `rendimientoPct` da `6.7`, el texto es `rendimiento +6.7%`.

- [ ] **Step 4: Run to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-inversiones.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire it**

1. `src/lib/domain/centro/agente/contrato.ts:30`: `export const CAPACIDADES = ["mercado", "hoy", "inversiones"] as const;`
2. `src/lib/centro/agente/capacidades.ts`:
   - imports: `import { leerParametrosInversiones, seccionesDeInversiones } from "@/lib/domain/centro/agente/inversiones.ts";`, `import { curvaGlobal, recortarCurva } from "@/lib/domain/money/curva-inversion.ts";`, `import { leerPosiciones } from "@/lib/money/inversiones";`
   - nuevo hidratador:

```ts
async function inversiones(parametros: Record<string, unknown>, c: Cerebro): Promise<ResultadoDeCapacidad> {
  const posiciones = await leerPosiciones(c.supabase);
  const secciones = seccionesDeInversiones({
    parametros: leerParametrosInversiones(parametros),
    moneda: c.moneda,
    locale: c.locale,
    hoy: c.today,
    posiciones
  });
  return { secciones, proyectos: [] };
}
```

   - En `mercado`, el `portafolio` deja de leer `net_worth_snapshots` (era el patrimonio neto con título de portafolio). Sustituye la tercera promesa del `Promise.all` por `p.vista === "portafolio" ? leerPosiciones(c.supabase) : Promise.resolve(null)` (renombra `snap` a `posiciones`) y el campo `historia` por:

```ts
historia: posiciones
  ? recortarCurva(curvaGlobal(posiciones, c.moneda, c.today).puntos).map((p) => ({ x: p.fecha, y: p.valor }))
  : []
```

   - Actualiza el comentario de `EntradaMercado.historia` en `src/lib/domain/centro/agente/mercado.ts` a «La curva global de inversiones (D-202), para la línea del portafolio.»
   - `export const CAPACIDADES_REGISTRADAS: Record<(typeof CAPACIDADES)[number], Hidratador> = { mercado, hoy, inversiones };` (importa `CAPACIDADES` como tipo desde el contrato).
3. `src/lib/insights/context.ts`, tras la línea de `investments`:

```ts
  investment_movements: { domain: "money", fecha: "occurred_on", select: "id, investment_id, kind, amount, occurred_on, note, created_at" },
```

4. `src/lib/domain/centro/agente/prompt.ts`, en «Capacidades», tras «hoy»:

```
- «inversiones»: { "vista": "global"|"posicion"|"movimientos", "posicion"?: "fila:investments:<uuid> que leíste" }. La evolución de tus inversiones (curva global), la de UNA posición, o sus últimos movimientos. Para «¿cómo van mis inversiones?», «¿cómo va CETES?». Prefiérela a «mercado» cuando hablen de SUS posiciones.
```

- [ ] **Step 6: Full unit suite + typecheck**

```bash
pnpm typecheck && pnpm test:unit 2>&1 | tail -8
```
Expected: PASS. Si `centro-agente-prompt.test.ts` o `centro-agente-catalogo.test.ts` exigen algo por cada capacidad (p. ej. que aparezca en el prompt o en `ESQUEMA_RESPUESTA`), cúmplelo — no relajes la prueba. Si `centro-agente-mercado.test.ts` asume historia de patrimonio en algún texto, ajústalo sólo si la prueba describe el comportamiento viejo.

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/centro/agente/inversiones.ts tests/domain/centro-agente-inversiones.test.ts src/lib/domain/centro/agente/contrato.ts src/lib/centro/agente/capacidades.ts src/lib/insights/context.ts src/lib/domain/centro/agente/prompt.ts src/lib/domain/centro/agente/mercado.ts
git commit -m "D-202: el Centro enseña la evolución de tus inversiones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Bloque «propuesta_movimiento»: contrato, sección y resolución

**Files:**
- Modify: `src/lib/domain/centro/agente/contrato.ts`
- Modify: `src/lib/domain/centro/runtime/secciones.ts`
- Modify: `src/lib/domain/centro/runtime/validador.ts`
- Create: `src/lib/domain/centro/agente/propuesta-movimiento.ts`
- Test: `tests/domain/centro-agente-propuesta.test.ts`
- Modify: `src/lib/centro/agente/pensar.ts`

**Interfaces:**
- Consumes: `TIPOS_DE_MOVIMIENTO`, `TipoDeMovimiento` (Task 1); `addDaysISO` (`src/lib/domain/datetime.ts`); `round2`; `recortar`.
- Produces:
  - Kind del agente `"propuesta_movimiento"` en `KINDS_DEL_AGENTE`; variante `{ kind: "propuesta_movimiento"; fila: string; tipo: TipoDeMovimiento; monto: number; fecha: string | null; nota: string | null }` en `BloqueDelAgente`.
  - Section kind `"propuestaMovimiento"` con `DatosPropuestaMovimiento { investmentId: string; posicion: string; moneda: string; tipo: TipoDeMovimiento; monto: number; fecha: string; nota: string | null }`.
  - `resolverPropuesta(b, id, ctx: { filas: ReadonlyMap<string, Record<string, unknown>>; hoy: string; moneda: string }): { ok: true; seccion: AnySection } | { ok: false; reason: string }`
  - `MAX_DIAS_ATRAS = 3653`

- [ ] **Step 1: Write the failing test**

`tests/domain/centro-agente-propuesta.test.ts`:

```ts
// tests/domain/centro-agente-propuesta.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearRespuesta } from "../../src/lib/domain/centro/agente/contrato.ts";
import { resolverPropuesta } from "../../src/lib/domain/centro/agente/propuesta-movimiento.ts";
import { validarPorSeccion } from "../../src/lib/domain/centro/runtime/validador.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const FILA = `fila:investments:${ID}`;
const b = (datos: unknown) => ({ kind: "propuesta_movimiento", datos: JSON.stringify(datos) });
const turno = (datos: unknown) => parsearRespuesta({ texto: "¿Lo guardo?", bloques: [b(datos)] });

test("Contrato: una propuesta bien formada pasa", () => {
  const r = turno({ fila: FILA, tipo: "aportacion", monto: 5000, fecha: "2026-09-20", nota: null });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques, [{ kind: "propuesta_movimiento", fila: FILA, tipo: "aportacion", monto: 5000, fecha: "2026-09-20", nota: null }]);
});

test("Contrato: fila de otra tabla, tipo desconocido, monto 0 en un flujo: fuera", () => {
  for (const datos of [
    { fila: `fila:debts:${ID}`, tipo: "aportacion", monto: 1, fecha: null, nota: null },
    { fila: FILA, tipo: "compra", monto: 1, fecha: null, nota: null },
    { fila: FILA, tipo: "aportacion", monto: 0, fecha: null, nota: null },
    { fila: FILA, tipo: "retiro", monto: -5, fecha: null, nota: null }
  ]) {
    const r = turno(datos);
    assert.ok(r.ok);
    assert.strictEqual(r.ok && r.value.bloques.length, 0, JSON.stringify(datos));
  }
});

test("Contrato: una valuación en 0 sí pasa", () => {
  const r = turno({ fila: FILA, tipo: "valuacion", monto: 0, fecha: null, nota: null });
  assert.strictEqual(r.ok && r.value.bloques.length, 1);
});

const fila = { id: ID, name: "CETES 28d", currency: "MXN" };
const ctx = { filas: new Map([[FILA, fila]]), hoy: "2026-09-25", moneda: "MXN" };
const bloque = { kind: "propuesta_movimiento" as const, fila: FILA, tipo: "aportacion" as const, monto: 5000.004, fecha: null, nota: "Quincena" };

test("Resolver: sin fecha es hoy; nombre y moneda salen de la fila leída, no del modelo", () => {
  const r = resolverPropuesta(bloque, "b0", ctx);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.seccion, {
    id: "b0",
    kind: "propuestaMovimiento",
    data: { investmentId: ID, posicion: "CETES 28d", moneda: "MXN", tipo: "aportacion", monto: 5000, fecha: "2026-09-25", nota: "Quincena" }
  });
  assert.strictEqual(validarPorSeccion([r.ok ? r.seccion : (null as never)], [], "test").length, 1);
});

test("Resolver: una posición que el modelo no leyó en este turno no se propone", () => {
  const r = resolverPropuesta(bloque, "b0", { ...ctx, filas: new Map() });
  assert.deepStrictEqual(r, { ok: false, reason: `«propuesta_movimiento»: ${FILA} no se leyó en este turno.` });
});

test("Resolver: ni futura ni de hace más de diez años", () => {
  assert.strictEqual(resolverPropuesta({ ...bloque, fecha: "2026-09-26" }, "b0", ctx).ok, false);
  // 3653 días atrás desde 2026-09-25 es 2016-09-24 (2020 y 2024 son bisiestos).
  assert.strictEqual(resolverPropuesta({ ...bloque, fecha: "2016-09-23" }, "b0", ctx).ok, false);
  assert.strictEqual(resolverPropuesta({ ...bloque, fecha: "2016-09-24" }, "b0", ctx).ok, true);
});

test("Validador: propuestaMovimiento con campo de más o sin uuid, fuera", () => {
  const buena = { id: "b0", kind: "propuestaMovimiento", data: { investmentId: ID, posicion: "X", moneda: "MXN", tipo: "retiro", monto: 10, fecha: "2026-09-25", nota: null } } as const;
  assert.strictEqual(validarPorSeccion([buena], [], "test").length, 1);
  assert.strictEqual(validarPorSeccion([{ ...buena, data: { ...buena.data, investmentId: "x" } }] as never, [], "test").length, 0);
  assert.strictEqual(validarPorSeccion([{ ...buena, data: { ...buena.data, extra: 1 } }] as never, [], "test").length, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-propuesta.test.ts`
Expected: FAIL (módulo `propuesta-movimiento.ts` no existe).

- [ ] **Step 3: Contract**

`src/lib/domain/centro/agente/contrato.ts`:

1. Import: `import { TIPOS_DE_MOVIMIENTO } from "../../money/curva-inversion.ts";`
2. `KINDS_DEL_AGENTE`: `[...GENERICOS, "ir_a", "recomendaciones", "insight", "propuesta_movimiento", ...CAPACIDADES] as const`
3. Tras `ESQUEMA_INSIGHT`:

```ts
/**
 * Proponer un movimiento de inversión (D-202). La ÚNICA cifra que el modelo
 * pone en un bloque: el monto que la persona DICTÓ. No se guarda aquí: se
 * pinta con Guardar/Descartar y lo guarda la persona, por la misma acción que
 * /investments. La fila tiene que ser de `investments` y leída en el turno
 * (lo comprueba `resolverPropuesta`).
 */
const ESQUEMA_PROPUESTA_MOVIMIENTO = z
  .object({
    fila: z.string().regex(/^fila:investments:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
    tipo: z.enum(TIPOS_DE_MOVIMIENTO),
    monto: z.number().finite().min(0).max(1e12),
    fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    nota: z.string().trim().max(200).nullable()
  })
  .strict()
  .refine((p) => p.tipo === "valuacion" || p.monto > 0, { message: "un flujo necesita monto mayor que 0", path: ["monto"] });
```

4. `BloqueDelAgente` añade `| ({ kind: "propuesta_movimiento" } & z.infer<typeof ESQUEMA_PROPUESTA_MOVIMIENTO>)`.
5. En `parsearBloque`, la cadena del `esquema` añade `: kind === "propuesta_movimiento" ? ESQUEMA_PROPUESTA_MOVIMIENTO` antes del `: null`. (El tipo de `esquema` puede necesitar `z.ZodTypeAny` explícito por el `refine` → `ZodEffects`: declara `const esquema: z.ZodTypeAny | null = …`.)

- [ ] **Step 4: Section kind and validator**

`src/lib/domain/centro/runtime/secciones.ts`:

1. Al final de `SECTION_KINDS`, tras `"rutina"`:

```ts
  // D-202: un movimiento de inversión que el agente propone y la persona guarda.
  "propuestaMovimiento"
```

2. Import `import type { TipoDeMovimiento } from "../../money/curva-inversion.ts";` y la interfaz:

```ts
export interface DatosPropuestaMovimiento {
  investmentId: string;
  posicion: string;
  moneda: string;
  tipo: TipoDeMovimiento;
  monto: number;
  fecha: string;
  nota: string | null;
}
```

3. `DatosPorKind` añade `propuestaMovimiento: DatosPropuestaMovimiento;`

`src/lib/domain/centro/runtime/validador.ts`: import `TIPOS_DE_MOVIMIENTO` desde `"../../money/curva-inversion.ts"` y en `ESQUEMAS`, tras `rutina`:

```ts
  propuestaMovimiento: z
    .object({
      investmentId: z.string().uuid(),
      posicion: texto(120),
      moneda: z.string().regex(/^[A-Z]{3}$/),
      tipo: z.enum(TIPOS_DE_MOVIMIENTO),
      monto: z.number().finite().min(0).max(1e12),
      fecha,
      nota: texto(200).nullable()
    })
    .strict(),
```

- [ ] **Step 5: Resolver**

`src/lib/domain/centro/agente/propuesta-movimiento.ts`:

```ts
// src/lib/domain/centro/agente/propuesta-movimiento.ts
// De la propuesta del modelo a la sección que la persona confirma (D-202).
// Pura, probada en tests/domain/centro-agente-propuesta.test.ts.
//
// El nombre y la moneda salen de la FILA LEÍDA, no del modelo: lo único suyo
// es el tipo, el monto que la persona dictó, la fecha y la nota. Una fila que
// no se leyó en este turno —inventada, o de otra persona— no se propone.

import { addDaysISO } from "../../datetime.ts";
import { round2 } from "../../budget.ts";
import type { TipoDeMovimiento } from "../../money/curva-inversion.ts";
import { recortar } from "../runtime/secciones.ts";
import type { AnySection } from "../runtime/types.ts";

export const MAX_DIAS_ATRAS = 3653;

export interface BloquePropuesta {
  kind: "propuesta_movimiento";
  fila: string;
  tipo: TipoDeMovimiento;
  monto: number;
  fecha: string | null;
  nota: string | null;
}

export function resolverPropuesta(
  b: BloquePropuesta,
  id: string,
  ctx: { filas: ReadonlyMap<string, Record<string, unknown>>; hoy: string; moneda: string }
): { ok: true; seccion: AnySection } | { ok: false; reason: string } {
  const r = ctx.filas.get(b.fila);
  if (!r) return { ok: false, reason: `«propuesta_movimiento»: ${b.fila} no se leyó en este turno.` };
  const fecha = b.fecha ?? ctx.hoy;
  if (fecha > ctx.hoy) return { ok: false, reason: "«propuesta_movimiento»: fecha futura." };
  if (fecha < addDaysISO(ctx.hoy, -MAX_DIAS_ATRAS)) return { ok: false, reason: "«propuesta_movimiento»: fecha de hace más de diez años." };
  const nombre = typeof r.name === "string" && r.name.trim() ? r.name.trim() : null;
  if (!nombre) return { ok: false, reason: "«propuesta_movimiento»: la fila no trae nombre." };
  const moneda = typeof r.currency === "string" && /^[A-Z]{3}$/.test(r.currency) ? r.currency : ctx.moneda;
  return {
    ok: true,
    seccion: {
      id,
      kind: "propuestaMovimiento",
      data: {
        investmentId: b.fila.slice("fila:investments:".length),
        posicion: recortar(nombre, 120),
        moneda,
        tipo: b.tipo,
        monto: round2(b.monto),
        fecha,
        nota: b.nota?.trim() ? b.nota.trim() : null
      }
    }
  };
}
```

La prueba asume que `addDaysISO("2026-09-25", -3653)` da `"2016-09-24"` (23 fuera, 24 dentro).

- [ ] **Step 6: Wire into the turn**

`src/lib/centro/agente/pensar.ts`, import `import { resolverPropuesta } from "@/lib/domain/centro/agente/propuesta-movimiento.ts";` y en el `switch` de `resolverSinCapacidad`, antes de `default`:

```ts
    case "propuesta_movimiento": {
      const r = resolverPropuesta(b, id, { filas: ctx.filas, hoy: cerebro.today, moneda: cerebro.moneda });
      if (!r.ok) {
        console.warn("[centro-agente] bloque descartado:", r.reason);
        return [];
      }
      return [r.seccion];
    }
```

- [ ] **Step 7: Run tests**

```bash
node --experimental-strip-types --test tests/domain/centro-agente-propuesta.test.ts && pnpm typecheck && pnpm test:unit 2>&1 | tail -8
```
Expected: PASS. Si `centro-runtime-catalogo.test.ts` o `centro-runtime-registro.test.ts` exigen componente para cada kind con esquema, fallará hasta Task 8: en ese caso junta el commit con Task 8.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/centro/agente/contrato.ts src/lib/domain/centro/runtime/secciones.ts src/lib/domain/centro/runtime/validador.ts src/lib/domain/centro/agente/propuesta-movimiento.ts tests/domain/centro-agente-propuesta.test.ts src/lib/centro/agente/pensar.ts
git commit -m "D-202: el Centro propone un movimiento anclado a una posición leída

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Componente de la propuesta y prompt

**Files:**
- Create: `src/components/centro-runtime/secciones/PropuestaMovimiento.tsx`
- Modify: `src/components/centro-runtime/index.ts`
- Modify: `src/lib/domain/centro/agente/prompt.ts`

**Interfaces:**
- Consumes: `registrarMovimiento` (Task 3), `PropsDeSeccion<"propuestaMovimiento">` (Task 7), `NOMBRE_DE_TIPO` (Task 6), `money`, `fdate`.

- [ ] **Step 1: The component**

`src/components/centro-runtime/secciones/PropuestaMovimiento.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { registrarMovimiento } from "@/app/(app)/investments/actions";
import { NOMBRE_DE_TIPO } from "@/lib/domain/centro/agente/inversiones.ts";
import { money, fdate } from "@/lib/format";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

type Estado = "pendiente" | "guardado" | "descartado";

/**
 * Un movimiento que el agente propone (D-202). No existe hasta que la persona
 * pulsa Guardar, y se guarda por `registrarMovimiento`, la MISMA acción que
 * /investments/[id]: zod, RLS y el tope del retiro valen igual se registre
 * desde donde se registre.
 */
export default function SeccionPropuestaMovimiento({ data, alAceptar }: PropsDeSeccion<"propuestaMovimiento">) {
  const [estado, setEstado] = useState<Estado>("pendiente");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const href = `/investments/${data.investmentId}`;

  function guardar() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("kind", data.tipo);
      fd.set("amount", String(data.monto));
      fd.set("occurredOn", data.fecha);
      fd.set("note", data.nota ?? "");
      try {
        const r = await registrarMovimiento(data.investmentId, fd);
        if (r.ok) {
          setEstado("guardado");
          setError(null);
        } else setError(r.reason);
      } catch {
        setError("No se pudo guardar. Inténtalo de nuevo.");
      }
    });
  }

  if (estado === "descartado") return null;

  return (
    <div className="ag-card">
      <h3 className="ag-card-titulo">Registrar en inversiones</h3>
      <p>
        {NOMBRE_DE_TIPO[data.tipo]} de <b>{money(data.monto, data.moneda)}</b> en <b>{data.posicion}</b> el {fdate(data.fecha)}
      </p>
      {data.nota && <p className="ag-muted">{data.nota}</p>}
      {error && <p className="ag-tono-bad">{error}</p>}
      {estado === "guardado" ? (
        <p className="ag-acciones">
          <span className="ag-tono-ok">Guardado ✓</span>
          <a className="ag-boton-chico" href={href} onClick={(e) => { e.preventDefault(); alAceptar(href); window.location.assign(href); }}>
            Ver curva
          </a>
        </p>
      ) : (
        <p className="ag-acciones">
          <button type="button" className="ag-boton-chico" disabled={pending} onClick={guardar}>
            {pending ? "…" : "Guardar"}
          </button>
          <button type="button" className="ag-boton-chico" disabled={pending} onClick={() => setEstado("descartado")}>
            Descartar
          </button>
        </p>
      )}
    </div>
  );
}

registrarSeccion("propuestaMovimiento", SeccionPropuestaMovimiento);
```

Antes de escribirlo, mira cómo navega `Recomendaciones.tsx` al aceptar (`alAceptar(r.href); router.push(r.href)`) y usa el mismo patrón con `useRouter` en vez de `window.location.assign` si ahí es `router.push`. Revisa también que las clases `ag-acciones`, `ag-boton-chico`, `ag-tono-ok`, `ag-tono-bad` existan en `src/app/globals.css` (las usa `Recomendaciones.tsx`).

- [ ] **Step 2: Register it**

`src/components/centro-runtime/index.ts`: añade `import "./secciones/PropuestaMovimiento";` tras `import "./secciones/Rutina";`.

- [ ] **Step 3: Prompt**

`src/lib/domain/centro/agente/prompt.ts`, en «Bloques de acción», tras «insight»:

```
- «propuesta_movimiento»: { "fila": "fila:investments:<uuid>", "tipo": "aportacion"|"retiro"|"rendimiento"|"valuacion", "monto": número, "fecha": "YYYY-MM-DD"|null, "nota": texto|null }. Cuando la persona dice que metió, sacó, cobró o que su inversión vale X. ANTES lee la posición (buscar por nombre o consultar investments) y usa su "fila". El monto es EXACTAMENTE el que dijo la persona: nunca lo calcules ni lo inventes; si no lo dijo, pregúntalo en "texto" y no propongas. Si el nombre encaja con más de una posición, pregunta cuál. "valuacion" = cuánto vale HOY (o en la fecha que diga), no cuánto ganó. NO se guarda solo: la persona pulsa Guardar. Nunca digas que ya quedó registrado.
```

Y en la REGLA DE ORO añade al final: `La única excepción es el "monto" de «propuesta_movimiento», que es la cifra que la persona dictó.`

- [ ] **Step 4: Tests, typecheck, lint, build**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit 2>&1 | tail -8 && pnpm build 2>&1 | tail -8
```
Expected: todo PASS. (`centro-agente-prompt.test.ts` puede comprobar que cada kind aparece en el prompt: ahora aparece.)

- [ ] **Step 5: Commit**

```bash
git add src/components/centro-runtime/secciones/PropuestaMovimiento.tsx src/components/centro-runtime/index.ts src/lib/domain/centro/agente/prompt.ts
git commit -m "D-202: la persona guarda desde el Centro lo que el agente propone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Decisiones, verificación en navegador y cierre

**Files:**
- Modify: `docs/DECISIONS.md` (al final)

- [ ] **Step 1: DECISIONS.md**

Añade al final, en el formato de D-197…D-199 (mira `docs/DECISIONS.md:3972` en adelante):

```markdown
- **D-200 · Los movimientos son la verdad de una inversión.** `investment_movements`
  (aportación, retiro, rendimiento, valuación) y un trigger que mantiene
  `investments.principal/valuation/as_of` como resumen, para que ningún lector
  cambie. Sin `update` de movimientos. Relleno: cada posición existente arranca
  con una aportación y una valuación a su `as_of` (mismos números). Migración 0077.
- **D-201 · La curva se calcula en TS con la semántica del trigger.** Una
  valuación es el valor al cierre de su día; los flujos posteriores se le suman;
  el rendimiento sube el valor y no el capital. `CASOS_COMPARTIDOS` se prueba en
  node y en pgTAP. La global no convierte monedas: dice cuántas no suman.
- **D-202 · El Centro ve y propone; la persona guarda.** Capacidad
  «inversiones» (global, posición, movimientos) y bloque «propuesta_movimiento»
  anclado a una fila de `investments` leída en el turno. El monto es la única
  cifra del modelo en un bloque: la dictó la persona y la confirma. Se guarda por
  la misma acción que /investments. «mercado/portafolio» dibuja ahora la curva
  global, no el patrimonio neto.
```

- [ ] **Step 2: Browser check**

```bash
pnpm build && pnpm start
```

Con la base local y una cuenta con datos (la de demo), en Chromium/Playwright (ver memoria «WebKit/Chromium local sin sudo»):
1. `/investments`: las posiciones que ya había muestran los mismos capital y valor que antes de la migración.
2. «+ Posición» con aportación inicial → aparece en la tabla con capital = valor = aportación.
3. Abre su detalle: registra una valuación mayor y una aportación posterior → la curva tiene ≥ 2 puntos, valor y capital cuadran con la regla.
4. Registra un retiro mayor que el valor → sale «El retiro supera el valor…».
5. Borra todos los movimientos → la posición queda en 0 y la página no truena.
6. `/investments` muestra la curva global.
7. El componente del Centro: no hay llave de Gemini en local, así que la propuesta del modelo real NO se puede ver. Anótalo en el PR.

Deja capturas en el scratchpad, no en el repo.

- [ ] **Step 3: Full check (sin borrar la base)**

```bash
pnpm typecheck && pnpm lint && pnpm test:unit 2>&1 | tail -5 && supabase test db 2>&1 | tail -5
```
Expected: todo PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/DECISIONS.md
git commit -m "D-200…D-202 en DECISIONS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: Hand off**

No hagas push ni PR sin que la persona lo pida. Al abrir el PR: la migración 0077 va a la nube ANTES de fusionar (`supabase db push`, confirmándolo con la persona), y el cuerpo dice que la propuesta del modelo real no se ha visto.
