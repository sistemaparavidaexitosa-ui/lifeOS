# Movimientos de inversión, curvas y el Centro — diseño

Fecha: 2026-09-25 · Rama: `feat/movimientos-inversion` · Decisiones: D-200…D-202

## Qué se pide

> «En /investments, agrega registro de movimientos por inversión: el usuario
> registra la posición, y a cada posición se le pueden registrar movimientos.
> Cada posición genera una curva para ver la evolución; también hay una curva
> global de inversiones. Todo esto puede ser llamado también desde el CENTRO.»

Respuestas de la persona durante el diseño:

- Un movimiento es **un flujo o una valuación** (aportación, retiro,
  rendimiento, valuación). No compra/venta por títulos.
- El Centro debe poder **ver y registrar**. Registrar se hace con
  **propuesta + confirmación** (opción A): el modelo nunca escribe.

## Qué hay hoy

- `public.investments` (migración 0007) guarda UNA foto por posición:
  `principal`, `valuation`, `as_of`. No hay historia → no hay curva posible.
- Leen `investments.valuation`: `/wealth` (página y acción de snapshot),
  `/debt`, `/reports`, `/household`, el grafo (trigger 0054 sobre
  `name, kind, institution, currency, valuation`), `buscar_en_todo` (0076) y
  la capacidad «mercado» del Centro.
- La vista `portafolio` de «mercado» dibuja su línea con
  `net_worth_snapshots` (patrimonio neto), no con las inversiones.
- Las herramientas del agente del Centro (`consultar`, `buscar`) son de solo
  lectura. No existe camino de escritura desde el Centro.

## D-200 · Los movimientos son la verdad; `investments` guarda el resumen

### Tabla nueva (migración `0077_movimientos_de_inversion.sql`)

```sql
create table public.investment_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  kind text not null check (kind in ('aportacion', 'retiro', 'rendimiento', 'valuacion')),
  amount numeric(20, 6) not null check (amount > 0),
  occurred_on date not null,
  note text not null default '' check (char_length(note) <= 200),
  created_at timestamptz not null default now()
);
create index on public.investment_movements (investment_id, occurred_on, created_at);
```

- RLS como el resto de tablas de dinero: `user_id = auth.uid()` para select,
  insert y delete. **No hay update**: un movimiento mal capturado se borra y
  se registra de nuevo.
- La política de insert comprueba además que `investment_id` pertenezca a la
  misma persona (subconsulta a `investments` bajo su RLS).
- Grants: `authenticated` select/insert/delete. Se revoca explícitamente de
  `anon` y se verifica en pgTAP (ver memoria «permisos que se amplían solos»:
  los grants de la migración no son los de la base).

### Semántica (una sola, idéntica en SQL y en TS)

Para una posición y una fecha `d`:

- **capital(d)** = Σ aportaciones − Σ retiros con `occurred_on ≤ d`.
- **valor(d)**:
  - Sea `V` la última `valuacion` con `occurred_on ≤ d` (empate de fecha →
    la de `created_at` más reciente). Una valuación es el **valor al cierre
    de ese día**: ya incluye los flujos de su misma fecha.
  - Con `V`: valor = `V.amount` + Σ(aportación + rendimiento − retiro) con
    `V.occurred_on < occurred_on ≤ d`.
  - Sin `V`: valor = Σ(aportación + rendimiento − retiro) con
    `occurred_on ≤ d`.
- **rendimiento** suma al valor y NO al capital (interés o dividendo
  reinvertido). Si se cobró fuera, la persona registra además un retiro.
- Un retiro no puede dejar el valor por debajo de cero en su fecha: la acción
  del servidor lo rechaza con mensaje («El retiro supera el valor de la
  posición al …»).

### `investments` pasa a ser derivado

Un trigger `after insert or delete on investment_movements` recalcula la
posición afectada con la semántica de arriba, a la fecha del último
movimiento:

- `principal` = capital(último día)
- `valuation` = valor(último día)
- `as_of` = fecha del último movimiento (sin movimientos: 0, 0, `as_of`
  intacto).

Así, `/wealth`, `/debt`, `/reports`, `/household`, el grafo (su trigger ya
escucha `valuation`) y «mercado» siguen funcionando **sin tocarse**.

La lógica vive dos veces (SQL para el resumen, TS para la curva). Para que no
se separen, **la misma tabla de casos** se prueba en pgTAP y en la suite de TS
(ver Pruebas).

### Relleno de lo que ya existe

La migración, para cada posición existente:

- `principal > 0` → una `aportacion` de `principal` fechada `as_of`.
- `valuation > 0` → una `valuacion` de `valuation` fechada `as_of`.

Con la semántica de arriba, el trigger devuelve exactamente los mismos
`principal` y `valuation` que había. Las notas dicen «Saldo inicial
(migración)». **Se aplica a la nube antes de fusionar** (es compatible con el
código viejo: sólo añade una tabla y un trigger que reescribe los mismos
valores).

### Alta de posición: atómica

Función `public.crear_posicion(...)` `security invoker` que inserta la
posición y su aportación inicial en una transacción. Grant sólo a
`authenticated`; `revoke execute ... from public, anon` y prueba pgTAP de que
`anon` no puede llamarla.

## D-201 · Curvas: puras, en TS

`src/lib/domain/money/curva-inversion.ts`, sin red ni React, probado en
`tests/domain/curva-inversion.test.ts`.

```ts
export interface MovimientoPuro {
  kind: "aportacion" | "retiro" | "rendimiento" | "valuacion";
  amount: number;
  occurred_on: string; // YYYY-MM-DD
  created_at: string;
}
export interface PuntoDeCurva { fecha: string; valor: number; capital: number }

/** Un punto por fecha con movimiento, más `hasta` (hoy) arrastrando el último. */
export function curvaDePosicion(movs: MovimientoPuro[], hasta: string): PuntoDeCurva[];

/** Valor de la posición a una fecha. Lo usa la acción para validar retiros. */
export function valorAl(movs: MovimientoPuro[], fecha: string): number;

/**
 * Suma, en cada fecha en que CUALQUIER posición se movió, el valor y el
 * capital arrastrados de cada posición. Sólo suma las posiciones en `moneda`;
 * las demás se cuentan en `fuera` y se dicen, nunca se convierten.
 */
export function curvaGlobal(
  posiciones: { currency: string; movimientos: MovimientoPuro[] }[],
  moneda: string,
  hasta: string
): { puntos: PuntoDeCurva[]; fuera: number };

/** Rendimiento simple: (valor − capital) / capital. `null` con capital 0. */
export function rendimientoPct(p: PuntoDeCurva): number | null;
```

- La curva es escalonada en los datos (el valor no cambia entre movimientos) y
  se dibuja como línea: entre dos valuaciones no inventamos puntos.
- Sin movimientos → `[]`. Un solo punto se extiende a `hasta` para que haya
  línea.

## D-202 · El Centro ve y propone; la persona guarda

### Ver: capacidad «inversiones»

`CAPACIDADES` pasa a `["mercado", "hoy", "inversiones"]`. Hidratador en
`src/lib/centro/agente/capacidades.ts`; la parte pura en
`src/lib/domain/centro/agente/inversiones.ts` (probada).

Parámetros (`leerParametrosInversiones`, tolerante como
`leerParametrosMercado`):

```ts
{ vista: "global" | "posicion" | "movimientos", posicion?: string /* uuid */ }
```

- `global` → sección `portfolio` (ya existe, ya tiene componente):
  `total` = valor global de hoy, `nota` = «Capital aportado … · rendimiento
  +…% · al …» (+ «N en otra moneda no suman»), `serie` = curva global.
- `posicion` → sección `portfolio` con los datos de ESA posición, título =
  nombre de la posición. `posicion` se relee bajo la RLS de la persona: un id
  ajeno o inventado da `emptyState` («No encuentro esa inversión»).
- `movimientos` → sección `table` con los últimos 10 movimientos (de la
  posición, o de todas si no hay `posicion`): fecha, posición, tipo, monto.
- Todas las cifras las calcula el servidor; el modelo sólo elige vista y
  posición.

Además, la vista `portafolio` de «mercado» deja de usar `net_worth_snapshots`
y usa la curva global: era el patrimonio neto con título de portafolio.

### Registrar: bloque «propuesta_movimiento»

Nuevo kind del agente, **no genérico** (tiene su esquema como `ir_a`):

```ts
{
  fila: "fila:investments:<uuid>", // debe venir de una fila leída ESTE turno
  tipo: "aportacion" | "retiro" | "rendimiento" | "valuacion",
  monto: number,                   // > 0, ≤ 1e12, 2 decimales
  fecha: string | null,            // YYYY-MM-DD; null = hoy (zona de la persona)
  nota: string | null              // ≤ 200
}
```

- **Anclaje**: la `fila` se resuelve contra las filas leídas por `consultar`
  o `buscar` en el turno (mismo mecanismo que los genéricos). Fila no leída
  → el bloque se descarta con motivo en el log. Así el modelo no puede
  proponer contra una posición que no existe o no es tuya.
- **El monto es la excepción a «el modelo no pone cifras»**: es la cifra que
  la persona DICTÓ, y la persona la ve y la confirma antes de que exista. No
  hay ningún rótulo con cifras: el componente formatea.
- Fecha futura → descartado. Fecha más de 10 años atrás → descartado.
- Sección nueva `propuestaMovimiento` (en `SECTION_KINDS`, `DatosPorKind`,
  validador y registro de componentes):
  `{ investmentId, posicion (nombre), moneda, tipo, monto, fecha, nota }`.
- Componente cliente: «Registrar **aportación** de **$5,000.00** en
  **CETES 28d** el **25 sep 2026**», con **Guardar** y **Descartar**.
  Guardar llama a la server action `registrarMovimiento` (la MISMA que usa
  `/investments`): zod + RLS + validación de retiro. Tras guardar, el botón
  queda en «Guardado ✓» y ofrece «Ver curva» → `/investments/<id>`. Error →
  el mensaje de la acción, y los botones siguen disponibles.
- Doble clic: el botón se deshabilita mientras la transición está pendiente.
  No hay idempotencia en servidor (la acción la dispara una persona, no un
  reintento automático).

`SYSTEM_AGENTE` (prompt) aprende: cuándo usar la capacidad y el bloque; que
para proponer hay que LEER la posición primero (`buscar` por nombre o
`consultar investments`); que si hay ambigüedad entre posiciones, pregunte
en el texto en lugar de proponer; y que nunca afirme que ya se guardó.

## `/investments`: la interfaz

- **Página principal**: arriba, la curva global (valor y capital, dos líneas)
  con el total y el rendimiento; debajo, lo de hoy (distribución) y la tabla de
  posiciones. Cada fila enlaza a su detalle.
- **Formulario de posición** (`InvestmentForm`): tipo, instrumento,
  institución/broker, tasa, fuente, titular. Al **crear** pide además la
  aportación inicial (monto + fecha) → `crear_posicion`. Al **editar**,
  capital, valor y fecha ya no son campos: salen de los movimientos.
- **`/investments/[id]`** (nueva): encabezado con valor, capital,
  rendimiento y fecha; la curva de la posición; el formulario de movimiento
  (tipo, monto, fecha = hoy por defecto, nota); la lista de movimientos, más
  reciente primero, con «Eliminar» en cada uno.
- Gráficas con Recharts (ya es dependencia y lo usan `components/charts/*`),
  en `src/components/charts/InvestmentCurve.tsx`: valor como línea con área,
  capital como línea punteada, eje X por fecha, tooltip con ambas cifras. En
  el Centro se sigue usando el `Portafolio.tsx` sin librería.
- Acciones en `src/app/(app)/investments/actions.ts`:
  `upsertInvestment` (sin capital/valor), `crearPosicion`,
  `registrarMovimiento(investmentId, fd)`, `borrarMovimiento(id)`. Todas
  revalidan `/investments` y `/investments/<id>`.

## Fuera de alcance

Compra/venta por títulos y precio, valoración en vivo por ticker, conversión
entre monedas, edición de un movimiento, importar estados de cuenta, TIR o
rendimiento ponderado por tiempo (el rendimiento es simple y lo dice).

## Pruebas

- `tests/domain/curva-inversion.test.ts`: la **tabla de casos compartida**
  (sin valuación; valuación y flujos después; flujos el mismo día que la
  valuación; dos valuaciones el mismo día; rendimiento; retiro; un solo
  movimiento; vacía), `curvaGlobal` con arrastre entre posiciones y con otra
  moneda, `rendimientoPct` con capital 0.
- `supabase/tests/0047_movimientos_de_inversion.sql` (pgTAP): la misma tabla
  de casos contra el trigger; el relleno conserva `principal`/`valuation`;
  RLS (otra persona no ve, no inserta contra una posición ajena);
  `crear_posicion` atómica y cerrada a `anon`.
- `tests/domain/centro-agente-inversiones.test.ts`: parámetros, secciones por
  vista, posición inexistente → `emptyState`, otra moneda.
- Contrato del agente: `propuesta_movimiento` válido, fila no leída,
  monto ≤ 0, fecha futura, tipo desconocido.
- Validador del runtime: `propuestaMovimiento` bien y mal formada.
- Navegador: `pnpm build && pnpm start` (con `pnpm dev` la CSP no hidrata)
  contra la base local: crear posición, registrar movimientos, ver las dos
  curvas, borrar un movimiento. El bloque del Centro se prueba con el
  componente y datos fijos: en local no hay llave de Gemini, así que **la
  propuesta hecha por el modelo real no se verá antes de producción** y el PR
  lo dice.
- `pnpm verify` termina en `supabase db reset`: se avisa antes de correrlo.

## Orden de despliegue

1. Migración 0077 a la nube (compatible con el código de `main`).
2. `pnpm gen:types` y fusionar el PR.
