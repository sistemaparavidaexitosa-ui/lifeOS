# El Centro como runtime (Fase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Centro pueda pintar una pantalla descrita como JSON declarativo (Screen), armada y validada en el servidor y dibujada por un renderer genérico que descubre sus componentes en un registro; la pantalla «Hoy» funciona de verdad detrás de `AGENTIC_CENTER_RUNTIME`.

**Architecture:** Dominio puro en `src/lib/domain/centro/runtime/` (tipos, catálogo, intención, plan, generador determinista, layout, validador zod, aprendizaje, ensamblado con timeout, hidratadores de «hoy» sobre un puerto del grafo). Servidor en `src/lib/centro/runtime/` (adaptador del grafo y `armarPantalla`). `/api/centro` añade `screen` y `flags` solo con el flag. Cliente en `src/components/centro-runtime/` (registro, secciones que se registran solas, `RuntimeScreen`), enchufado en `CentroPremium` en un único punto de corte.

**Tech Stack:** Next.js (App Router), React, TypeScript, zod 3.25, node test runner (`node --experimental-strip-types --test`), Supabase (solo a través de `src/lib/data/graph.ts`).

**Spec:** `docs/superpowers/specs/2026-09-24-centro-runtime-design.md`

## Global Constraints

- Rama: `feat/centro-runtime` (ya existe, con el spec en `140b3d6`).
- Con `AGENTIC_CENTER_RUNTIME` apagado, `/api/centro` devuelve exactamente `{ ok, contenido, sugerencias, resumen, costumbre }` y `CentroPremium` pinta el lienzo de hoy.
- Los flags valen `"1"` (tras `trim()`) para encender; cualquier otro valor es apagado. Los tres secundarios solo cuentan si `AGENTIC_CENTER_RUNTIME` está encendido.
- Archivos de `src/lib/domain/**`: PUROS (sin I/O, sin React), imports RELATIVOS con extensión `.ts` (los ejecuta `node --experimental-strip-types`).
- El modelo nunca produce HTML/JSX: una sección es `{ id, kind, title?, data }` serializable; una acción es `{ label, href }` o `{ label, intent }`.
- Todo `href` pasa por `destinoValido()` de `src/lib/domain/centro/sugerencias.ts`.
- `permissions` es `{ lectura: true; escritura: false }` como tipo literal.
- Timeout por sección: 1500 ms → sección `error`. Pantalla que no valida → `screen: null` → lienzo de hoy.
- Sin migraciones. Sin llamadas al modelo. Sin colores nuevos: el bloque `.rt-*` usa `--rit-*`.
- Verificación: `pnpm typecheck && pnpm lint && pnpm test:unit`. **Nunca `pnpm verify`** (termina en `supabase db reset` y borra la base local). Navegador con `pnpm build && pnpm start` (con `pnpm dev` la página no hidrata por la CSP).
- Comentarios y nombres en español, con la densidad de comentarios «por qué» del resto de `domain/centro/`.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Texto del usuario con `<…>`** (una tarea «Migrar <Header> a v2»): el validador rechaza la pantalla entera y el Centro cae al lienzo de hoy, sin pantalla en blanco. → Task 6, prueba «texto del usuario con marcado».
2. **Tarea que no está en el grafo, o grafo que lanza:** la fila sale sin «Proyecto · X», con `href: "/execution"`, y la pantalla sigue siendo válida. → Task 6.
3. **Día vacío** (sin plan, sin resumen, sin hábitos pendientes): la pantalla queda en hero + atajos y valida. → Task 6.
4. **Valores raros en el flag** (`"true"`, `" 1 "`, `"0"`, vacío): solo `"1"` recortado enciende. → Task 1.
5. **Grafo lento** (Supabase tarda más de 1,5 s): la sección `tasks` pasa a `error` y el resto se pinta. → Task 5.

---

### Task 1: Catálogo, tipos, plan y flags

**Files:**
- Create: `src/lib/domain/centro/runtime/secciones.ts`
- Create: `src/lib/domain/centro/runtime/types.ts`
- Create: `src/lib/domain/centro/runtime/plan.ts`
- Create: `src/lib/domain/centro/runtime/flags.ts`
- Modify: `src/config/env.ts` (añadir al final)
- Test: `tests/domain/centro-runtime-catalogo.test.ts`

**Interfaces:**
- Produces: `SECTION_KINDS`, `SectionKind`, `esSectionKind(v)`, `DatosDe<K>`, `DatosPorKind`, todos los `Datos*`, `ItemDeTarea`, `AccionRapida`, `IconoDeAccion`; `INTENT_KINDS`, `IntentKind`, `Intent`, `Action`, `RefreshPolicy`, `Section<K>`, `AnySection`, `Screen`; `HuecoDelPlan`, `ScreenPlan`; `FlagsDelRuntime`, `FLAGS_APAGADOS`, `resolverFlags(env)`; `flagsDelRuntime()` en `@/config/env`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-runtime-catalogo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTION_KINDS, esSectionKind } from "../../src/lib/domain/centro/runtime/secciones.ts";
import { INTENT_KINDS } from "../../src/lib/domain/centro/runtime/types.ts";
import { resolverFlags, FLAGS_APAGADOS } from "../../src/lib/domain/centro/runtime/flags.ts";

// El catálogo es el contrato entre quien decide QUÉ (el generador, mañana el
// modelo) y quien decide CÓMO (el renderer). Y los flags son lo que permite que
// nada de esto exista en producción hasta que alguien lo encienda.

test("El catálogo trae los 24 tipos del encargo, sin repetidos", () => {
  assert.strictEqual(SECTION_KINDS.length, 24);
  assert.strictEqual(new Set(SECTION_KINDS).size, 24);
  for (const k of ["hero", "narrative", "tasks", "quickActions", "emptyState", "error", "portfolio", "watchlist"]) {
    assert.ok(esSectionKind(k), k);
  }
});

test("Lo que no está en el catálogo no es un tipo de sección", () => {
  assert.strictEqual(esSectionKind("iframe"), false);
  assert.strictEqual(esSectionKind("script"), false);
  assert.strictEqual(esSectionKind(42), false);
  assert.strictEqual(esSectionKind(undefined), false);
});

test("Los seis intentos", () => {
  assert.deepStrictEqual([...INTENT_KINDS], ["hoy", "portafolio", "proyecto", "semana", "dinero", "libre"]);
});

test("Sin variables, todo apagado", () => {
  assert.deepStrictEqual(resolverFlags({}), FLAGS_APAGADOS);
});

test("Solo «1» enciende, y se recorta", () => {
  assert.strictEqual(resolverFlags({ AGENTIC_CENTER_RUNTIME: "1" }).runtime, true);
  assert.strictEqual(resolverFlags({ AGENTIC_CENTER_RUNTIME: " 1 " }).runtime, true);
  assert.strictEqual(resolverFlags({ AGENTIC_CENTER_RUNTIME: "true" }).runtime, false);
  assert.strictEqual(resolverFlags({ AGENTIC_CENTER_RUNTIME: "0" }).runtime, false);
  assert.strictEqual(resolverFlags({ AGENTIC_CENTER_RUNTIME: "" }).runtime, false);
});

test("Los secundarios no cuentan sin el runtime", () => {
  const f = resolverFlags({
    AGENTIC_GENERATED_SCREENS: "1",
    AGENTIC_LAYOUT_ENGINE: "1",
    AGENTIC_DYNAMIC_NAVIGATION: "1"
  });
  assert.deepStrictEqual(f, FLAGS_APAGADOS);
});

test("Con el runtime encendido, cada secundario va por su cuenta", () => {
  const f = resolverFlags({ AGENTIC_CENTER_RUNTIME: "1", AGENTIC_LAYOUT_ENGINE: "1" });
  assert.deepStrictEqual(f, { runtime: true, pantallasGeneradas: false, layoutEngine: true, navegacionDinamica: false });
});

test("Lo que devuelve resolverFlags no es el objeto compartido", () => {
  const f = resolverFlags({});
  f.runtime = true;
  assert.strictEqual(FLAGS_APAGADOS.runtime, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-catalogo.test.ts`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` para `secciones.ts`.

- [ ] **Step 3: Write `secciones.ts`**

```ts
// src/lib/domain/centro/runtime/secciones.ts
// El catálogo de secciones del runtime del Centro (D-188). Puro, probado en
// tests/domain/centro-runtime-catalogo.test.ts.
//
// POR QUÉ UN CATÁLOGO CERRADO. Una sección es un `kind` y unos datos, y el
// `kind` es lo único que el renderer usa para elegir componente. Si el
// vocabulario fuera abierto, el día que el modelo diga «iframe» habría que
// decidir en el renderer qué hacer con él; cerrado, lo rechaza el validador y el
// renderer nunca se entera.
//
// POR QUÉ ESTÁN LOS 24 AUNQUE SOLO SEIS TENGAN COMPONENTE. El contrato se fija
// ahora, cuando no hay datos escritos: un plan que pida `portfolio` es legal y
// se pinta como `emptyState` hasta que exista su componente. Ampliar un
// vocabulario con pantallas en uso es una migración; declararlo hoy, un tipo.

export const SECTION_KINDS = [
  "hero",
  "text",
  "narrative",
  "chat",
  "portfolio",
  "watchlist",
  "chart",
  "timeline",
  "calendar",
  "tasks",
  "projects",
  "habits",
  "books",
  "money",
  "cards",
  "table",
  "metric",
  "graph",
  "journal",
  "knowledge",
  "quickActions",
  "emptyState",
  "error",
  "loading"
] as const;

export type SectionKind = (typeof SECTION_KINDS)[number];

export function esSectionKind(v: unknown): v is SectionKind {
  return typeof v === "string" && (SECTION_KINDS as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// Los datos de cada tipo. SOLO datos: nada ejecutable, nada de marcado. Los
// enlaces van en campos llamados `href`, que el validador revisa uno por uno.
// ---------------------------------------------------------------------------

export interface DatosHero {
  saludo: string;
  nombre: string;
  fechaISO: string;
  /** Una frase bajo el saludo. `null` = no hay nada que decir, y no se inventa. */
  frase: string | null;
}

export interface DatosText {
  texto: string;
}

export interface DatosNarrative {
  titulo: string;
  texto: string;
  href: string | null;
}

export interface DatosChat {
  mensajes: { rol: "persona" | "centro"; texto: string }[];
}

/** Precio y variación pueden faltar: la watchlist guarda QUÉ sigues, nunca CUÁNTO vale (D-184). */
export interface Posicion {
  simbolo: string;
  nombre: string;
  precio: number | null;
  variacionPct: number | null;
  nota: string | null;
}

export interface DatosPortfolio {
  moneda: string;
  total: number | null;
  variacionPct: number | null;
  posiciones: Posicion[];
}

export interface DatosWatchlist {
  /** `false` = falta la llave de mercado; la sección lo dice en vez de enseñar ceros. */
  configurado: boolean;
  simbolos: Posicion[];
}

export interface DatosChart {
  unidad: string;
  serie: { x: string; y: number }[];
}

export interface DatosTimeline {
  hitos: { fechaISO: string; titulo: string; estado: "hecho" | "pendiente" | "riesgo" }[];
}

export interface DatosCalendar {
  dias: { fechaISO: string; bloques: { inicio: string; fin: string; titulo: string }[] }[];
}

export interface ItemDeTarea {
  id: string;
  titulo: string;
  /** «Proyecto · Malpaso», «Una cosa»… `null` si el grafo no supo decirlo. */
  contexto: string | null;
  href: string | null;
}

export interface DatosTasks {
  fechaISO: string;
  items: ItemDeTarea[];
}

export interface DatosProjects {
  items: { id: string; titulo: string; progresoPct: number | null; href: string }[];
}

export interface DatosHabits {
  items: { id: string; nombre: string; hecho: boolean }[];
}

export interface DatosBooks {
  items: { id: string; titulo: string; autor: string | null; progresoPct: number | null }[];
}

export interface DatosMoney {
  moneda: string;
  patrimonio: number | null;
  flujoDelMes: number | null;
  proximosPagos: { concepto: string; monto: number; fechaISO: string }[];
}

export interface DatosCards {
  items: { titulo: string; detalle: string; href: string | null }[];
}

export interface DatosTable {
  columnas: string[];
  filas: string[][];
}

export interface DatosMetric {
  etiqueta: string;
  valor: string;
  tendencia: "sube" | "baja" | "igual" | null;
}

export interface DatosGraph {
  raizId: string;
  vista: string;
}

export interface DatosJournal {
  entradas: { fechaISO: string; texto: string }[];
}

export interface DatosKnowledge {
  items: { titulo: string; extracto: string; href: string | null }[];
}

/** Iconos con nombre de destino, no de dibujo: qué SVG le toca lo decide el componente. */
export type IconoDeAccion = "proyectos" | "biblioteca" | "finanzas" | "rutinas";

export interface AccionRapida {
  etiqueta: string;
  detalle: string;
  href: string;
  icono: IconoDeAccion;
}

export interface DatosQuickActions {
  items: AccionRapida[];
}

/** `emptyState`, `error` y `loading` dicen una cosa y nada más. */
export interface DatosMensaje {
  mensaje: string;
}

export interface DatosPorKind {
  hero: DatosHero;
  text: DatosText;
  narrative: DatosNarrative;
  chat: DatosChat;
  portfolio: DatosPortfolio;
  watchlist: DatosWatchlist;
  chart: DatosChart;
  timeline: DatosTimeline;
  calendar: DatosCalendar;
  tasks: DatosTasks;
  projects: DatosProjects;
  habits: DatosHabits;
  books: DatosBooks;
  money: DatosMoney;
  cards: DatosCards;
  table: DatosTable;
  metric: DatosMetric;
  graph: DatosGraph;
  journal: DatosJournal;
  knowledge: DatosKnowledge;
  quickActions: DatosQuickActions;
  emptyState: DatosMensaje;
  error: DatosMensaje;
  loading: DatosMensaje;
}

export type DatosDe<K extends SectionKind> = DatosPorKind[K];

/**
 * Rompe la compilación si el catálogo y los datos se separan: un `kind` nuevo
 * sin tipo de datos, o un tipo de datos sin `kind`.
 */
export const CATALOGO_CUBIERTO: [SectionKind] extends [keyof DatosPorKind]
  ? [keyof DatosPorKind] extends [SectionKind]
    ? true
    : never
  : never = true;
```

- [ ] **Step 4: Write `types.ts`**

```ts
// src/lib/domain/centro/runtime/types.ts
// El modelo de pantalla del runtime del Centro (D-188). Puro.
//
// UNA PANTALLA ES DATOS. No hay un solo campo que se pueda ejecutar: las
// secciones son `kind` + datos, las acciones son un enlace interno o un intento.
// Eso es lo que permite que mañana la escriba un modelo: lo peor que puede
// devolver es una pantalla fea, y el validador la para antes.

import type { DatosDe, SectionKind } from "./secciones.ts";

export const INTENT_KINDS = ["hoy", "portafolio", "proyecto", "semana", "dinero", "libre"] as const;
export type IntentKind = (typeof INTENT_KINDS)[number];

export interface Intent {
  kind: IntentKind;
  /** Lo que se nombró: «Malpaso» en «abre Malpaso». Solo en `proyecto`. */
  ref?: string;
  /** El texto tal cual, cuando no se entendió. Solo en `libre`. */
  texto?: string;
}

/** Un enlace dentro de la aplicación, o pedir otra pantalla. Nunca las dos cosas. */
export type Action = { label: string; href: string } | { label: string; intent: IntentKind };

export type RefreshPolicy = { tipo: "alAbrir" } | { tipo: "cada"; segundos: number } | { tipo: "porFranja" };

export interface Section<K extends SectionKind = SectionKind> {
  id: string;
  kind: K;
  title?: string;
  data: DatosDe<K>;
}

/** La unión que conserva la pareja kind↔datos: con `Section<SectionKind>` se perdería. */
export type AnySection = { [K in SectionKind]: Section<K> }[SectionKind];

export interface Screen {
  id: string;
  /** De qué intento salió. Lo necesita el aprendizaje, no el renderer. */
  intent: IntentKind;
  title: string;
  subtitle?: string;
  narrative?: string;
  layout: { densidad: "aireada" | "compacta" };
  sections: AnySection[];
  actions: Action[];
  refreshPolicy: RefreshPolicy;
  /**
   * `escritura: false` como TIPO, no como valor. En Fase 1 ninguna pantalla
   * escribe; permitirlo exigirá cambiar esta línea, no colar un `true` en JSON.
   */
  permissions: { lectura: true; escritura: false };
}
```

- [ ] **Step 5: Write `plan.ts`**

```ts
// src/lib/domain/centro/runtime/plan.ts
// Lo que decide el agente: QUÉ se enseña (D-188). Puro.
//
// UN PLAN NO TIENE DATOS, Y NO PUEDE TENERLOS. No hay campo donde ponerlos. Es
// la mitad del reparto de responsabilidades: el generador elige secciones y
// orden; los hidratadores, qué datos llevan. Un generador —hoy determinista,
// mañana un modelo— que quisiera inventarse una cifra no tiene dónde escribirla.

import type { SectionKind } from "./secciones.ts";
import type { Action, Intent, RefreshPolicy } from "./types.ts";

export interface HuecoDelPlan {
  id: string;
  kind: SectionKind;
  title?: string;
}

export interface ScreenPlan {
  id: string;
  intent: Intent;
  title: string;
  subtitle?: string;
  huecos: HuecoDelPlan[];
  actions: Action[];
  refreshPolicy: RefreshPolicy;
}
```

- [ ] **Step 6: Write `flags.ts`**

```ts
// src/lib/domain/centro/runtime/flags.ts
// Los interruptores del runtime del Centro (D-191). Puro, probado en
// tests/domain/centro-runtime-catalogo.test.ts.
//
// VARIABLES DE ENTORNO, NO UNA TABLA. Es como se encienden el coach y los
// insights del Kernel (`coachPorElKernel()` en config/env.ts), y una persona
// sola no necesita un panel de flags. Apagar es borrar y redesplegar.
//
// LOS SECUNDARIOS DEPENDEN DEL PRIMERO. Generar pantallas, mover el layout o
// reordenar la navegación sin runtime no significa nada; se resuelve aquí una
// vez para que nadie tenga que acordarse de comprobar los dos.
//
// El cliente NO lee variables: recibe este objeto ya resuelto en la respuesta de
// `/api/centro`. Un `NEXT_PUBLIC_*` podría decir una cosa y el servidor otra.

export interface FlagsDelRuntime {
  /** AGENTIC_CENTER_RUNTIME: el Centro pinta pantallas del runtime. */
  runtime: boolean;
  /** AGENTIC_GENERATED_SCREENS: lo escrito en la barra pide pantalla. Fase 1: no-op. */
  pantallasGeneradas: boolean;
  /** AGENTIC_LAYOUT_ENGINE: el layout deja el orden fijo. Fase 1: no-op. */
  layoutEngine: boolean;
  /** AGENTIC_DYNAMIC_NAVIGATION: las acciones reordenan la navegación. Fase 1: no-op. */
  navegacionDinamica: boolean;
}

export const FLAGS_APAGADOS: Readonly<FlagsDelRuntime> = Object.freeze({
  runtime: false,
  pantallasGeneradas: false,
  layoutEngine: false,
  navegacionDinamica: false
});

/** «1» y nada más, como los del Kernel. «true» no enciende: dos grafías serían dos verdades. */
const encendido = (v: string | undefined): boolean => v?.trim() === "1";

export function resolverFlags(env: Record<string, string | undefined>): FlagsDelRuntime {
  if (!encendido(env.AGENTIC_CENTER_RUNTIME)) return { ...FLAGS_APAGADOS };
  return {
    runtime: true,
    pantallasGeneradas: encendido(env.AGENTIC_GENERATED_SCREENS),
    layoutEngine: encendido(env.AGENTIC_LAYOUT_ENGINE),
    navegacionDinamica: encendido(env.AGENTIC_DYNAMIC_NAVIGATION)
  };
}
```

- [ ] **Step 7: Add `flagsDelRuntime()` at the end of `src/config/env.ts`**

Add the import next to the existing `vapid.ts` import:

```ts
import { resolverFlags, type FlagsDelRuntime } from "@/lib/domain/centro/runtime/flags.ts";
```

And at the end of the file:

```ts
/**
 * Los interruptores del runtime del Centro (D-191), ya resueltos.
 *
 * Una sola función para los cuatro, y no una por variable como las del Kernel,
 * porque aquí hay una dependencia: los tres secundarios no significan nada sin
 * `AGENTIC_CENTER_RUNTIME`, y esa regla vive en `resolverFlags`, que es pura y
 * está probada.
 */
export function flagsDelRuntime(): FlagsDelRuntime {
  return resolverFlags(process.env);
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-catalogo.test.ts && pnpm typecheck`
Expected: 8 tests PASS; typecheck sin errores.

- [ ] **Step 9: Commit**

```bash
git add src/lib/domain/centro/runtime/ src/config/env.ts tests/domain/centro-runtime-catalogo.test.ts
git commit -m "$(cat <<'EOF'
centro-runtime: catálogo de secciones, modelo de pantalla y flags

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Interpretar la intención

**Files:**
- Create: `src/lib/domain/centro/runtime/intencion.ts`
- Test: `tests/domain/centro-runtime-intencion.test.ts`

**Interfaces:**
- Consumes: `Intent` de `types.ts`.
- Produces: `interpretarIntencion(texto: string | null): Intent`, `MAX_TEXTO_INTENCION = 280`.

Nota: el spec escribía `interpretarIntencion(texto, { franja })`. La franja no cambia nada en Fase 1 (sin texto siempre es «hoy»), así que la firma no la pide. Se añadirá cuando un intento dependa de la hora.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-runtime-intencion.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { interpretarIntencion, MAX_TEXTO_INTENCION } from "../../src/lib/domain/centro/runtime/intencion.ts";

// De una frase a uno de seis intentos, sin modelo. Las frases son las del
// encargo, en los dos idiomas en que se escribió.

test("Sin texto es «hoy»: abrir el Centro es preguntar qué toca", () => {
  assert.deepStrictEqual(interpretarIntencion(null), { kind: "hoy" });
  assert.deepStrictEqual(interpretarIntencion("   "), { kind: "hoy" });
});

test("Hoy", () => {
  assert.strictEqual(interpretarIntencion("What should I do today?").kind, "hoy");
  assert.strictEqual(interpretarIntencion("¿Qué hago hoy?").kind, "hoy");
  assert.strictEqual(interpretarIntencion("Planea mi día").kind, "hoy");
});

test("Portafolio", () => {
  assert.strictEqual(interpretarIntencion("Show my stocks").kind, "portafolio");
  assert.strictEqual(interpretarIntencion("¿Cómo van mis acciones?").kind, "portafolio");
  assert.strictEqual(
    interpretarIntencion("Muéstrame los tickers que tengo en mi watchlist y su rendimiento hoy").kind,
    "portafolio"
  );
});

test("Semana", () => {
  assert.strictEqual(interpretarIntencion("Plan my week").kind, "semana");
  assert.strictEqual(interpretarIntencion("Planea mi semana").kind, "semana");
});

test("Dinero", () => {
  assert.strictEqual(interpretarIntencion("Show my money").kind, "dinero");
  assert.strictEqual(interpretarIntencion("¿Cómo va mi presupuesto?").kind, "dinero");
});

test("Proyecto, con el nombre tal como se escribió", () => {
  assert.deepStrictEqual(interpretarIntencion("Open Malpaso"), { kind: "proyecto", ref: "Malpaso" });
  assert.deepStrictEqual(interpretarIntencion("Muéstrame Malpaso"), { kind: "proyecto", ref: "Malpaso" });
  assert.deepStrictEqual(interpretarIntencion("abre el proyecto Malpaso"), { kind: "proyecto", ref: "Malpaso" });
});

test("Lo que no se entiende es «libre», con el texto, y no un intento adivinado", () => {
  assert.deepStrictEqual(interpretarIntencion("hola"), { kind: "libre", texto: "hola" });
});

test("Un texto enorme se recorta antes de mirarlo", () => {
  const r = interpretarIntencion("x".repeat(5000));
  assert.strictEqual(r.kind, "libre");
  assert.strictEqual(r.texto?.length, MAX_TEXTO_INTENCION);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-intencion.test.ts`
Expected: FAIL con `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `intencion.ts`**

```ts
// src/lib/domain/centro/runtime/intencion.ts
// De una frase a un intento (D-188). Puro, probado en
// tests/domain/centro-runtime-intencion.test.ts.
//
// POR QUÉ PALABRAS Y NO UN MODELO. En Fase 1 solo hay una pantalla con datos
// («hoy»), y el Kernel —el primer camino de IA agéntica del repo— todavía no se
// ha ejecutado nunca en producción. Un clasificador de palabras se equivoca de
// formas que se pueden leer en este archivo; el día que se quede corto se
// sustituye por un `ScreenGenerator` con modelo, sin tocar a nadie más.
//
// EL ORDEN IMPORTA. «Show my money» empieza como «abre algo», pero habla de
// dinero: los temas se miran antes que el verbo. Y lo que no se entiende es
// `libre`, nunca un intento adivinado: una pantalla equivocada es peor que
// una que dice que no entendió.

import type { Intent } from "./types.ts";

export const MAX_TEXTO_INTENCION = 280;

/** Minúsculas, sin acentos ni signos: «¿Cómo?» y «como» son la misma palabra. */
function normalizar(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[¿?¡!.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PORTAFOLIO = /\b(accion|acciones|stocks?|tickers?|watchlist|portafolio|portfolio|mercado|bolsa)\b/;
const DINERO = /\b(dinero|money|finanzas|patrimonio|presupuesto|gastos)\b/;
const SEMANA = /\b(semana|week)\b/;
const HOY = /\b(hoy|today|dia|day)\b|que hago|what should i do/;

/**
 * «abre X», «muéstrame X», «open X»… y lo que queda es el nombre. Sobre el texto
 * ORIGINAL, no el normalizado, para devolver «Malpaso» y no «malpaso».
 */
const ABRIR =
  /^[\s¿¡]*(?:abre|abrir|mu[eé]strame|mostrar|ens[eé][nñ]ame|open|show)\s+(?:(?:el|la|los|las|mi|mis|my|the)\s+)?(?:(?:proyecto|project)\s+)?(.+?)[\s?.!]*$/i;

export function interpretarIntencion(texto: string | null): Intent {
  const crudo = (texto ?? "").slice(0, MAX_TEXTO_INTENCION).trim();
  if (!crudo) return { kind: "hoy" };

  const n = normalizar(crudo);
  if (PORTAFOLIO.test(n)) return { kind: "portafolio" };
  if (DINERO.test(n)) return { kind: "dinero" };
  if (SEMANA.test(n)) return { kind: "semana" };
  if (HOY.test(n)) return { kind: "hoy" };

  const abrir = ABRIR.exec(crudo);
  if (abrir?.[1]) return { kind: "proyecto", ref: abrir[1].trim() };

  return { kind: "libre", texto: crudo };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-intencion.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/runtime/intencion.ts tests/domain/centro-runtime-intencion.test.ts
git commit -m "$(cat <<'EOF'
centro-runtime: interpretar la intención sin modelo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Generador determinista y layout

**Files:**
- Create: `src/lib/domain/centro/runtime/generador.ts`
- Create: `src/lib/domain/centro/runtime/layout.ts`
- Test: `tests/domain/centro-runtime-generador.test.ts`

**Interfaces:**
- Consumes: `Franja` de `../franja.ts`; `FlagsDelRuntime`, `FLAGS_APAGADOS`; `HuecoDelPlan`, `ScreenPlan`; `Intent`, `IntentKind`, `Action`, `Screen`.
- Produces: `EntradaDelGenerador { intent; franja; flags }`, `ScreenGenerator { id; generar(e): Promise<ScreenPlan> }`, `generadorDeterminista`; `aplicarLayout(screen: Screen, flags: FlagsDelRuntime): Screen`, `MAX_AIREADA = 6`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-runtime-generador.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generadorDeterminista } from "../../src/lib/domain/centro/runtime/generador.ts";
import { aplicarLayout } from "../../src/lib/domain/centro/runtime/layout.ts";
import { FLAGS_APAGADOS } from "../../src/lib/domain/centro/runtime/flags.ts";
import { INTENT_KINDS, type Screen } from "../../src/lib/domain/centro/runtime/types.ts";

const entrada = (kind: (typeof INTENT_KINDS)[number], ref?: string) => ({
  intent: ref ? { kind, ref } : { kind },
  franja: "manana" as const,
  flags: { ...FLAGS_APAGADOS }
});

test("«Hoy» es hero, narrativa, foco y atajos, en ese orden", async () => {
  const plan = await generadorDeterminista.generar(entrada("hoy"));
  assert.deepStrictEqual(plan.huecos.map((h) => h.kind), ["hero", "narrative", "tasks", "quickActions"]);
  assert.deepStrictEqual(plan.refreshPolicy, { tipo: "porFranja" });
  assert.deepStrictEqual(plan.actions, []);
});

test("Misma entrada, mismo plan", async () => {
  const a = await generadorDeterminista.generar(entrada("hoy"));
  const b = await generadorDeterminista.generar(entrada("hoy"));
  assert.deepStrictEqual(a, b);
});

test("Cada plan es una copia: tocarlo no cambia el siguiente", async () => {
  const a = await generadorDeterminista.generar(entrada("hoy"));
  a.huecos[0]!.title = "tocado";
  a.huecos.pop();
  const b = await generadorDeterminista.generar(entrada("hoy"));
  assert.strictEqual(b.huecos.length, 4);
  assert.strictEqual(b.huecos[0]!.title, undefined);
});

test("Todos los intentos tienen plan, con ids de hueco únicos y sin datos", async () => {
  for (const kind of INTENT_KINDS) {
    const plan = await generadorDeterminista.generar(entrada(kind));
    assert.ok(plan.huecos.length > 0, kind);
    assert.strictEqual(new Set(plan.huecos.map((h) => h.id)).size, plan.huecos.length, kind);
    assert.ok(!JSON.stringify(plan).includes('"data"'), kind);
  }
});

test("Fuera de «hoy» siempre hay una salida de vuelta", async () => {
  const plan = await generadorDeterminista.generar(entrada("portafolio"));
  assert.deepStrictEqual(plan.actions, [{ label: "Volver a hoy", intent: "hoy" }]);
});

test("El proyecto se titula con su nombre", async () => {
  const plan = await generadorDeterminista.generar(entrada("proyecto", "Malpaso"));
  assert.strictEqual(plan.title, "Malpaso");
  assert.strictEqual(plan.id, "proyecto:malpaso");
});

function pantalla(n: number): Screen {
  return {
    id: "x",
    intent: "hoy",
    title: "x",
    layout: { densidad: "compacta" },
    sections: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, kind: "text" as const, data: { texto: String(i) } })),
    actions: [],
    refreshPolicy: { tipo: "alAbrir" },
    permissions: { lectura: true, escritura: false }
  };
}

test("El layout no reordena", () => {
  const r = aplicarLayout(pantalla(4), FLAGS_APAGADOS);
  assert.deepStrictEqual(r.sections.map((s) => s.id), ["s0", "s1", "s2", "s3"]);
});

test("Hasta seis secciones, aireada; más, compacta", () => {
  assert.strictEqual(aplicarLayout(pantalla(6), FLAGS_APAGADOS).layout.densidad, "aireada");
  assert.strictEqual(aplicarLayout(pantalla(7), FLAGS_APAGADOS).layout.densidad, "compacta");
});

test("Con el motor encendido, Fase 1 hace lo mismo", () => {
  const conMotor = aplicarLayout(pantalla(4), { ...FLAGS_APAGADOS, runtime: true, layoutEngine: true });
  assert.deepStrictEqual(conMotor, aplicarLayout(pantalla(4), FLAGS_APAGADOS));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-generador.test.ts`
Expected: FAIL con `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `generador.ts`**

```ts
// src/lib/domain/centro/runtime/generador.ts
// Quién decide QUÉ se enseña (D-188). Puro, probado en
// tests/domain/centro-runtime-generador.test.ts.
//
// LA INTERFAZ ES LO QUE SE QUEDA. `ScreenGenerator` es asíncrona aunque la
// única implementación no espere a nada, porque la siguiente —un modelo— sí
// esperará, y cambiar la firma entonces obligaría a tocar a quien llama.
//
// POR QUÉ DETERMINISTA. Mismo intento, mismo plan: se puede probar, no cuesta
// una llamada y no se equivoca de formas nuevas. Planifica los seis intentos
// aunque solo «hoy» tenga hidratadores; los demás se pintan con `emptyState`
// hasta que los tengan, y así el contrato completo se ejercita desde ya.

import type { Franja } from "../franja.ts";
import type { FlagsDelRuntime } from "./flags.ts";
import type { HuecoDelPlan, ScreenPlan } from "./plan.ts";
import type { Action, Intent, IntentKind } from "./types.ts";

export interface EntradaDelGenerador {
  intent: Intent;
  franja: Franja;
  flags: FlagsDelRuntime;
}

export interface ScreenGenerator {
  readonly id: string;
  generar(e: EntradaDelGenerador): Promise<ScreenPlan>;
}

const HUECOS: Record<IntentKind, HuecoDelPlan[]> = {
  hoy: [
    { id: "hero", kind: "hero" },
    { id: "narrativa", kind: "narrative" },
    { id: "foco", kind: "tasks", title: "Tu foco de hoy" },
    { id: "sigue", kind: "quickActions", title: "Sigue por aquí" }
  ],
  portafolio: [
    { id: "comentario", kind: "narrative" },
    { id: "portafolio", kind: "portfolio", title: "Tu portafolio hoy" },
    { id: "watchlist", kind: "watchlist", title: "Tu watchlist" },
    { id: "noticias", kind: "cards", title: "Noticias del mercado" }
  ],
  proyecto: [
    { id: "linea", kind: "timeline", title: "Línea de tiempo" },
    { id: "kpis", kind: "metric", title: "KPIs" },
    { id: "riesgos", kind: "cards", title: "Riesgos" },
    { id: "documentos", kind: "table", title: "Documentos" },
    { id: "personas", kind: "cards", title: "Personas" },
    { id: "actividad", kind: "journal", title: "Actividad reciente" }
  ],
  semana: [
    { id: "calendario", kind: "calendar", title: "Tu semana" },
    { id: "proyectos", kind: "projects", title: "Proyectos" },
    { id: "una-cosa", kind: "tasks", title: "Una cosa" },
    { id: "tiempo", kind: "metric", title: "Tiempo disponible" }
  ],
  dinero: [
    { id: "patrimonio", kind: "metric", title: "Patrimonio" },
    { id: "presupuesto", kind: "money", title: "Presupuesto y flujo" },
    { id: "flujo", kind: "chart", title: "Flujo de caja" },
    { id: "pagos", kind: "table", title: "Próximos pagos" }
  ],
  libre: [{ id: "respuesta", kind: "text" }]
};

const TITULOS: Record<IntentKind, string> = {
  hoy: "Centro",
  portafolio: "Mercado de hoy",
  proyecto: "Proyecto",
  semana: "Tu semana",
  dinero: "Tu dinero",
  libre: "Centro"
};

const VOLVER: Action[] = [{ label: "Volver a hoy", intent: "hoy" }];

/** El nombre del proyecto acaba en un id: corto, sin mayúsculas. */
const MAX_REF_EN_ID = 60;

export const generadorDeterminista: ScreenGenerator = {
  id: "determinista",
  async generar({ intent }) {
    const k = intent.kind;
    const ref = intent.ref?.trim();
    return {
      id: ref ? `${k}:${ref.toLowerCase().slice(0, MAX_REF_EN_ID)}` : k,
      intent: { ...intent },
      title: k === "proyecto" && ref ? ref : TITULOS[k],
      // Copias: quien reciba el plan puede tocarlo sin cambiar el siguiente.
      huecos: HUECOS[k].map((h) => ({ ...h })),
      actions: k === "hoy" ? [] : VOLVER.map((a) => ({ ...a })),
      refreshPolicy: k === "hoy" ? { tipo: "porFranja" } : { tipo: "alAbrir" }
    };
  }
};
```

- [ ] **Step 4: Write `layout.ts`**

```ts
// src/lib/domain/centro/runtime/layout.ts
// El orden y la densidad (D-188). Puro, probado en
// tests/domain/centro-runtime-generador.test.ts.
//
// NO REORDENA. El orden es del generador: si el layout también opinara, habría
// dos sitios decidiendo qué va primero y ninguno sería responsable. Aquí solo se
// decide lo que el generador no sabe —cuánto aire cabe— con una regla que se
// lee en una línea.

import type { FlagsDelRuntime } from "./flags.ts";
import type { Screen } from "./types.ts";

/** Más de seis secciones ya no respiran a pantalla de teléfono. */
export const MAX_AIREADA = 6;

export function aplicarLayout(screen: Screen, flags: FlagsDelRuntime): Screen {
  if (flags.layoutEngine) {
    // AGENTIC_LAYOUT_ENGINE: aquí entrará el motor (columnas en escritorio,
    // secciones que el aprendizaje sabe que se ignoran). En Fase 1 no hace
    // nada, y la prueba «Con el motor encendido, Fase 1 hace lo mismo» lo fija.
  }

  return {
    ...screen,
    layout: { densidad: screen.sections.length > MAX_AIREADA ? "compacta" : "aireada" },
    sections: [...screen.sections]
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-generador.test.ts`
Expected: 9 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/centro/runtime/generador.ts src/lib/domain/centro/runtime/layout.ts tests/domain/centro-runtime-generador.test.ts
git commit -m "$(cat <<'EOF'
centro-runtime: generador determinista y layout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Acciones y validador

**Files:**
- Create: `src/lib/domain/centro/runtime/acciones.ts`
- Create: `src/lib/domain/centro/runtime/validador.ts`
- Test: `tests/domain/centro-runtime-validador.test.ts`

**Interfaces:**
- Consumes: `destinoValido(href, proyectos)` de `../sugerencias.ts`; `SECTION_KINDS`, `SectionKind`; `INTENT_KINDS`, `Action`, `IntentKind`, `Screen`.
- Produces: `sanearAccion(v: unknown, proyectos: { id: string }[]): Action | null`; `validarScreen(v: unknown, ctx: ContextoDeValidacion): ResultadoDeValidacion`, `ContextoDeValidacion { proyectos: { id: string }[] }`, `ResultadoDeValidacion = { ok: true; screen: Screen } | { ok: false; reason: string }`, `MAX_SECCIONES = 12`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-runtime-validador.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarScreen, MAX_SECCIONES } from "../../src/lib/domain/centro/runtime/validador.ts";
import { sanearAccion } from "../../src/lib/domain/centro/runtime/acciones.ts";

// La frontera con lo que mañana escribirá un modelo. Hoy la cruza lo que arma
// el servidor; la regla es la misma.

const MIO = "11111111-1111-4111-8111-111111111111";
const AJENO = "99999999-9999-4999-8999-999999999999";
const ctx = { proyectos: [{ id: MIO }] };

function valida(): Record<string, unknown> {
  return {
    id: "hoy",
    intent: "hoy",
    title: "Centro",
    layout: { densidad: "aireada" },
    sections: [
      { id: "hero", kind: "hero", data: { saludo: "Buenos días", nombre: "Luis", fechaISO: "2026-09-24", frase: null } },
      {
        id: "foco",
        kind: "tasks",
        title: "Tu foco de hoy",
        data: {
          fechaISO: "2026-09-24",
          items: [{ id: "t1", titulo: "Revisar avances U3", contexto: "Proyecto · Malpaso", href: `/execution?project=${MIO}` }]
        }
      },
      {
        id: "sigue",
        kind: "quickActions",
        title: "Sigue por aquí",
        data: { items: [{ etiqueta: "Proyectos", detalle: "3 en el plan", href: "/execution", icono: "proyectos" }] }
      }
    ],
    actions: [],
    refreshPolicy: { tipo: "porFranja" },
    permissions: { lectura: true, escritura: false }
  };
}

type Mutable = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function con(cambio: (s: Mutable) => void): Mutable {
  const s = structuredClone(valida()) as Mutable;
  cambio(s);
  return s;
}

test("Una pantalla bien hecha pasa", () => {
  const r = validarScreen(valida(), ctx);
  assert.strictEqual(r.ok, true);
});

test("Marcado en un texto: fuera", () => {
  const r = validarScreen(con((s) => (s.sections[0].data.frase = "<script>alert(1)</script>")), ctx);
  assert.strictEqual(r.ok, false);
  assert.match(!r.ok ? r.reason : "", /marcado/);
});

test("JSX en un texto: fuera", () => {
  const r = validarScreen(con((s) => s.sections.push({ id: "t", kind: "text", data: { texto: "<Hero />" } })), ctx);
  assert.strictEqual(r.ok, false);
});

test("Texto del usuario con marcado: se rechaza la pantalla y el Centro cae al lienzo", () => {
  const r = validarScreen(con((s) => (s.sections[1].data.items[0].titulo = "Migrar <Header> a v2")), ctx);
  assert.strictEqual(r.ok, false);
});

test("Un «menor que» no es marcado", () => {
  const r = validarScreen(con((s) => s.sections.push({ id: "t", kind: "text", data: { texto: "gasto < ingreso, y 3 <3" } })), ctx);
  assert.strictEqual(r.ok, true);
});

test("Un tipo de sección que no está en el catálogo: fuera", () => {
  const r = validarScreen(con((s) => s.sections.push({ id: "x", kind: "iframe", data: {} })), ctx);
  assert.strictEqual(r.ok, false);
});

test("Un tipo sin componente todavía, con datos, es legal", () => {
  const r = validarScreen(
    con((s) => s.sections.push({ id: "p", kind: "portfolio", data: { moneda: "USD", total: null, variacionPct: null, posiciones: [] } })),
    ctx
  );
  assert.strictEqual(r.ok, true);
});

test("Enlaces fuera de la aplicación: fuera", () => {
  for (const href of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/inventado"]) {
    const r = validarScreen(con((s) => (s.sections[2].data.items[0].href = href)), ctx);
    assert.strictEqual(r.ok, false, href);
  }
});

test("Un proyecto que no es tuyo: fuera", () => {
  const r = validarScreen(con((s) => (s.sections[1].data.items[0].href = `/execution?project=${AJENO}`)), ctx);
  assert.strictEqual(r.ok, false);
});

test("Datos con campos de más: fuera", () => {
  const r = validarScreen(con((s) => (s.sections[0].data.onClick = "x")), ctx);
  assert.strictEqual(r.ok, false);
});

test("Pedir escritura: fuera", () => {
  const r = validarScreen(con((s) => (s.permissions.escritura = true)), ctx);
  assert.strictEqual(r.ok, false);
});

test("Dos secciones con el mismo id: fuera", () => {
  const r = validarScreen(con((s) => s.sections.push({ ...s.sections[0] })), ctx);
  assert.strictEqual(r.ok, false);
  assert.match(!r.ok ? r.reason : "", /repetida/);
});

test("Demasiadas secciones: fuera", () => {
  const r = validarScreen(
    con((s) => {
      s.sections = Array.from({ length: MAX_SECCIONES + 1 }, (_, i) => ({ id: `t${i}`, kind: "text", data: { texto: "x" } }));
    }),
    ctx
  );
  assert.strictEqual(r.ok, false);
});

test("Lo que no es una pantalla: fuera, sin lanzar", () => {
  for (const v of [null, undefined, "hola", 42, [], {}]) {
    assert.strictEqual(validarScreen(v, ctx).ok, false);
  }
});

test("Acciones: un enlace válido o un intento del catálogo", () => {
  const r = validarScreen(
    con((s) => (s.actions = [{ label: "Volver a hoy", intent: "hoy" }, { label: "Dinero", href: "/money" }])),
    ctx
  );
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.ok ? r.screen.actions : [], [
    { label: "Volver a hoy", intent: "hoy" },
    { label: "Dinero", href: "/money" }
  ]);
});

test("Acciones ilegales: fuera", () => {
  for (const a of [{ label: "x", intent: "borrarTodo" }, { label: "x", href: "/money", intent: "hoy" }, { label: "", href: "/money" }, { href: "/money" }]) {
    assert.strictEqual(validarScreen(con((s) => (s.actions = [a])), ctx).ok, false, JSON.stringify(a));
  }
});

test("sanearAccion recorta la etiqueta", () => {
  assert.deepStrictEqual(sanearAccion({ label: "  Dinero  ", href: "/money" }, []), { label: "Dinero", href: "/money" });
  assert.strictEqual(sanearAccion(null, []), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-validador.test.ts`
Expected: FAIL con `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `acciones.ts`**

```ts
// src/lib/domain/centro/runtime/acciones.ts
// Qué puede hacer un botón de una pantalla (D-188). Puro, probado en
// tests/domain/centro-runtime-validador.test.ts.
//
// DOS COSAS Y NINGUNA MÁS: ir a una pantalla de la aplicación o pedir otra
// pantalla del runtime. Los enlaces pasan por `destinoValido`, la misma puerta
// que las sugerencias del Centro (D-167): una IA que puede escribir una
// dirección externa en un botón de tu aplicación es una IA que puede sacarte
// de ella.

import { destinoValido } from "../sugerencias.ts";
import { INTENT_KINDS, type Action, type IntentKind } from "./types.ts";

const MAX_LABEL = 60;

export function sanearAccion(v: unknown, proyectos: { id: string }[]): Action | null {
  if (!v || typeof v !== "object") return null;
  const a = v as Record<string, unknown>;

  const label = typeof a.label === "string" ? a.label.trim().slice(0, MAX_LABEL) : "";
  if (!label) return null;

  // Las dos a la vez es ambiguo; ninguna, un botón que no hace nada.
  const tieneHref = "href" in a;
  if (tieneHref === "intent" in a) return null;

  if (tieneHref) {
    return typeof a.href === "string" && destinoValido(a.href, proyectos) ? { label, href: a.href } : null;
  }
  return typeof a.intent === "string" && (INTENT_KINDS as readonly string[]).includes(a.intent)
    ? { label, intent: a.intent as IntentKind }
    : null;
}
```

- [ ] **Step 4: Write `validador.ts`**

```ts
// src/lib/domain/centro/runtime/validador.ts
// ¿Se puede pintar esta pantalla? (D-188). Puro, probado en
// tests/domain/centro-runtime-validador.test.ts.
//
// POR QUÉ ZOD AQUÍ Y NO EN EL REGISTRO. En este repo zod vive en la frontera
// (rutas, Server Actions, salida del modelo) y el registro de agentes lo evita
// a propósito (domain/agents/contrato.ts). Esto ES frontera: hoy la cruza lo que
// arma el servidor, mañana lo que escriba un modelo, y la regla no puede
// depender de quién la cruce.
//
// RECHAZA, NO ARREGLA. Una pantalla con un fallo no se repara quitando la
// sección mala: se devuelve el motivo y quien llama cae al lienzo de siempre.
// Arreglar en silencio escondería el fallo del generador que lo produjo.
//
// Tres barreras, en este orden:
//   1. la FORMA (zod): campos, tipos, catálogo cerrado, `escritura: false`;
//   2. los DATOS de cada kind con componente, estrictos: ni un campo de más;
//   3. el CONTENIDO: ningún texto con marcado, ningún `href` fuera de la app.

import { z } from "zod";
import { destinoValido } from "../sugerencias.ts";
import { sanearAccion } from "./acciones.ts";
import { SECTION_KINDS, type SectionKind } from "./secciones.ts";
import { INTENT_KINDS, type Action, type Screen } from "./types.ts";

export const MAX_SECCIONES = 12;

/**
 * Una etiqueta que abre (`<b>`, `<script `, `<Hero />`, `</div>`) o un
 * comentario. «gasto < ingreso» y «<3» no lo son: detrás del `<` no hay una
 * letra pegada seguida de espacio, `>` o `/`.
 */
const MARCADO = /<\/?[a-z][\w-]*[\s>/]|<!--/i;

const texto = (max: number) => z.string().max(max);
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const href = z.string().max(300);
const mensaje = z.object({ mensaje: texto(200) }).strict();

/**
 * Los datos de los kinds que tienen componente, estrictos. Los demás solo se
 * exigen objeto: su forma la fija el tipo en TypeScript, y su componente, cuando
 * exista, traerá aquí su esquema.
 */
const ESQUEMAS: Partial<Record<SectionKind, z.ZodTypeAny>> = {
  hero: z.object({ saludo: texto(80), nombre: texto(80), fechaISO: fecha, frase: texto(200).nullable() }).strict(),
  text: z.object({ texto: texto(2000) }).strict(),
  narrative: z.object({ titulo: texto(80), texto: texto(600), href: href.nullable() }).strict(),
  tasks: z
    .object({
      fechaISO: fecha,
      items: z
        .array(z.object({ id: texto(80), titulo: texto(200), contexto: texto(120).nullable(), href: href.nullable() }).strict())
        .max(7)
    })
    .strict(),
  quickActions: z
    .object({
      items: z
        .array(
          z
            .object({
              etiqueta: texto(40),
              detalle: texto(60),
              href,
              icono: z.enum(["proyectos", "biblioteca", "finanzas", "rutinas"])
            })
            .strict()
        )
        .max(6)
    })
    .strict(),
  emptyState: mensaje,
  error: mensaje,
  loading: mensaje
};

const DATOS_SIN_ESQUEMA = z.record(z.unknown());

const seccion = z
  .object({ id: z.string().min(1).max(60), kind: z.enum(SECTION_KINDS), title: texto(80).optional(), data: z.unknown() })
  .strict();

const pantalla = z
  .object({
    id: z.string().min(1).max(80),
    intent: z.enum(INTENT_KINDS),
    title: z.string().min(1).max(120),
    subtitle: texto(200).optional(),
    narrative: texto(600).optional(),
    layout: z.object({ densidad: z.enum(["aireada", "compacta"]) }).strict(),
    sections: z.array(seccion).max(MAX_SECCIONES),
    actions: z.array(z.unknown()).max(6),
    refreshPolicy: z.discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("alAbrir") }).strict(),
      z.object({ tipo: z.literal("cada"), segundos: z.number().int().min(60).max(86_400) }).strict(),
      z.object({ tipo: z.literal("porFranja") }).strict()
    ]),
    permissions: z.object({ lectura: z.literal(true), escritura: z.literal(false) }).strict()
  })
  .strict();

export interface ContextoDeValidacion {
  /** Los proyectos que se pueden enlazar con `?project=`. */
  proyectos: { id: string }[];
}

export type ResultadoDeValidacion = { ok: true; screen: Screen } | { ok: false; reason: string };

/** El primer texto con marcado o `href` ilegal, con su ruta. `null` si no hay. */
function primerProblema(v: unknown, ruta: string, ctx: ContextoDeValidacion): string | null {
  if (typeof v === "string") return MARCADO.test(v) ? `${ruta} contiene marcado.` : null;
  if (Array.isArray(v)) {
    for (let i = 0; i < v.length; i++) {
      const p = primerProblema(v[i], `${ruta}[${i}]`, ctx);
      if (p) return p;
    }
    return null;
  }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      if (k === "href" && typeof x === "string" && !destinoValido(x, ctx.proyectos)) {
        return `${ruta}.href no es un destino de la aplicación.`;
      }
      const p = primerProblema(x, `${ruta}.${k}`, ctx);
      if (p) return p;
    }
  }
  return null;
}

export function validarScreen(v: unknown, ctx: ContextoDeValidacion): ResultadoDeValidacion {
  const forma = pantalla.safeParse(v);
  if (!forma.success) {
    const i = forma.error.issues[0];
    return { ok: false, reason: `Forma inválida en «${i?.path.join(".") || "pantalla"}»: ${i?.message ?? "desconocido"}.` };
  }

  const ids = new Set<string>();
  for (const s of forma.data.sections) {
    if (ids.has(s.id)) return { ok: false, reason: `Sección repetida: «${s.id}».` };
    ids.add(s.id);
    if (!(ESQUEMAS[s.kind] ?? DATOS_SIN_ESQUEMA).safeParse(s.data).success) {
      return { ok: false, reason: `La sección «${s.id}» no tiene la forma de «${s.kind}».` };
    }
  }

  const problema = primerProblema(forma.data, "pantalla", ctx);
  if (problema) return { ok: false, reason: problema };

  const actions: Action[] = [];
  for (const a of forma.data.actions) {
    const saneada = sanearAccion(a, ctx.proyectos);
    if (!saneada) return { ok: false, reason: "Una acción no tiene un destino válido." };
    actions.push(saneada);
  }

  // El cast es seguro por lo de arriba: cada sección se comprobó contra el
  // esquema de SU kind, que es la pareja que `AnySection` expresa y zod no.
  return { ok: true, screen: { ...forma.data, actions } as Screen };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-validador.test.ts`
Expected: 17 tests PASS. If «Un menor que no es marcado» fails, fix `MARCADO`, not the test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/centro/runtime/acciones.ts src/lib/domain/centro/runtime/validador.ts tests/domain/centro-runtime-validador.test.ts
git commit -m "$(cat <<'EOF'
centro-runtime: validador de pantallas y acciones

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Aprendizaje (interfaces) y ensamblado con timeout

**Files:**
- Create: `src/lib/domain/centro/runtime/aprendizaje.ts`
- Create: `src/lib/domain/centro/runtime/ensamblar.ts`
- Test: `tests/domain/centro-runtime-ensamblar.test.ts`

**Interfaces:**
- Consumes: `ScreenPlan`, `HuecoDelPlan`; `DatosDe`, `SectionKind`; `AnySection`, `Screen`, `IntentKind`.
- Produces: `ScreenEvent`, `EventSink { emitir(e): void }`, `sinkNulo`, `eventosDeCierre(p): ScreenEvent[]`; `Hidratadores`, `ensamblarPantalla(plan, hidratadores, opciones?): Promise<Screen>`, `TIEMPO_POR_SECCION_MS = 1500`, `MENSAJE_SIN_HIDRATADOR`, `MENSAJE_FALLO`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-runtime-ensamblar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensamblarPantalla,
  MENSAJE_FALLO,
  MENSAJE_SIN_HIDRATADOR
} from "../../src/lib/domain/centro/runtime/ensamblar.ts";
import { eventosDeCierre } from "../../src/lib/domain/centro/runtime/aprendizaje.ts";
import type { ScreenPlan } from "../../src/lib/domain/centro/runtime/plan.ts";

const plan: ScreenPlan = {
  id: "hoy",
  intent: { kind: "hoy" },
  title: "Centro",
  huecos: [
    { id: "hero", kind: "hero" },
    { id: "narrativa", kind: "narrative" },
    { id: "foco", kind: "tasks", title: "Tu foco de hoy" },
    { id: "portafolio", kind: "portfolio", title: "Tu portafolio hoy" }
  ],
  actions: [],
  refreshPolicy: { tipo: "porFranja" }
};

const hero = async () => ({ saludo: "Hola", nombre: "Luis", fechaISO: "2026-09-24", frase: null });

test("Sin hidratador, la sección dice que todavía no sabe llenarse, y conserva su título", async () => {
  const s = await ensamblarPantalla(plan, { hero });
  const p = s.sections.find((x) => x.id === "portafolio");
  assert.deepStrictEqual(p, { id: "portafolio", title: "Tu portafolio hoy", kind: "emptyState", data: { mensaje: MENSAJE_SIN_HIDRATADOR } });
});

test("Un hidratador que lanza deja SU sección en error, y el resto se pinta", async () => {
  const s = await ensamblarPantalla(plan, {
    hero,
    tasks: async () => {
      throw new Error("se cayó");
    }
  });
  assert.strictEqual(s.sections.find((x) => x.id === "foco")?.kind, "error");
  assert.strictEqual(s.sections.find((x) => x.id === "hero")?.kind, "hero");
});

test("Un hidratador que lanza SIN promesa también se contiene", async () => {
  const s = await ensamblarPantalla(plan, {
    tasks: (() => {
      throw new Error("síncrono");
    }) as never
  });
  assert.strictEqual(s.sections.find((x) => x.id === "foco")?.kind, "error");
});

test("Un hidratador lento se corta: grafo lento = sección en error, no pantalla colgada", async () => {
  const inicio = Date.now();
  const s = await ensamblarPantalla(plan, { hero, tasks: () => new Promise<null>(() => {}) }, { tiempoMs: 30 });
  assert.ok(Date.now() - inicio < 1000);
  assert.deepStrictEqual(s.sections.find((x) => x.id === "foco")?.data, { mensaje: MENSAJE_FALLO });
});

test("`null` es «no hay nada que decir»: la sección no sale", async () => {
  const s = await ensamblarPantalla(plan, { hero, narrative: async () => null });
  assert.strictEqual(s.sections.some((x) => x.id === "narrativa"), false);
});

test("El orden es el del plan", async () => {
  const s = await ensamblarPantalla(plan, { hero });
  assert.deepStrictEqual(s.sections.map((x) => x.id), ["hero", "narrativa", "foco", "portafolio"]);
});

test("La pantalla sale con el intento y sin permiso de escritura", async () => {
  const s = await ensamblarPantalla(plan, {});
  assert.strictEqual(s.intent, "hoy");
  assert.deepStrictEqual(s.permissions, { lectura: true, escritura: false });
});

test("Cerrar sin aceptar nada es descartar", () => {
  const e = eventosDeCierre({ screenId: "hoy", intentKind: "hoy", abiertaEn: 1000, cerradaEn: 4000, aceptoAlgo: false });
  assert.deepStrictEqual(e.map((x) => x.tipo), ["tiempo", "descartada"]);
  assert.strictEqual(e[0]?.tipo === "tiempo" ? e[0].ms : -1, 3000);
});

test("Cerrar tras aceptar algo no es descartar, y el tiempo nunca es negativo", () => {
  const e = eventosDeCierre({ screenId: "hoy", intentKind: "hoy", abiertaEn: 5000, cerradaEn: 4000, aceptoAlgo: true });
  assert.deepStrictEqual(e.map((x) => x.tipo), ["tiempo"]);
  assert.strictEqual(e[0]?.tipo === "tiempo" ? e[0].ms : -1, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-ensamblar.test.ts`
Expected: FAIL con `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `aprendizaje.ts`**

```ts
// src/lib/domain/centro/runtime/aprendizaje.ts
// Lo que el Centro podrá recordar de sus pantallas (D-192). Puro, probado en
// tests/domain/centro-runtime-ensamblar.test.ts.
//
// SOLO LA FORMA. En Fase 1 no se guarda nada: el renderer emite estos eventos a
// un `EventSink`, y el que se conecta es `sinkNulo`. Así, el día que exista un
// sink de verdad no hay que tocar ni un componente, solo quién lo recibe.
//
// DÓNDE SE GUARDARÍAN. El precedente es `nav_visitas` (0072, D-183): una fila
// por hecho, ventana de 30 días, y DELETE concedido para que dejar de usar algo
// lo borre solo. Lo que se aprende tiene que poder caducar.
//
// `accionIgnorada` está declarado y nadie lo emite todavía: saber qué se ignoró
// exige saber qué se vio, y eso es visibilidad por sección, no un clic.

import type { SectionKind } from "./secciones.ts";
import type { IntentKind } from "./types.ts";

interface BaseDeEvento {
  screenId: string;
  intentKind: IntentKind;
  /** ISO. */
  en: string;
}

export type ScreenEvent =
  | (BaseDeEvento & { tipo: "abierta" })
  | (BaseDeEvento & { tipo: "descartada" })
  | (BaseDeEvento & { tipo: "tiempo"; ms: number })
  | (BaseDeEvento & { tipo: "accionAceptada"; sectionKind?: SectionKind; href: string })
  | (BaseDeEvento & { tipo: "accionIgnorada"; sectionKind?: SectionKind });

export interface EventSink {
  emitir(e: ScreenEvent): void;
}

export const sinkNulo: EventSink = { emitir() {} };

/** Lo que se emite al cerrar una pantalla: cuánto estuvo abierta y, si no sirvió, que se descartó. */
export function eventosDeCierre(p: {
  screenId: string;
  intentKind: IntentKind;
  abiertaEn: number;
  cerradaEn: number;
  aceptoAlgo: boolean;
}): ScreenEvent[] {
  const base = { screenId: p.screenId, intentKind: p.intentKind, en: new Date(p.cerradaEn).toISOString() };
  const eventos: ScreenEvent[] = [{ ...base, tipo: "tiempo", ms: Math.max(0, p.cerradaEn - p.abiertaEn) }];
  if (!p.aceptoAlgo) eventos.push({ ...base, tipo: "descartada" });
  return eventos;
}
```

- [ ] **Step 4: Write `ensamblar.ts`**

```ts
// src/lib/domain/centro/runtime/ensamblar.ts
// Del plan (QUÉ) a la pantalla (con datos) (D-189). Puro salvo el reloj,
// probado en tests/domain/centro-runtime-ensamblar.test.ts.
//
// UNA SECCIÓN NO TUMBA LA PANTALLA. Cada hidratador corre en paralelo, con su
// propio límite de tiempo, y su fallo se queda en su sección:
//
//   · sin hidratador    → `emptyState` (existe en el plan, no sabe llenarse);
//   · lanza o se pasa   → `error` (sabía llenarse y esta vez no pudo);
//   · devuelve `null`   → la sección no sale (no hay nada que decir, y una
//                         sección vacía no es información).
//
// Son tres estados distintos a propósito: vacío y roto no son lo mismo (ver
// `Subgraph.reason` en domain/graph/types.ts), y quien mire la pantalla tiene
// que poder distinguirlos.

import type { HuecoDelPlan, ScreenPlan } from "./plan.ts";
import type { DatosDe, SectionKind } from "./secciones.ts";
import type { AnySection, Screen } from "./types.ts";

/** Lo que tarda de más una sección antes de darla por perdida. */
export const TIEMPO_POR_SECCION_MS = 1500;

export const MENSAJE_SIN_HIDRATADOR = "Esta parte todavía no sabe llenarse.";
export const MENSAJE_FALLO = "No se pudo cargar esta parte.";

export type Hidratadores = {
  [K in SectionKind]?: (hueco: HuecoDelPlan) => Promise<DatosDe<K> | null>;
};

function conLimite<T>(p: Promise<T>, ms: number): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error("tiempo agotado")), ms);
  });
  return Promise.race([p, limite]).finally(() => clearTimeout(reloj));
}

async function hidratar(hueco: HuecoDelPlan, hidratadores: Hidratadores, ms: number): Promise<AnySection | null> {
  const base = { id: hueco.id, ...(hueco.title ? { title: hueco.title } : {}) };
  const h = hidratadores[hueco.kind] as ((x: HuecoDelPlan) => Promise<unknown>) | undefined;
  if (!h) return { ...base, kind: "emptyState", data: { mensaje: MENSAJE_SIN_HIDRATADOR } };

  try {
    // `.then` y no la llamada directa: un hidratador que lanza SIN promesa
    // también tiene que acabar en su sección, no en el `Promise.all`.
    const data = await conLimite(Promise.resolve().then(() => h(hueco)), ms);
    if (data === null) return null;
    // El kind es el del hueco y los datos los dio SU hidratador: la pareja la
    // garantiza el tipo `Hidratadores`, y el validador la vuelve a comprobar.
    return { ...base, kind: hueco.kind, data } as AnySection;
  } catch {
    return { ...base, kind: "error", data: { mensaje: MENSAJE_FALLO } };
  }
}

export async function ensamblarPantalla(
  plan: ScreenPlan,
  hidratadores: Hidratadores,
  opciones: { tiempoMs?: number } = {}
): Promise<Screen> {
  const ms = opciones.tiempoMs ?? TIEMPO_POR_SECCION_MS;
  const secciones = await Promise.all(plan.huecos.map((h) => hidratar(h, hidratadores, ms)));

  return {
    id: plan.id,
    intent: plan.intent.kind,
    title: plan.title,
    ...(plan.subtitle ? { subtitle: plan.subtitle } : {}),
    layout: { densidad: "aireada" },
    sections: secciones.filter((s): s is AnySection => s !== null),
    actions: plan.actions,
    refreshPolicy: plan.refreshPolicy,
    permissions: { lectura: true, escritura: false }
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-ensamblar.test.ts`
Expected: 9 tests PASS, en menos de un segundo.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/centro/runtime/aprendizaje.ts src/lib/domain/centro/runtime/ensamblar.ts tests/domain/centro-runtime-ensamblar.test.ts
git commit -m "$(cat <<'EOF'
centro-runtime: ensamblado con límite por sección e interfaces de aprendizaje

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Hidratadores de «Hoy» sobre el puerto del grafo

**Files:**
- Create: `src/lib/domain/centro/runtime/hoy.ts`
- Test: `tests/domain/centro-runtime-hoy.test.ts`

**Interfaces:**
- Consumes: `Hidratadores` de `ensamblar.ts`; `AccionRapida`, `ItemDeTarea`; en el test, `generadorDeterminista`, `ensamblarPantalla`, `validarScreen`, `FLAGS_APAGADOS`.
- Produces: `LectorDelGrafo { proyectoDeTarea(taskId): Promise<{ id: string; titulo: string } | null> }`, `FuentesDeHoy`, `hidratadoresDeHoy(f, grafo): Hidratadores`, `accionesRapidas(f): AccionRapida[]`, `MAX_FOCO = 5`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-runtime-hoy.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { hidratadoresDeHoy, accionesRapidas, MAX_FOCO, type FuentesDeHoy, type LectorDelGrafo } from "../../src/lib/domain/centro/runtime/hoy.ts";
import { generadorDeterminista } from "../../src/lib/domain/centro/runtime/generador.ts";
import { ensamblarPantalla } from "../../src/lib/domain/centro/runtime/ensamblar.ts";
import { validarScreen } from "../../src/lib/domain/centro/runtime/validador.ts";
import { FLAGS_APAGADOS } from "../../src/lib/domain/centro/runtime/flags.ts";

const MALPASO = "11111111-1111-4111-8111-111111111111";

function fuentes(cambios: Partial<FuentesDeHoy> = {}): FuentesDeHoy {
  return {
    saludo: "Buenos días",
    nombre: "Luis",
    fechaISO: "2026-09-24",
    resumen: "Vas bien. Tu enfoque en Malpaso está dando resultados.",
    unicaCosa: "Cerrar el entregable U3",
    tareas: [
      { id: "t1", title: "Revisar avances U3" },
      { id: "t2", title: "Llamar a proveedor" }
    ],
    senales: { vencidas: 0, diasParaFinDeQuincena: 9, presupuestoEnRojo: false },
    habitosPendientes: 2,
    ...cambios
  };
}

const grafo: LectorDelGrafo = {
  async proyectoDeTarea(id) {
    return id === "t1" ? { id: MALPASO, titulo: "Malpaso" } : null;
  }
};

const grafoRoto: LectorDelGrafo = {
  async proyectoDeTarea() {
    throw new Error("sin red");
  }
};

async function pantalla(f: FuentesDeHoy, g: LectorDelGrafo = grafo) {
  const plan = await generadorDeterminista.generar({ intent: { kind: "hoy" }, franja: "manana", flags: { ...FLAGS_APAGADOS } });
  return ensamblarPantalla(plan, hidratadoresDeHoy(f, g));
}

test("El foco empieza por la una cosa y lleva el proyecto que dice el grafo", async () => {
  const s = await pantalla(fuentes());
  const foco = s.sections.find((x) => x.id === "foco");
  assert.ok(foco && foco.kind === "tasks");
  assert.deepStrictEqual(foco.data.items, [
    { id: "una-cosa", titulo: "Cerrar el entregable U3", contexto: "Una cosa", href: null },
    { id: "t1", titulo: "Revisar avances U3", contexto: "Proyecto · Malpaso", href: `/execution?project=${MALPASO}` },
    { id: "t2", titulo: "Llamar a proveedor", contexto: null, href: "/execution" }
  ]);
});

test("Grafo que lanza: las filas salen sin proyecto y la pantalla sigue siendo válida", async () => {
  const s = await pantalla(fuentes(), grafoRoto);
  const foco = s.sections.find((x) => x.id === "foco");
  assert.ok(foco && foco.kind === "tasks");
  assert.ok(foco.data.items.every((i) => i.id === "una-cosa" || (i.contexto === null && i.href === "/execution")));
  assert.strictEqual(validarScreen(s, { proyectos: [] }).ok, true);
});

test("Como mucho cinco en el foco, contando la una cosa", async () => {
  const tareas = Array.from({ length: 9 }, (_, i) => ({ id: `t${i + 10}`, title: `Tarea ${i}` }));
  const s = await pantalla(fuentes({ tareas }));
  const foco = s.sections.find((x) => x.id === "foco");
  assert.strictEqual(foco?.kind === "tasks" ? foco.data.items.length : -1, MAX_FOCO);
});

test("Día vacío: queda el saludo y los atajos, y valida", async () => {
  const s = await pantalla(fuentes({ resumen: "  ", unicaCosa: null, tareas: [], habitosPendientes: 0 }));
  assert.deepStrictEqual(s.sections.map((x) => x.kind), ["hero", "quickActions"]);
  assert.strictEqual(validarScreen(s, { proyectos: [] }).ok, true);
});

test("La pantalla entera de hoy pasa el validador con los proyectos que vio el grafo", async () => {
  const s = await pantalla(fuentes());
  const r = validarScreen(s, { proyectos: [{ id: MALPASO }] });
  assert.strictEqual(r.ok, true, r.ok ? "" : r.reason);
});

test("Texto del usuario con marcado: la pantalla no valida (y el Centro cae al lienzo)", async () => {
  const s = await pantalla(fuentes({ unicaCosa: "Migrar <Header> a v2" }));
  assert.strictEqual(validarScreen(s, { proyectos: [{ id: MALPASO }] }).ok, false);
});

test("Los atajos hablan en singular cuando toca", () => {
  const a = accionesRapidas(fuentes({ senales: { vencidas: 1, diasParaFinDeQuincena: 1, presupuestoEnRojo: false }, habitosPendientes: 1 }));
  assert.deepStrictEqual(a.map((x) => x.detalle), ["1 vencida", "1 pendiente", "Lectura", "Quincena en 1 día"]);
});

test("Los atajos: rojo manda sobre quincena, y al día cuando no queda nada", () => {
  const a = accionesRapidas(fuentes({ senales: { vencidas: 0, diasParaFinDeQuincena: 2, presupuestoEnRojo: true }, habitosPendientes: 0 }));
  assert.deepStrictEqual(a.map((x) => x.detalle), ["2 en el plan", "Al día", "Lectura", "Presupuesto en rojo"]);
  assert.deepStrictEqual(a.map((x) => x.href), ["/execution", "/development/routines", "/development/library", "/money"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-hoy.test.ts`
Expected: FAIL con `ERR_MODULE_NOT_FOUND` para `hoy.ts`.

- [ ] **Step 3: Write `hoy.ts`**

```ts
// src/lib/domain/centro/runtime/hoy.ts
// De qué se llena la pantalla «Hoy» (D-189, D-190). Puro, probado en
// tests/domain/centro-runtime-hoy.test.ts.
//
// EL GRAFO PRIMERO, Y SOLO PARA LO QUE SABE. El grafo es una proyección de
// ESTRUCTURA: sabe que «Revisar avances U3» pertenece a Malpaso, no sabe si hoy
// marcaste un hábito. Así que de él sale la relación —el «Proyecto · Malpaso»
// de cada fila— y los valores salen de `FuentesDeHoy`, que el servidor llena con
// lo que `/api/centro` YA había cargado. Cada salida del grafo está nombrada
// aquí, que es lo que el encargo pedía: que no haya consultas escondidas.
//
// EL GRAFO ES UN PUERTO. `LectorDelGrafo` es una interfaz; la implementación
// (src/lib/centro/runtime/grafo.ts) es la única que conoce Supabase. Si el
// grafo falla, la fila sale sin proyecto: es un adorno, no el contenido.

import type { Hidratadores } from "./ensamblar.ts";
import type { AccionRapida, ItemDeTarea } from "./secciones.ts";

export interface LectorDelGrafo {
  /** El proyecto al que pertenece una tarea, o `null` si el grafo no lo sabe. */
  proyectoDeTarea(taskId: string): Promise<{ id: string; titulo: string } | null>;
}

export interface FuentesDeHoy {
  saludo: string;
  nombre: string;
  fechaISO: string;
  /** El «cómo voy» de la franja. Vacío = no hay narrativa. */
  resumen: string;
  unicaCosa: string | null;
  tareas: { id: string; title: string }[];
  senales: { vencidas: number; diasParaFinDeQuincena: number; presupuestoEnRojo: boolean };
  habitosPendientes: number;
}

/** Cinco, contando la una cosa. Más ya no es un foco. */
export const MAX_FOCO = 5;

/** Con cuántos días de quincena restantes el atajo de dinero lo dice (mismo umbral que `lienzo.ts`). */
const QUINCENA_CERCA = 3;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function accionesRapidas(f: FuentesDeHoy): AccionRapida[] {
  const s = f.senales;
  return [
    {
      etiqueta: "Proyectos",
      detalle: s.vencidas > 0 ? plural(s.vencidas, "vencida", "vencidas") : `${f.tareas.length} en el plan`,
      href: "/execution",
      icono: "proyectos"
    },
    {
      etiqueta: "Rutinas",
      detalle: f.habitosPendientes > 0 ? plural(f.habitosPendientes, "pendiente", "pendientes") : "Al día",
      href: "/development/routines",
      icono: "rutinas"
    },
    { etiqueta: "Biblioteca", detalle: "Lectura", href: "/development/library", icono: "biblioteca" },
    {
      etiqueta: "Finanzas",
      detalle: s.presupuestoEnRojo
        ? "Presupuesto en rojo"
        : s.diasParaFinDeQuincena <= QUINCENA_CERCA
          ? `Quincena en ${plural(s.diasParaFinDeQuincena, "día", "días")}`
          : "Patrimonio",
      href: "/money",
      icono: "finanzas"
    }
  ];
}

export function hidratadoresDeHoy(f: FuentesDeHoy, grafo: LectorDelGrafo): Hidratadores {
  return {
    hero: async () => ({
      saludo: f.saludo,
      nombre: f.nombre,
      fechaISO: f.fechaISO,
      frase: f.unicaCosa ? `Lo que importa hoy: ${f.unicaCosa}` : null
    }),

    narrative: async () => {
      const texto = f.resumen.trim();
      return texto ? { titulo: "Tu narrativa de hoy", texto, href: null } : null;
    },

    tasks: async () => {
      const tareas = f.tareas.slice(0, f.unicaCosa ? MAX_FOCO - 1 : MAX_FOCO);
      const proyectos = await Promise.all(tareas.map((t) => grafo.proyectoDeTarea(t.id).catch(() => null)));

      const items: ItemDeTarea[] = [];
      if (f.unicaCosa) items.push({ id: "una-cosa", titulo: f.unicaCosa, contexto: "Una cosa", href: null });
      tareas.forEach((t, i) => {
        const p = proyectos[i];
        items.push({
          id: t.id,
          titulo: t.title,
          contexto: p ? `Proyecto · ${p.titulo}` : null,
          href: p ? `/execution?project=${p.id}` : "/execution"
        });
      });
      return items.length > 0 ? { fechaISO: f.fechaISO, items } : null;
    },

    quickActions: async () => ({ items: accionesRapidas(f) })
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-hoy.test.ts`
Expected: 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/runtime/hoy.ts tests/domain/centro-runtime-hoy.test.ts
git commit -m "$(cat <<'EOF'
centro-runtime: la pantalla «Hoy», con el grafo como puerto

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Servidor — adaptador del grafo, `armarPantalla` y la ruta

**Files:**
- Create: `src/lib/domain/centro/runtime/respuesta.ts`
- Create: `src/lib/centro/runtime/grafo.ts`
- Create: `src/lib/centro/runtime/pantalla.ts`
- Modify: `src/app/api/centro/route.ts`
- Test: `tests/domain/centro-runtime-respuesta.test.ts`

**Interfaces:**
- Consumes: `nodeForEntity(entityId)`, `loadSubgraph(rootId, view, depth, maxNodes)` de `@/lib/data/graph`; `GRAPH_VIEWS` de `@/lib/domain/graph/views`; `greetingFor(hour)` de `@/lib/domain/datetime.ts`; `construirSecuencia` de `@/lib/domain/ritual/secuencia.ts`; `franjaDeHoy`; `PuertaDelRitual`, `ContenidoDelRitual` de `@/lib/data/ritual`; `flagsDelRuntime()`; todo lo de las tareas 1–6.
- Produces: `respuestaDelCentro(base, flags, screen)`; `lectorDelGrafo: LectorDelGrafo`; `armarPantalla(intent, e): Promise<Screen | null>`; la respuesta de `/api/centro` con `screen` y `flags` solo con el flag.

- [ ] **Step 1: Write the failing test («FLAG APAGADO = HOY»)**

```ts
// tests/domain/centro-runtime-respuesta.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { respuestaDelCentro } from "../../src/lib/domain/centro/runtime/respuesta.ts";
import { FLAGS_APAGADOS, resolverFlags } from "../../src/lib/domain/centro/runtime/flags.ts";
import type { Screen } from "../../src/lib/domain/centro/runtime/types.ts";

const base = { contenido: { x: 1 }, sugerencias: [], resumen: "", costumbre: null };

const screen: Screen = {
  id: "hoy",
  intent: "hoy",
  title: "Centro",
  layout: { densidad: "aireada" },
  sections: [],
  actions: [],
  refreshPolicy: { tipo: "porFranja" },
  permissions: { lectura: true, escritura: false }
};

test("FLAG APAGADO = HOY: la respuesta es campo por campo la de siempre", () => {
  const r = respuestaDelCentro(base, { ...FLAGS_APAGADOS }, null);
  assert.deepStrictEqual(Object.keys(r), ["ok", "contenido", "sugerencias", "resumen", "costumbre"]);
  assert.deepStrictEqual(r, { ok: true, ...base });
});

test("FLAG APAGADO = HOY, aunque alguien pase una pantalla", () => {
  const r = respuestaDelCentro(base, { ...FLAGS_APAGADOS }, screen);
  assert.strictEqual("screen" in r, false);
  assert.strictEqual("flags" in r, false);
});

test("Con el flag, viajan la pantalla y los flags resueltos", () => {
  const flags = resolverFlags({ AGENTIC_CENTER_RUNTIME: "1" });
  const r = respuestaDelCentro(base, flags, screen);
  assert.deepStrictEqual(r, { ok: true, ...base, screen, flags });
});

test("Con el flag y sin pantalla, `screen: null` dice que se intentó y se cayó al lienzo", () => {
  const r = respuestaDelCentro(base, resolverFlags({ AGENTIC_CENTER_RUNTIME: "1" }), null);
  assert.strictEqual("screen" in r && r.screen, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-respuesta.test.ts`
Expected: FAIL con `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `respuesta.ts`**

```ts
// src/lib/domain/centro/runtime/respuesta.ts
// La forma de la respuesta de `/api/centro` (D-191). Pura, probada en
// tests/domain/centro-runtime-respuesta.test.ts con la prueba «FLAG APAGADO = HOY».
//
// POR QUÉ UNA FUNCIÓN PARA UN OBJETO. Es la promesa de todo el runtime: con el
// flag apagado, el Centro es el de ayer. La ruta importa Next y Supabase y no se
// puede probar con el runner de node; esta función sí, y es la única que decide
// qué campos salen.

import type { FlagsDelRuntime } from "./flags.ts";
import type { Screen } from "./types.ts";

export function respuestaDelCentro<B extends object>(base: B, flags: FlagsDelRuntime, screen: Screen | null) {
  if (!flags.runtime) return { ok: true as const, ...base };
  return { ok: true as const, ...base, screen, flags };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-respuesta.test.ts`
Expected: 4 tests PASS.

- [ ] **Step 5: Write `src/lib/centro/runtime/grafo.ts`**

```ts
// src/lib/centro/runtime/grafo.ts
// El grafo, visto desde el runtime del Centro (D-190). SERVIDOR.
//
// Es el ÚNICO archivo del runtime que sabe que el grafo vive en Supabase, y ni
// siquiera lo toca: pasa por `src/lib/data/graph.ts`, que ya tiene la RLS, el
// mapeo de filas y la distinción entre «vacío» y «roto».
//
// Un salto desde la tarea por `belongs_to`, y no el primer proyecto que
// aparezca: con `depends_on` entre proyectos (#33) una tarea puede tener a un
// salto un proyecto que no es el suyo.

import { loadSubgraph, nodeForEntity } from "@/lib/data/graph";
import { GRAPH_VIEWS } from "@/lib/domain/graph/views";
import type { LectorDelGrafo } from "@/lib/domain/centro/runtime/hoy.ts";

export const lectorDelGrafo: LectorDelGrafo = {
  async proyectoDeTarea(taskId) {
    const { root } = await nodeForEntity(taskId);
    if (!root) return null;

    const sub = await loadSubgraph(root.nodeId, GRAPH_VIEWS.project, 1, 50);
    const vecinos = new Set(
      sub.edges
        .filter((e) => e.relType === "belongs_to" && (e.sourceId === root.nodeId || e.targetId === root.nodeId))
        .flatMap((e) => [e.sourceId, e.targetId])
    );
    const proyecto = sub.nodes.find((n) => n.nodeType === "project" && n.entityId && vecinos.has(n.id));
    return proyecto?.entityId ? { id: proyecto.entityId, titulo: proyecto.label } : null;
  }
};
```

- [ ] **Step 6: Write `src/lib/centro/runtime/pantalla.ts`**

```ts
// src/lib/centro/runtime/pantalla.ts
// Plan → hidratar → layout → validar (D-188, D-189). SERVIDOR.
//
// Devuelve `null` cuando la pantalla no pasa el validador, y lo avisa en el log
// del servidor: `null` significa «pinta el lienzo de siempre», que es el
// respaldo por diseño, no un error que la persona tenga que ver.

import { greetingFor } from "@/lib/domain/datetime.ts";
import { construirSecuencia } from "@/lib/domain/ritual/secuencia.ts";
import { franjaDeHoy } from "@/lib/domain/centro/franja.ts";
import { generadorDeterminista } from "@/lib/domain/centro/runtime/generador.ts";
import { ensamblarPantalla, type Hidratadores } from "@/lib/domain/centro/runtime/ensamblar.ts";
import { hidratadoresDeHoy, type FuentesDeHoy, type LectorDelGrafo } from "@/lib/domain/centro/runtime/hoy.ts";
import { aplicarLayout } from "@/lib/domain/centro/runtime/layout.ts";
import { validarScreen } from "@/lib/domain/centro/runtime/validador.ts";
import type { FlagsDelRuntime } from "@/lib/domain/centro/runtime/flags.ts";
import type { Intent, Screen } from "@/lib/domain/centro/runtime/types.ts";
import type { ContenidoDelRitual, PuertaDelRitual } from "@/lib/data/ritual";
import { lectorDelGrafo } from "./grafo";

export interface EntradaDePantalla {
  puerta: PuertaDelRitual;
  contenido: ContenidoDelRitual;
  resumen: string;
  flags: FlagsDelRuntime;
}

/**
 * Lo que la pantalla «Hoy» necesita, sacado de lo que la ruta YA cargó. Los
 * hábitos pendientes se cuentan igual que en `CentroPremium` (D-177): la regla
 * de la hora vive en `construirSecuencia` y no se escribe dos veces.
 */
function fuentesDeHoy(e: EntradaDePantalla): FuentesDeHoy {
  const c = e.contenido;
  return {
    saludo: greetingFor(e.puerta.hourLocal),
    nombre: e.puerta.nombre,
    fechaISO: e.puerta.dateISO,
    resumen: e.resumen,
    unicaCosa: c.plan?.oneThing ?? null,
    tareas: c.plan?.tareas ?? [],
    senales: c.senales,
    habitosPendientes: construirSecuencia({
      ...c,
      settings: { ...c.settings, steps: ["routineStep"], maxRoutineSteps: 99 }
    }).filter((p) => p.kind === "routineStep").length
  };
}

export async function armarPantalla(intent: Intent, e: EntradaDePantalla): Promise<Screen | null> {
  const plan = await generadorDeterminista.generar({ intent, franja: franjaDeHoy(e.puerta.hourLocal), flags: e.flags });

  // Los proyectos que el grafo devolvió son los únicos que la pantalla puede
  // enlazar con `?project=`: vienen de una RPC con RLS, así que son tuyos.
  const vistos: { id: string }[] = [];
  const grafo: LectorDelGrafo = {
    async proyectoDeTarea(id) {
      const p = await lectorDelGrafo.proyectoDeTarea(id);
      if (p) vistos.push({ id: p.id });
      return p;
    }
  };

  const hidratadores: Hidratadores = intent.kind === "hoy" ? hidratadoresDeHoy(fuentesDeHoy(e), grafo) : {};
  const screen = aplicarLayout(await ensamblarPantalla(plan, hidratadores), e.flags);

  const r = validarScreen(screen, { proyectos: vistos });
  if (!r.ok) {
    console.warn(`[centro-runtime] pantalla «${plan.id}» rechazada: ${r.reason}`);
    return null;
  }
  return r.screen;
}
```

- [ ] **Step 7: Modify `src/app/api/centro/route.ts`**

Add imports after the existing ones:

```ts
import { flagsDelRuntime } from "@/config/env";
import { armarPantalla } from "@/lib/centro/runtime/pantalla";
import { respuestaDelCentro } from "@/lib/domain/centro/runtime/respuesta.ts";
import type { Intent } from "@/lib/domain/centro/runtime/types.ts";
```

Replace the final `return NextResponse.json({ ok: true, contenido, sugerencias: pensado.sugerencias, resumen: pensado.resumen, costumbre });` with:

```ts
  // El runtime (D-188) va DESPUÉS y tampoco manda: sin el flag no se toca nada
  // —la respuesta es campo por campo la de siempre, y lo fija la prueba
  // «FLAG APAGADO = HOY»—, y con él, si algo falla, `screen: null` y el Centro
  // pinta el lienzo.
  const flags = flagsDelRuntime();
  // AGENTIC_GENERATED_SCREENS: aquí entrará `interpretarIntencion(texto)` cuando
  // la barra mande lo que se escribió. En Fase 1 abrir el Centro es siempre «hoy».
  const intent: Intent = { kind: "hoy" };
  const screen = flags.runtime
    ? await armarPantalla(intent, { puerta, contenido, resumen: pensado.resumen, flags }).catch((e: unknown) => {
        console.warn("[centro-runtime] no se pudo armar la pantalla", e);
        return null;
      })
    : null;

  return NextResponse.json(
    respuestaDelCentro(
      { contenido, sugerencias: pensado.sugerencias, resumen: pensado.resumen, costumbre },
      flags,
      screen
    )
  );
```

- [ ] **Step 8: Typecheck, lint and the whole unit suite**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: sin errores; todas las pruebas PASS, incluidas las de `centro-lienzo` («NO REORDENA») sin tocar.

- [ ] **Step 9: Commit**

```bash
git add src/lib/domain/centro/runtime/respuesta.ts src/lib/centro/runtime/ src/app/api/centro/route.ts tests/domain/centro-runtime-respuesta.test.ts
git commit -m "$(cat <<'EOF'
centro-runtime: /api/centro arma la pantalla detrás de AGENTIC_CENTER_RUNTIME

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Cliente — registro, secciones, renderer y el punto de corte

**Files:**
- Create: `src/components/centro-runtime/registro.ts`
- Create: `src/components/centro-runtime/secciones/Hero.tsx`
- Create: `src/components/centro-runtime/secciones/Narrativa.tsx`
- Create: `src/components/centro-runtime/secciones/Tareas.tsx`
- Create: `src/components/centro-runtime/secciones/Atajos.tsx`
- Create: `src/components/centro-runtime/secciones/Mensajes.tsx`
- Create: `src/components/centro-runtime/index.ts`
- Create: `src/components/centro-runtime/RuntimeScreen.tsx`
- Modify: `src/components/ritual/CentroPremium.tsx`
- Modify: `src/app/globals.css` (añadir al final)
- Test: `tests/domain/centro-runtime-registro.test.ts`

**Interfaces:**
- Consumes: `SectionKind`, `DatosDe`, `esSectionKind`, `IconoDeAccion`; `Screen`, `AnySection`; `EventSink`, `sinkNulo`, `eventosDeCierre`; iconos `IconBoard`, `IconLibrary`, `IconWealth`, `IconRoutines`, `IconSparkles`, `IconChevronRight` de `@/components/icons`; `fdate` de `@/lib/format`.
- Produces: `PropsDeSeccion<K> { data: DatosDe<K>; title?: string; alAceptar: (href: string) => void }`, `crearRegistroDeSecciones()`, `registroDeSecciones`, `registrarSeccion(kind, componente)`; `<RuntimeScreen screen onNavegar sink? />`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-runtime-registro.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { crearRegistroDeSecciones } from "../../src/components/centro-runtime/registro.ts";

// El renderer no importa componentes: los pide aquí por su `kind`. Estas
// pruebas usan funciones sueltas como componentes; el registro no sabe de JSX.

const Hero = () => null;
const OtroHero = () => null;

test("Se registra y se encuentra por su kind", () => {
  const r = crearRegistroDeSecciones();
  assert.deepStrictEqual(r.registrar("hero", Hero), { ok: true });
  assert.strictEqual(r.componenteDe("hero"), Hero);
});

test("Un kind sin componente es `null`, no una excepción", () => {
  assert.strictEqual(crearRegistroDeSecciones().componenteDe("portfolio"), null);
});

test("Un kind fuera del catálogo no se registra", () => {
  const r = crearRegistroDeSecciones();
  const res = r.registrar("iframe" as never, Hero);
  assert.strictEqual(res.ok, false);
  assert.deepStrictEqual(r.registrados(), []);
});

test("Lo que no es un componente no se registra", () => {
  const res = crearRegistroDeSecciones().registrar("hero", "Hero" as never);
  assert.strictEqual(res.ok, false);
});

test("Dos componentes para el mismo kind: gana el primero, y se dice", () => {
  const r = crearRegistroDeSecciones();
  r.registrar("hero", Hero);
  const res = r.registrar("hero", OtroHero);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(r.componenteDe("hero"), Hero);
});

test("Registrar el mismo componente dos veces no es un fallo (recarga en caliente)", () => {
  const r = crearRegistroDeSecciones();
  r.registrar("hero", Hero);
  assert.deepStrictEqual(r.registrar("hero", Hero), { ok: true });
});

test("La lista de registrados sale ordenada", () => {
  const r = crearRegistroDeSecciones();
  r.registrar("tasks", Hero);
  r.registrar("hero", Hero);
  assert.deepStrictEqual(r.registrados(), ["hero", "tasks"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-registro.test.ts`
Expected: FAIL con `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `registro.ts`**

```ts
// src/components/centro-runtime/registro.ts
// Qué componente pinta cada tipo de sección (D-188). Probado en
// tests/domain/centro-runtime-registro.test.ts.
//
// EL RENDERER NO IMPORTA COMPONENTES. Los pide aquí por su `kind`, y cada
// componente se registra a sí mismo al importarse (`index.ts` los importa
// todos). Añadir una sección es crear un archivo y una línea en `index.ts`; el
// renderer no se entera.
//
// Misma forma que el registro del Kernel (domain/agents/registro.ts): devuelve
// `{ ok, reason }` en vez de lanzar, y ante un duplicado gana el primero, porque
// que el segundo sustituyera en silencio haría depender la pantalla del orden de
// los imports. Imports relativos con `.ts`: el runner de node lo carga sin Next.

import type { ComponentType } from "react";
import { esSectionKind, type DatosDe, type SectionKind } from "../../lib/domain/centro/runtime/secciones.ts";

export interface PropsDeSeccion<K extends SectionKind> {
  data: DatosDe<K>;
  title?: string;
  /** Llamar al seguir un enlace de la sección: apunta el evento y cierra el Centro. */
  alAceptar: (href: string) => void;
}

export type ComponenteDeSeccion<K extends SectionKind> = ComponentType<PropsDeSeccion<K>>;

export type ResultadoDeRegistro = { ok: true } | { ok: false; reason: string };

export interface RegistroDeSecciones {
  registrar<K extends SectionKind>(kind: K, componente: ComponenteDeSeccion<K>): ResultadoDeRegistro;
  componenteDe<K extends SectionKind>(kind: K): ComponenteDeSeccion<K> | null;
  registrados(): SectionKind[];
}

export function crearRegistroDeSecciones(): RegistroDeSecciones {
  const porKind = new Map<SectionKind, unknown>();

  return {
    registrar(kind, componente) {
      if (!esSectionKind(kind)) return { ok: false, reason: `«${String(kind)}» no es un tipo de sección del catálogo.` };
      // Función o componente envuelto (memo/forwardRef son objetos).
      const esComponente = typeof componente === "function" || (typeof componente === "object" && componente !== null);
      if (!esComponente) return { ok: false, reason: `Lo registrado para «${kind}» no es un componente.` };

      const previo = porKind.get(kind);
      if (previo !== undefined && previo !== componente) {
        return { ok: false, reason: `Ya hay un componente registrado para «${kind}».` };
      }
      porKind.set(kind, componente);
      return { ok: true };
    },

    componenteDe<K extends SectionKind>(kind: K) {
      return (porKind.get(kind) as ComponenteDeSeccion<K> | undefined) ?? null;
    },

    registrados() {
      return [...porKind.keys()].sort();
    }
  };
}

/** El registro de la aplicación. Las pruebas crean el suyo con `crearRegistroDeSecciones`. */
export const registroDeSecciones = crearRegistroDeSecciones();

/** Registrar y, si no se pudo, decirlo en la consola: un fallo aquí es de programación. */
export function registrarSeccion<K extends SectionKind>(kind: K, componente: ComponenteDeSeccion<K>): ResultadoDeRegistro {
  const r = registroDeSecciones.registrar(kind, componente);
  if (!r.ok) console.warn(`[centro-runtime] ${r.reason}`);
  return r;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-runtime-registro.test.ts`
Expected: 7 tests PASS.

- [ ] **Step 5: Write the section components**

`src/components/centro-runtime/secciones/Hero.tsx`:

```tsx
"use client";

import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** El saludo, en grande. Tipografía y nada más (maqueta de la mañana). */
export default function SeccionHero({ data }: PropsDeSeccion<"hero">) {
  return (
    <header className="rt-hero">
      <p className="rt-eyebrow">Centro</p>
      <h1 className="rt-hero-titulo">
        {data.saludo},<br />
        {data.nombre}
      </h1>
      {data.frase && <p className="rt-hero-frase">{data.frase}</p>}
    </header>
  );
}

registrarSeccion("hero", SeccionHero);
```

`src/components/centro-runtime/secciones/Narrativa.tsx`:

```tsx
"use client";

import Link from "next/link";
import { IconChevronRight, IconSparkles } from "@/components/icons";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** El «cómo voy», en un bloque gris suave. Enlace solo si los datos traen destino. */
export default function SeccionNarrativa({ data, alAceptar }: PropsDeSeccion<"narrative">) {
  const cuerpo = (
    <>
      <IconSparkles aria-hidden className="rt-narrativa-icono" />
      <div className="rt-narrativa-cuerpo">
        <p className="rt-narrativa-titulo">{data.titulo}</p>
        <p className="rt-narrativa-texto">{data.texto}</p>
      </div>
    </>
  );
  const destino = data.href;
  return destino ? (
    <Link href={destino} className="rt-narrativa" onClick={() => alAceptar(destino)}>
      {cuerpo}
      <IconChevronRight aria-hidden className="rt-chevron" />
    </Link>
  ) : (
    <div className="rt-narrativa">{cuerpo}</div>
  );
}

registrarSeccion("narrative", SeccionNarrativa);
```

`src/components/centro-runtime/secciones/Tareas.tsx`:

```tsx
"use client";

import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { fdate } from "@/lib/format";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Una lista numerada: el número dice el orden, y el orden es del generador. */
export default function SeccionTareas({ data, title, alAceptar }: PropsDeSeccion<"tasks">) {
  return (
    <div className="rt-bloque">
      <div className="rt-bloque-cabecera">
        <h2 className="rt-bloque-titulo">{title ?? "Tareas"}</h2>
        <span className="rt-muted">{fdate(data.fechaISO)}</span>
      </div>
      <ol className="rt-lista">
        {data.items.map((t, i) => {
          const fila = (
            <>
              <span className="rt-num" aria-hidden>
                {i + 1}
              </span>
              <span className="rt-lista-texto">
                <span>{t.titulo}</span>
                {t.contexto && <span className="rt-muted">{t.contexto}</span>}
              </span>
              {t.href && <IconChevronRight aria-hidden className="rt-chevron" />}
            </>
          );
          const destino = t.href;
          return (
            <li key={t.id}>
              {destino ? (
                <Link href={destino} className="rt-fila" onClick={() => alAceptar(destino)}>
                  {fila}
                </Link>
              ) : (
                <div className="rt-fila">{fila}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

registrarSeccion("tasks", SeccionTareas);
```

`src/components/centro-runtime/secciones/Atajos.tsx`:

```tsx
"use client";

import Link from "next/link";
import { IconBoard, IconLibrary, IconRoutines, IconWealth } from "@/components/icons";
import type { IconoDeAccion } from "@/lib/domain/centro/runtime/secciones.ts";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Los datos nombran el destino; qué dibujo le toca se decide aquí, que es lo visual. */
const ICONOS: Record<IconoDeAccion, typeof IconBoard> = {
  proyectos: IconBoard,
  biblioteca: IconLibrary,
  finanzas: IconWealth,
  rutinas: IconRoutines
};

export default function SeccionAtajos({ data, title, alAceptar }: PropsDeSeccion<"quickActions">) {
  return (
    <div className="rt-bloque">
      {title && <h2 className="rt-bloque-titulo">{title}</h2>}
      <div className="rt-atajos">
        {data.items.map((a) => {
          const Icono = ICONOS[a.icono];
          return (
            <Link key={a.href} href={a.href} className="rt-atajo" onClick={() => alAceptar(a.href)}>
              <Icono aria-hidden width={20} height={20} />
              <span>{a.etiqueta}</span>
              <span className="rt-muted">{a.detalle}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

registrarSeccion("quickActions", SeccionAtajos);
```

`src/components/centro-runtime/secciones/Mensajes.tsx`:

```tsx
"use client";

import { registrarSeccion, type PropsDeSeccion } from "../registro";

/**
 * `emptyState` y `error` comparten forma y no significado: vacío es «esto aún
 * no sabe llenarse», error es «sabía y esta vez no pudo». Dos componentes para
 * que el CSS —y quien lea— los distinga.
 */
export function SeccionVacia({ data, title }: PropsDeSeccion<"emptyState">) {
  return (
    <div className="rt-bloque">
      {title && <h2 className="rt-bloque-titulo">{title}</h2>}
      <p className="rt-vacio">{data.mensaje}</p>
    </div>
  );
}

export function SeccionError({ data, title }: PropsDeSeccion<"error">) {
  return (
    <div className="rt-bloque">
      {title && <h2 className="rt-bloque-titulo">{title}</h2>}
      <p className="rt-vacio rt-vacio-error" role="status">
        {data.mensaje}
      </p>
    </div>
  );
}

registrarSeccion("emptyState", SeccionVacia);
registrarSeccion("error", SeccionError);
```

- [ ] **Step 6: Write `index.ts`**

```ts
// src/components/centro-runtime/index.ts
// El ÚNICO sitio que conoce qué secciones existen (D-188). Cada import registra
// su componente al cargarse; el renderer importa este archivo y pregunta al
// registro. Una sección nueva = su archivo + una línea aquí.

import "./secciones/Hero";
import "./secciones/Narrativa";
import "./secciones/Tareas";
import "./secciones/Atajos";
import "./secciones/Mensajes";

export { registroDeSecciones } from "./registro";
```

- [ ] **Step 7: Write `RuntimeScreen.tsx`**

```tsx
"use client";

import { useEffect, useRef } from "react";
import type { AnySection, Screen } from "@/lib/domain/centro/runtime/types.ts";
import { eventosDeCierre, sinkNulo, type EventSink } from "@/lib/domain/centro/runtime/aprendizaje.ts";
import { registroDeSecciones } from "./index";

const SIN_COMPONENTE = "Esta parte todavía no tiene cómo mostrarse.";

/**
 * El renderer genérico del runtime (D-188).
 *
 * NO SABE DE NINGUNA PANTALLA. Recorre las secciones en el orden en que llegan
 * y le pide al registro el componente de cada `kind`; si no hay, pinta
 * `emptyState`. No hay un solo `if (kind === …)` aquí, y no debe haberlo.
 *
 * Emite los eventos de aprendizaje (abierta, tiempo, descartada, acción
 * aceptada) a `sink`, que en Fase 1 es `sinkNulo`.
 */
export default function RuntimeScreen({
  screen,
  onNavegar,
  sink = sinkNulo
}: {
  screen: Screen;
  /** Seguir un enlace cierra el Centro, igual que en el lienzo. */
  onNavegar: () => void;
  sink?: EventSink;
}) {
  const aceptoAlgo = useRef(false);

  useEffect(() => {
    const abiertaEn = Date.now();
    const base = { screenId: screen.id, intentKind: screen.intent };
    sink.emitir({ ...base, tipo: "abierta", en: new Date(abiertaEn).toISOString() });
    return () => {
      for (const e of eventosDeCierre({ ...base, abiertaEn, cerradaEn: Date.now(), aceptoAlgo: aceptoAlgo.current })) {
        sink.emitir(e);
      }
    };
  }, [screen.id, screen.intent, sink]);

  function alAceptar(kind: AnySection["kind"]) {
    return (href: string) => {
      aceptoAlgo.current = true;
      sink.emitir({
        screenId: screen.id,
        intentKind: screen.intent,
        en: new Date().toISOString(),
        tipo: "accionAceptada",
        sectionKind: kind,
        href
      });
      onNavegar();
    };
  }

  return (
    <div className="rt-screen" data-densidad={screen.layout.densidad}>
      {screen.sections.map((s) => (
        <Seccion key={s.id} seccion={s} alAceptar={alAceptar(s.kind)} />
      ))}
    </div>
  );
}

function Seccion({ seccion, alAceptar }: { seccion: AnySection; alAceptar: (href: string) => void }) {
  const Componente = registroDeSecciones.componenteDe(seccion.kind);
  if (!Componente) {
    const Vacia = registroDeSecciones.componenteDe("emptyState");
    return Vacia ? (
      <section className="rt-seccion" data-kind="emptyState">
        <Vacia data={{ mensaje: SIN_COMPONENTE }} title={seccion.title} alAceptar={alAceptar} />
      </section>
    ) : null;
  }
  return (
    <section className="rt-seccion" data-kind={seccion.kind}>
      {/* El validador del servidor comprobó la pareja kind↔datos; TypeScript
          no puede seguirla a través de la unión, de ahí el cast. */}
      <Componente data={seccion.data as never} title={seccion.title} alAceptar={alAceptar} />
    </section>
  );
}
```

- [ ] **Step 8: Wire the cut point in `src/components/ritual/CentroPremium.tsx`**

Add imports:

```tsx
import RuntimeScreen from "@/components/centro-runtime/RuntimeScreen";
import type { Screen } from "@/lib/domain/centro/runtime/types.ts";
```

Add state next to `costumbre`:

```tsx
  // La pantalla del runtime (D-188). Solo llega con AGENTIC_CENTER_RUNTIME; si
  // no llega, o llega `null`, se pinta el lienzo de siempre.
  const [screen, setScreen] = useState<Screen | null>(null);
```

In the fetch, extend the response type with `screen?: Screen | null` and add after `if (r.costumbre) setCostumbre(r.costumbre);`:

```tsx
        if (r.screen) setScreen(r.screen);
```

Replace the `<Navegacion … />` block inside `<div className="rit-main">` with:

```tsx
        {/* El ÚNICO punto de corte del runtime: con pantalla, el renderer;
            sin ella, el lienzo de siempre. Armazón, foco, barra y pie no
            cambian. */}
        {screen ? (
          <RuntimeScreen screen={screen} onNavegar={onIrA} />
        ) : (
          <Navegacion
            entrada={entrada}
            today={cabecera.dateISO}
            nombre={cabecera.nombre}
            diaSemana={diaSemana}
            franja={franja}
            pensando={!contenido}
            workspaceId={workspaceId}
            onNavegar={onIrA}
          />
        )}
```

- [ ] **Step 9: Append the `.rt-*` block to `src/app/globals.css`**

```css
/* ─── Centro runtime (D-188) ──────────────────────────────────────────────
   Maqueta de la mañana: blanco, tipografía negra, mucho aire, casi sin
   bordes. Solo tokens del ritual (--rit-*): el modo oscuro sale solo, porque
   `.rit-shell[data-ritual-theme]` ya los redefine. */
.rt-screen { display: flex; flex-direction: column; gap: 40px; width: 100%; max-width: 560px; margin: 0 auto; padding: 8px 0 24px; color: var(--rit-text); }
.rt-screen[data-densidad="compacta"] { gap: 24px; }
.rt-muted { color: var(--rit-muted); font-size: 13px; }
.rt-eyebrow { margin: 0 0 12px; font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--rit-muted); }
.rt-hero-titulo { margin: 0; font-size: clamp(36px, 9vw, 52px); line-height: 1.05; font-weight: 600; letter-spacing: -0.02em; }
.rt-hero-frase { margin: 16px 0 0; font-size: 17px; line-height: 1.5; color: var(--rit-muted); }
.rt-narrativa { display: flex; align-items: flex-start; gap: 16px; padding: 20px; border-radius: 16px; background: color-mix(in srgb, var(--rit-text) 4%, transparent); color: inherit; text-decoration: none; }
.rt-narrativa-cuerpo { flex: 1; min-width: 0; }
.rt-narrativa-icono { flex: none; width: 22px; height: 22px; margin-top: 2px; }
.rt-narrativa-titulo { margin: 0 0 6px; font-weight: 600; }
.rt-narrativa-texto { margin: 0; line-height: 1.55; color: var(--rit-muted); }
.rt-bloque-titulo { margin: 0 0 12px; font-size: 18px; font-weight: 600; }
.rt-bloque-cabecera { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
.rt-bloque-cabecera .rt-bloque-titulo { margin: 0; }
.rt-lista { list-style: none; margin: 0; padding: 0; }
.rt-lista li + li .rt-fila { border-top: 1px solid var(--rit-line); }
.rt-fila { display: flex; align-items: center; gap: 16px; padding: 14px 0; color: inherit; text-decoration: none; }
.rt-num { flex: none; display: grid; place-items: center; width: 32px; height: 32px; border-radius: 50%; background: var(--rit-text); color: var(--rit-bg); font-size: 14px; font-weight: 600; }
.rt-lista-texto { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.rt-chevron { flex: none; width: 18px; height: 18px; color: var(--rit-muted); }
.rt-atajos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.rt-atajo { display: flex; flex-direction: column; gap: 4px; padding: 16px 12px; border-radius: 16px; background: color-mix(in srgb, var(--rit-text) 3%, transparent); color: inherit; text-decoration: none; font-size: 14px; }
.rt-atajo svg { margin-bottom: 10px; }
.rt-vacio { margin: 0; color: var(--rit-muted); font-size: 14px; }
.rt-vacio-error { color: var(--danger); }
.rt-fila:focus-visible, .rt-atajo:focus-visible, .rt-narrativa:focus-visible { outline: 2px solid var(--rit-accent); outline-offset: 2px; }
@media (max-width: 380px) { .rt-atajos { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
```

- [ ] **Step 10: Typecheck, lint, unit suite**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: sin errores; todo PASS. If `typecheck` rejects `seccion.data as never`, keep the cast and adjust only the type of `Componente` (`ComponenteDeSeccion<SectionKind>`); do not add a per-kind `if`/`switch` to the renderer.

- [ ] **Step 11: Commit**

```bash
git add src/components/centro-runtime/ src/components/ritual/CentroPremium.tsx src/app/globals.css tests/domain/centro-runtime-registro.test.ts
git commit -m "$(cat <<'EOF'
centro-runtime: registro de secciones, renderer genérico y punto de corte en el Centro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Documentación, decisiones y verificación en navegador

**Files:**
- Create: `docs/AGENTIC_CENTER_RUNTIME.md`
- Modify: `docs/DECISIONS.md` (añadir después de D-187)
- Modify: `docs/DEPLOY.md` (añadir las cuatro variables junto a `AGENT_KERNEL_*`; buscar con `grep -n AGENT_KERNEL docs/DEPLOY.md`)

**Interfaces:**
- Consumes: todo lo anterior (solo se describe).

- [ ] **Step 1: Write `docs/AGENTIC_CENTER_RUNTIME.md`**

Read `docs/AGENTIC_KERNEL_ARCHITECTURE.md` first and match its tone and heading depth. The document must contain these sections, with this content:

1. **Qué es** — El Centro deja de tener una sola pantalla fija: un generador decide QUÉ (un `ScreenPlan` sin datos), el servidor la llena y la valida, y un renderer genérico decide CÓMO con componentes que se registran solos. Nunca HTML, nunca JSX: JSON declarativo.
2. **El flujo** — el diagrama del spec (Intento → `interpretarIntencion` → `ScreenGenerator` → `ScreenPlan` → hidratadores → `aplicarLayout` → `validarScreen` → `/api/centro` → `RuntimeScreen` → registro → componentes), con el archivo de cada paso.
3. **Responsabilidades** — la tabla «Quién / Decide / Y no puede» del spec, y la frase: el agente decide QUÉ, el renderer CÓMO, React LO VISUAL.
4. **Mapa de archivos** — las tres carpetas (`domain/centro/runtime`, `lib/centro/runtime`, `components/centro-runtime`) con una línea por archivo.
5. **Cómo encaja con el Centro de hoy** — `CentroPremium` conserva armazón, foco, «Cerrar», `BarraCaptura` y pie; el único punto de corte es `screen ? <RuntimeScreen/> : <Navegacion/>`; `/api/centro` solo añade `screen` y `flags` con el flag (prueba «FLAG APAGADO = HOY»); `tarjetasDelCentro` y «NO REORDENA» no se tocan.
6. **Flags** — la tabla de las cuatro variables, qué hace cada una hoy (una real, tres no-op) y dónde se enchufa cada no-op (`route.ts` para GENERATED_SCREENS, `layout.ts` para LAYOUT_ENGINE, `RuntimeScreen`/navegación para DYNAMIC_NAVIGATION). Encender = `"1"` y redesplegar; apagar = borrar y redesplegar.
7. **Cómo añadir una sección** — (a) el tipo de datos ya existe en `secciones.ts`; (b) añadir su esquema estricto a `ESQUEMAS` en `validador.ts`; (c) crear `secciones/<Nombre>.tsx` que llama a `registrarSeccion`; (d) una línea en `index.ts`; (e) un hidratador en el `Hidratadores` del intento que la use.
8. **Cómo añadir una pantalla** — un intento en `INTENT_KINDS` y su palabra en `intencion.ts`; sus huecos en `HUECOS` de `generador.ts`; su función `hidratadoresDe<Intento>` junto a `hoy.ts`, con el grafo como puerto.
9. **Compromisos (tradeoffs)** — (a) el grafo decide estructura y relaciones, no valores: la watchlist no guarda precios (D-184) ni el grafo hábitos del día, así que cada valor sale de un proveedor con nombre; (b) hidratar en el servidor: una sola validación y componentes puros, a cambio de que la pantalla espere a la sección más lenta, acotado a 1,5 s por sección; (c) generador determinista: probado y gratis, a cambio de entender poco; (d) sin `hydrate()` en el cliente, a diferencia de la visión V2: un componente que pide datos es un componente que consulta módulos; (e) el validador rechaza la pantalla entera en vez de arreglarla: un texto del usuario con `<Etiqueta>` hace caer al lienzo.
10. **Evolución y migración** — las fases de la visión V2 contra este código: Fase 1 Screen JSON (esto); Fase 2 Layout Engine (`AGENTIC_LAYOUT_ENGINE`, `aplicarLayout`); Fase 3 Context Engine (hidratadores de portafolio/proyecto/semana/dinero, más puertos del grafo); Fase 4 Adaptive Navigation (`AGENTIC_DYNAMIC_NAVIGATION` + un `EventSink` real sobre el modelo de `nav_visitas`); Fase 5 Multimodal; Fase 6 Living Workspace. El paso a modelo: un segundo `ScreenGenerator` que devuelve `ScreenPlan` —nunca datos—, validado por la misma puerta, detrás de `AGENTIC_GENERATED_SCREENS`, y solo después de que el Kernel se haya ejecutado de verdad al menos una vez.
11. **Aprendizaje** — los cinco eventos, `EventSink`, `sinkNulo`, por qué `accionIgnorada` no se emite todavía, y dónde se guardarían (tabla nueva con la forma de `nav_visitas`, ventana de 30 días, DELETE concedido).
12. **Lo que NO está demostrado** — que la pantalla de «hoy» con datos reales de producción pase el validador (probado solo con datos sintéticos y con la base local); que el adaptador del grafo encuentre el proyecto de tareas reales (depende de que `graph_sources` proyecte `belongs_to` tarea→proyecto); tiempos reales del grafo contra el límite de 1,5 s.

- [ ] **Step 2: Add D-188 to D-192 to `docs/DECISIONS.md`**

Append after the D-187 entry, in the same `- **D-NNN · Título.** texto` format:

```markdown
- **D-188 · El Centro como runtime: una pantalla es JSON.** El Centro deja de
  tener una sola pantalla fija. Un generador decide QUÉ enseñar como
  `ScreenPlan` —secciones y orden, sin un solo dato—, el servidor lo llena y lo
  valida, y un renderer genérico lo pinta pidiendo a un registro el componente
  de cada `kind`. Nunca HTML ni JSX: el catálogo de 24 tipos es cerrado y el
  validador (zod, en la frontera) rechaza marcado, kinds desconocidos y enlaces
  fuera de la aplicación. Solo seis tipos tienen componente; el resto existe
  como contrato y se pinta como `emptyState`. Spec en
  `docs/superpowers/specs/2026-09-24-centro-runtime-design.md`, arquitectura en
  `docs/AGENTIC_CENTER_RUNTIME.md`.

- **D-189 · Se hidrata en el servidor, y cada sección cae sola.** La visión V2
  pedía `hydrate()` en cada componente; se descartó porque un componente que
  pide sus datos es un componente que consulta módulos. `/api/centro` devuelve
  la pantalla ya llena y validada. Cada hidratador tiene 1,5 s: si lanza o se
  pasa, SU sección pasa a `error` y el resto se pinta; si devuelve `null`, la
  sección no sale. Si la pantalla entera no valida, `screen: null` y el Centro
  pinta el lienzo de siempre: el camino viejo es el respaldo por diseño.

- **D-190 · El grafo decide la estructura, no los valores.** El encargo pedía
  que todo saliera del grafo. El grafo es una proyección de estructura: sabe que
  una tarea pertenece a Malpaso, no el precio de NVDA (D-184) ni si hoy marcaste
  un hábito. Los hidratadores reciben el grafo como puerto (`LectorDelGrafo`) y
  sacan de él las relaciones; los valores salen de lo que la ruta ya cargó, con
  nombre. Un grafo que falla deja la fila sin proyecto, no la pantalla sin foco.

- **D-191 · Cuatro variables, una sola real.** `AGENTIC_CENTER_RUNTIME`
  enciende el runtime; `AGENTIC_GENERATED_SCREENS`, `AGENTIC_LAYOUT_ENGINE` y
  `AGENTIC_DYNAMIC_NAVIGATION` existen, se comprueban donde se enchufarán y hoy
  no hacen nada. Los tres dependen del primero, y eso se resuelve en un sitio
  (`resolverFlags`). El cliente no lee variables: recibe los flags en la
  respuesta. Con el primero apagado la respuesta de `/api/centro` es campo por
  campo la de antes (prueba «FLAG APAGADO = HOY»).

- **D-192 · Aprendizaje: la forma, sin tabla.** El renderer ya emite pantalla
  abierta, tiempo, descartada y acción aceptada a un `EventSink`; el que se
  conecta es `sinkNulo`. Sin migración a propósito: guardar exige decidir
  cuánto dura lo aprendido, y el precedente (`nav_visitas`, D-183) dice 30 días
  y DELETE concedido. `accionIgnorada` está declarado y no se emite: saber qué se
  ignoró exige saber qué se vio.
```

- [ ] **Step 3: Add the four variables to `docs/DEPLOY.md`**

Next to where `AGENT_KERNEL_COACH` is documented, add a short paragraph: the four variables, that all are off by default, only `"1"` turns them on, the three secondary ones do nothing in Phase 1, and turning off = delete + redeploy.

- [ ] **Step 4: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: sin errores, todo PASS. **No ejecutar `pnpm verify`.**

- [ ] **Step 5: Browser check, flag OFF**

Run: `pnpm build && pnpm start` (sin la variable). Iniciar sesión con el usuario local, abrir el Centro con su botón. Expected: el lienzo de siempre; en la pestaña Red, la respuesta de `/api/centro` no tiene `screen` ni `flags`.

- [ ] **Step 6: Browser check, flag ON**

Run: `AGENTIC_CENTER_RUNTIME=1 pnpm start` (la ruta es `force-dynamic` y lee la variable en cada petición; no hace falta recompilar). Abrir el Centro a ancho de iPhone (390 px; Playwright con WebKit local, ver la nota de memoria sobre WebKit sin sudo). Expected: hero «Buenos días, / Luis», bloque «Tu narrativa de hoy» si hay resumen, «Tu foco de hoy» numerado con «Proyecto · X» donde el grafo lo sepa, «Sigue por aquí» con cuatro atajos; `BarraCaptura`, «Cerrar» y el pie siguen ahí; Escape cierra; un atajo navega y cierra el Centro. Comparar con la maqueta de la mañana y guardar la captura en el scratchpad.

- [ ] **Step 7: Browser check, fallback**

Con el flag encendido, poner temporalmente como «una cosa» del plan de hoy el texto `Migrar <Header> a v2` y abrir el Centro. Expected: se pinta el lienzo de siempre y el log del servidor dice `[centro-runtime] pantalla «hoy» rechazada: … contiene marcado.` Restaurar la «una cosa» original.

- [ ] **Step 8: Commit**

```bash
git add docs/AGENTIC_CENTER_RUNTIME.md docs/DECISIONS.md docs/DEPLOY.md
git commit -m "$(cat <<'EOF'
D-188…D-192: el Centro como runtime, documentado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
)"
```
