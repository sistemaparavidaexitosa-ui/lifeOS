# El Centro como agente de interfaz (Fase 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el Centro, con `AGENTIC_CENTER_RUNTIME=1`, sea una conversación a pantalla completa donde cada pregunta sobre cualquier módulo produce texto + interfaz generada (bloques anclados a filas reales), navegación y recomendaciones, con «mercado» y «hoy» como capacidades enchufables.

**Architecture:** El modelo (vía `generateJson` con las herramientas del chat) devuelve `{ texto, bloques: [{ kind, datos: "<JSON>" }] }`. El dominio puro parsea cada bloque (zod), resuelve las referencias `fila:<tabla>:<uuid>` + campo contra las filas que las herramientas entregaron EN ESE TURNO, formatea y deriva enlaces; las capacidades hidratan con sus fuentes (Polygon, inversiones); las recomendaciones se guardan como `coach_proposals`. `validarScreen` (Fase 1) es la última puerta. En el cliente, `CentroAgente` sustituye entero a `CentroPremium` y pinta cada turno con el `RuntimeScreen` de la Fase 1.

**Tech Stack:** Next.js App Router, React, TypeScript, zod 3.25, node test runner, Supabase, Gemini (`generateJson`) con respaldo Groq, Polygon.

**Spec:** `docs/superpowers/specs/2026-09-24-centro-agente-design.md`

## Global Constraints

- Rama: `feat/centro-agente` (desde `main`, que ya tiene la Fase 1 #74).
- `src/lib/domain/**`: PURO, imports relativos con `.ts`. Nada de Supabase, red ni `new Date()` sin inyectar.
- **El agente no escribe cifras dentro de los bloques.** Todo número de un bloque sale de una fila leída en el turno, de un hidratador o de Polygon. El texto libre de bloques (`insight`, `motivo`, notas de mercado) que contenga cifras con unidad se descarta.
- Todo `href` pasa por `destinoValido()` (`src/lib/domain/centro/sugerencias.ts`).
- El agente propone, nunca escribe: recomendaciones → `coach_proposals` (origen `centro`, `status: pending`); aceptar es `acceptProposal`.
- Flag: `AGENTIC_CENTER_RUNTIME` (sin variables nuevas). Apagado → `CentroPremium` y `/api/centro` idénticos a hoy; `/api/centro/turno` responde 404.
- Sin migraciones. El hilo no se guarda.
- Verificación: `pnpm typecheck && pnpm lint && pnpm test:unit`. **Nunca `pnpm verify`** (borra la base local).
- Comentarios y nombres en español, densidad de comentarios «por qué» como el resto de `domain/centro/`.
- Cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Codex** (tareas 1–4) no tiene red ni git: edita y corre tests; el controlador commitea.

## Review Focus

1. **Referencia a una fila que no se leyó** (el modelo inventa `fila:debts:<uuid>`): ese ítem no sale; el turno sigue. → Task 3.
2. **Bloque con cifras en texto libre** («Te ahorras $3,000»): el bloque/ítem se descarta, el `texto` del turno sí puede decirlo. → Task 3.
3. **Tabla sin ruta en el menú** (`notes`, `comments`): los ítems salen sin enlace, nunca con un enlace a una sección oculta. → Task 3.
4. **Sin `POLYGON_API_KEY`**: los bloques de mercado dicen «Falta conectar la fuente de mercado», sin ceros. → Task 4 y Task 6.
5. **El modelo falla entero** (Gemini y Groq): turno con texto de disculpa, sin bloques, el hilo sigue usable. → Task 6.

---

### Task 1 (Codex): el catálogo aprende los bloques del agente

**Files:**
- Modify: `src/lib/domain/centro/runtime/secciones.ts`
- Modify: `src/lib/domain/centro/runtime/validador.ts`
- Modify: `tests/domain/centro-runtime-catalogo.test.ts`
- Modify: `tests/domain/centro-runtime-validador.test.ts`
- Test: `tests/domain/centro-agente-catalogo.test.ts`

**Interfaces:**
- Produces (en `secciones.ts`): kinds nuevos `"lista" | "metricas" | "irA" | "recomendaciones" | "insight" | "movimientos"` (total 30); tipos de datos RESUELTOS `DatosLista`, `DatosMetricas`, `DatosTable`, `DatosChart`, `DatosCards`, `DatosTimeline`, `DatosIrA`, `DatosRecomendaciones`, `DatosInsight`, `DatosPortfolio`, `DatosMovimientos`, `DatosWatchlist`, `Tono`; esquemas estrictos de todos ellos en `ESQUEMAS` del validador.

Los kinds `table`, `chart`, `cards`, `timeline`, `portfolio`, `watchlist` existían solo como contrato, sin componente: se REDEFINEN sus datos a la forma resuelta (lo que el renderer recibe ya formateado).

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-agente-catalogo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SECTION_KINDS, esSectionKind } from "../../src/lib/domain/centro/runtime/secciones.ts";
import { validarScreen } from "../../src/lib/domain/centro/runtime/validador.ts";

const MIO = "11111111-1111-4111-8111-111111111111";
const ctx = { proyectos: [{ id: MIO }] };

function pantalla(sections: unknown[]) {
  return {
    id: "turno",
    intent: "libre",
    title: "Centro",
    layout: { densidad: "aireada" },
    sections,
    actions: [],
    refreshPolicy: { tipo: "alAbrir" },
    permissions: { lectura: true, escritura: false }
  };
}

test("El catálogo trae los seis kinds del agente", () => {
  for (const k of ["lista", "metricas", "irA", "recomendaciones", "insight", "movimientos"]) assert.ok(esSectionKind(k), k);
  assert.strictEqual(SECTION_KINDS.length, 30);
});

const validas: Record<string, unknown> = {
  lista: { titulo: "Hábitos", items: [{ id: "h1", titulo: "Leer", detalle: "3 días", estado: "activo", href: "/development/routines" }] },
  metricas: { titulo: null, items: [{ etiqueta: "Patrimonio", valor: "$18,742.32" }] },
  table: { titulo: "Deudas", columnas: ["Nombre", "Saldo"], filas: [{ id: "d1", celdas: ["Tarjeta", "$4,000.00"], href: "/debt" }] },
  chart: { titulo: "Gasto", tipo: "linea", unidad: "MXN", puntos: [{ x: "2026-09-01", y: 10 }, { x: "2026-09-02", y: 12 }] },
  cards: { titulo: "Libros", items: [{ id: "b1", titulo: "Atomic Habits", detalle: null, href: "/development/library" }] },
  timeline: { titulo: "Hitos", items: [{ id: "t1", fecha: "24 sep 2026", titulo: "Entrega U3", href: `/execution?project=${MIO}` }] },
  irA: { destinos: [{ etiqueta: "Abrir presupuesto", href: "/money/budget" }] },
  recomendaciones: { items: [{ propuestaId: MIO, titulo: "Bloquea 30 min", motivo: "Tu tarde está libre" }] },
  insight: { texto: "NVDA y AVGO siguen siendo tus mejores posiciones." },
  portfolio: { total: "$18,742.32", nota: "Valuación al 12 sep 2026", serie: [{ x: "2026-09-01", y: 1 }, { x: "2026-09-02", y: 2 }] },
  movimientos: { configurado: true, items: [{ ticker: "NVDA", nombre: "NVIDIA", precio: "$118.24", variacion: "+4.32%", tono: "ok", nota: "Sigue fuerte el impulso." }] },
  watchlist: { configurado: false, items: [{ ticker: "NVDA", nombre: "NVIDIA", precio: null, variacion: null, tono: null, serie: [] }] }
};

test("Cada kind del agente acepta su forma resuelta", () => {
  for (const [kind, data] of Object.entries(validas)) {
    const r = validarScreen(pantalla([{ id: `s-${kind}`, kind, data }]), ctx);
    assert.strictEqual(r.ok, true, `${kind}: ${r.ok ? "" : r.reason}`);
  }
});

test("Cada kind del agente es estricto: un campo de más lo tumba", () => {
  for (const [kind, data] of Object.entries(validas)) {
    const r = validarScreen(pantalla([{ id: `s-${kind}`, kind, data: { ...(data as object), extra: 1 } }]), ctx);
    assert.strictEqual(r.ok, false, kind);
  }
});

test("Un enlace de ítem fuera de la app tumba la sección", () => {
  const data = { titulo: "x", items: [{ id: "h1", titulo: "Leer", detalle: null, estado: null, href: "https://evil.example" }] };
  assert.strictEqual(validarScreen(pantalla([{ id: "l", kind: "lista", data }]), ctx).ok, false);
});

test("Los topes: más de 8 ítems en una lista, fuera", () => {
  const items = Array.from({ length: 9 }, (_, i) => ({ id: `h${i}`, titulo: "x", detalle: null, estado: null, href: null }));
  assert.strictEqual(validarScreen(pantalla([{ id: "l", kind: "lista", data: { titulo: "x", items } }]), ctx).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-catalogo.test.ts`
Expected: FAIL (los kinds nuevos no existen; `lista` no es kind válido).

- [ ] **Step 3: Extend `secciones.ts`**

Add the six kinds to `SECTION_KINDS` (after `"loading"`):

```ts
  "loading",
  // Fase 2 (D-194): el vocabulario del agente de interfaz.
  "lista",
  "metricas",
  "irA",
  "recomendaciones",
  "insight",
  "movimientos"
] as const;
```

Replace the interfaces `DatosChart`, `DatosTimeline`, `DatosCards`, `DatosTable`, `DatosPortfolio`, `DatosWatchlist` (and delete `Posicion`, which nobody else uses — check with `grep -rn "Posicion\b" src tests`) with the RESOLVED shapes, and add the new ones:

```ts
/** Verde, rojo o neutro. Solo las variaciones llevan color. */
export type Tono = "ok" | "bad" | "info";

/**
 * FORMA RESUELTA (Fase 2, D-194). Lo que llega al renderer ya viene formateado
 * por el servidor —«$18,742.32», «24 sep 2026»—: el componente pinta cadenas y
 * no sabe de monedas ni de locales. Las gráficas son la excepción: necesitan
 * el número para dibujar.
 */
export interface DatosLista {
  titulo: string;
  items: { id: string; titulo: string; detalle: string | null; estado: string | null; href: string | null }[];
}

export interface DatosMetricas {
  titulo: string | null;
  items: { etiqueta: string; valor: string }[];
}

export interface DatosTable {
  titulo: string;
  columnas: string[];
  filas: { id: string; celdas: string[]; href: string | null }[];
}

export interface DatosChart {
  titulo: string;
  tipo: "linea" | "barras";
  /** «MXN», «%», «» — para el eje, no para calcular. */
  unidad: string;
  puntos: { x: string; y: number }[];
}

export interface DatosCards {
  titulo: string;
  items: { id: string; titulo: string; detalle: string | null; href: string | null }[];
}

export interface DatosTimeline {
  titulo: string;
  items: { id: string; fecha: string; titulo: string; href: string | null }[];
}

export interface DatosIrA {
  destinos: { etiqueta: string; href: string }[];
}

export interface DatosRecomendaciones {
  /** `propuestaId` es la fila de `coach_proposals`: aceptar pasa por `acceptProposal`. */
  items: { propuestaId: string; titulo: string; motivo: string }[];
}

export interface DatosInsight {
  texto: string;
}

export interface DatosPortfolio {
  total: string;
  /** «Valuación al 12 sep 2026 · 2 inversiones en otra moneda no suman». */
  nota: string;
  /** Vacía = no hay historia suficiente, y no se dibuja. */
  serie: { x: string; y: number }[];
}

export interface DatosMovimientos {
  /** `false` = falta la llave de mercado: se enseñan los tickers sin cifras. */
  configurado: boolean;
  items: {
    ticker: string;
    nombre: string;
    precio: string | null;
    variacion: string | null;
    tono: Tono | null;
    nota: string | null;
  }[];
}

export interface DatosWatchlist {
  configurado: boolean;
  items: {
    ticker: string;
    nombre: string;
    precio: string | null;
    variacion: string | null;
    tono: Tono | null;
    /** Cierres para la sparkline, del más viejo al más nuevo. Vacía = sin línea. */
    serie: number[];
  }[];
}
```

And add to `DatosPorKind`:

```ts
  lista: DatosLista;
  metricas: DatosMetricas;
  irA: DatosIrA;
  recomendaciones: DatosRecomendaciones;
  insight: DatosInsight;
  movimientos: DatosMovimientos;
```

- [ ] **Step 4: Add strict schemas in `validador.ts`**

Inside `ESQUEMAS`, after `loading: mensaje`, add (reusing `texto`, `href`):

```ts
  // --- Fase 2 (D-194): la forma resuelta de los bloques del agente ---------
  lista: z
    .object({
      titulo: texto(80),
      items: z
        .array(
          z
            .object({ id: texto(120), titulo: texto(160), detalle: texto(160).nullable(), estado: texto(60).nullable(), href: href.nullable() })
            .strict()
        )
        .min(1)
        .max(8)
    })
    .strict(),
  metricas: z
    .object({
      titulo: texto(80).nullable(),
      items: z.array(z.object({ etiqueta: texto(60), valor: texto(40) }).strict()).min(1).max(4)
    })
    .strict(),
  table: z
    .object({
      titulo: texto(80),
      columnas: z.array(texto(40)).min(1).max(4),
      filas: z
        .array(z.object({ id: texto(120), celdas: z.array(texto(80)).max(4), href: href.nullable() }).strict())
        .min(1)
        .max(10)
    })
    .strict(),
  chart: z
    .object({
      titulo: texto(80),
      tipo: z.enum(["linea", "barras"]),
      unidad: texto(8),
      puntos: z.array(z.object({ x: texto(40), y: z.number().finite() }).strict()).min(2).max(400)
    })
    .strict(),
  cards: z
    .object({
      titulo: texto(80),
      items: z
        .array(z.object({ id: texto(120), titulo: texto(160), detalle: texto(160).nullable(), href: href.nullable() }).strict())
        .min(1)
        .max(4)
    })
    .strict(),
  timeline: z
    .object({
      titulo: texto(80),
      items: z
        .array(z.object({ id: texto(120), fecha: texto(40), titulo: texto(160), href: href.nullable() }).strict())
        .min(1)
        .max(8)
    })
    .strict(),
  irA: z
    .object({ destinos: z.array(z.object({ etiqueta: texto(40), href }).strict()).min(1).max(3) })
    .strict(),
  recomendaciones: z
    .object({
      items: z
        .array(z.object({ propuestaId: z.string().uuid(), titulo: texto(90), motivo: texto(160) }).strict())
        .min(1)
        .max(3)
    })
    .strict(),
  insight: z.object({ texto: texto(240) }).strict(),
  portfolio: z
    .object({
      total: texto(40),
      nota: texto(160),
      serie: z.array(z.object({ x: texto(40), y: z.number().finite() }).strict()).max(400)
    })
    .strict(),
  movimientos: z
    .object({
      configurado: z.boolean(),
      items: z
        .array(
          z
            .object({
              ticker: texto(12),
              nombre: texto(80),
              precio: texto(24).nullable(),
              variacion: texto(12).nullable(),
              tono: z.enum(["ok", "bad", "info"]).nullable(),
              nota: texto(80).nullable()
            })
            .strict()
        )
        .min(1)
        .max(8)
    })
    .strict(),
  watchlist: z
    .object({
      configurado: z.boolean(),
      items: z
        .array(
          z
            .object({
              ticker: texto(12),
              nombre: texto(80),
              precio: texto(24).nullable(),
              variacion: texto(12).nullable(),
              tono: z.enum(["ok", "bad", "info"]).nullable(),
              serie: z.array(z.number().finite()).max(400)
            })
            .strict()
        )
        .min(1)
        .max(20)
    })
    .strict()
```

- [ ] **Step 5: Fix the Phase 1 tests that the redefinition touches**

In `tests/domain/centro-runtime-catalogo.test.ts` change `24` to `30` in the first test (both `length` and `size`) and its title to «El catálogo trae los 30 tipos, sin repetidos».

In `tests/domain/centro-runtime-validador.test.ts`, the test «Un tipo sin componente todavía, con datos, es legal» uses `portfolio`, which now has a strict schema. Replace its pushed section with a kind that is still schemaless:

```ts
    con((s) => s.sections.push({ id: "p", kind: "journal", data: { entradas: [] } })),
```

- [ ] **Step 6: Run tests + typecheck**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-catalogo.test.ts tests/domain/centro-runtime-*.test.ts && pnpm typecheck`
Expected: all PASS; typecheck clean (if any file imports the deleted `Posicion`, it only existed in `secciones.ts`).

- [ ] **Step 7: Commit (controller)**

```bash
git add src/lib/domain/centro/runtime/secciones.ts src/lib/domain/centro/runtime/validador.ts tests/domain/centro-runtime-catalogo.test.ts tests/domain/centro-runtime-validador.test.ts tests/domain/centro-agente-catalogo.test.ts
git commit -m "$(printf 'centro-agente: el catálogo aprende los bloques del agente\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 2 (Codex): el contrato del turno

**Files:**
- Create: `src/lib/domain/centro/agente/contrato.ts`
- Test: `tests/domain/centro-agente-contrato.test.ts`

**Interfaces:**
- Consumes: `GeminiSchema` de `src/lib/domain/ai/tools.ts`; `TIPOS_DEL_CENTRO` de `src/lib/domain/coach/proposals.ts`.
- Produces: `KINDS_DEL_AGENTE`, `CAPACIDADES`, `Formato`, `BloqueGenerico` (unión `lista|metricas|tabla|grafica|tarjetas|linea`), `BloqueDelAgente` (genéricos + `ir_a` + `recomendaciones` + `insight` + `{ kind: "capacidad"; nombre: "mercado"|"hoy"; parametros: Record<string, unknown> }`), `RespuestaDelAgente { texto: string; bloques: BloqueDelAgente[]; descartados: string[] }`, `parsearRespuesta(raw: unknown): { ok: true; value: RespuestaDelAgente } | { ok: false; reason: string }`, `ESQUEMA_RESPUESTA: GeminiSchema`, `MAX_BLOQUES = 4`.

**Por qué `datos` es una cadena JSON:** el `responseSchema` de Gemini no admite uniones discriminadas (el mismo motivo por el que `coach_proposals` guarda `datos` como texto, ver `domain/coach/proposals.ts`). El modelo devuelve `{ kind, datos: "<JSON>" }` y la forma real se comprueba aquí, por kind.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-agente-contrato.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearRespuesta, ESQUEMA_RESPUESTA, MAX_BLOQUES } from "../../src/lib/domain/centro/agente/contrato.ts";

const F = "fila:habits:11111111-1111-4111-8111-111111111111";
const b = (kind: string, datos: unknown) => ({ kind, datos: typeof datos === "string" ? datos : JSON.stringify(datos) });

test("Un turno solo con texto es válido", () => {
  const r = parsearRespuesta({ texto: "Vas bien.", bloques: [] });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value, { texto: "Vas bien.", bloques: [], descartados: [] });
});

test("Sin texto no hay turno", () => {
  assert.strictEqual(parsearRespuesta({ texto: "  ", bloques: [] }).ok, false);
  assert.strictEqual(parsearRespuesta(null).ok, false);
  assert.strictEqual(parsearRespuesta({ bloques: [] }).ok, false);
});

test("Una lista anclada a filas se parsea", () => {
  const r = parsearRespuesta({
    texto: "Tus hábitos",
    bloques: [b("lista", { titulo: "Hábitos", items: [{ fila: F, titulo: "name", detalle: null, estado: null }] })]
  });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques[0], {
    kind: "lista",
    titulo: "Hábitos",
    items: [{ fila: F, titulo: "name", detalle: null, estado: null }]
  });
});

test("Un bloque roto se descarta con motivo y el resto sigue", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [b("lista", "{no es json"), b("insight", { texto: "Bien." }), b("volar", {})]
  });
  assert.ok(r.ok);
  assert.strictEqual(r.ok && r.value.bloques.length, 1);
  assert.strictEqual(r.ok && r.value.descartados.length, 2);
});

test("Una fila con forma rara no pasa: el ancla tiene que ser fila:<tabla>:<id>", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [b("lista", { titulo: "x", items: [{ fila: "habits/1", titulo: "name", detalle: null, estado: null }] })]
  });
  assert.strictEqual(r.ok && r.value.bloques.length, 0);
});

test("Un campo tiene que ser un nombre de columna, no una expresión", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [b("metricas", { titulo: null, items: [{ etiqueta: "x", fila: F, campo: "balance * 2", formato: "numero" }] })]
  });
  assert.strictEqual(r.ok && r.value.bloques.length, 0);
});

test("Como mucho cuatro bloques: el resto se descarta", () => {
  const cinco = Array.from({ length: 5 }, () => b("insight", { texto: "Bien." }));
  const r = parsearRespuesta({ texto: "x", bloques: cinco });
  assert.strictEqual(r.ok && r.value.bloques.length, MAX_BLOQUES);
  assert.strictEqual(r.ok && r.value.descartados.length, 1);
});

test("Capacidades: mercado y hoy pasan con sus parámetros crudos", () => {
  const r = parsearRespuesta({ texto: "x", bloques: [b("mercado", { vista: "watchlist" }), b("hoy", {})] });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques, [
    { kind: "capacidad", nombre: "mercado", parametros: { vista: "watchlist" } },
    { kind: "capacidad", nombre: "hoy", parametros: {} }
  ]);
});

test("Recomendaciones: solo tipos que el Centro sabe proponer", () => {
  const ok = parsearRespuesta({ texto: "x", bloques: [b("recomendaciones", { items: [{ tipo: "tarea", titulo: "Llamar", motivo: "Hoy", datos: "{}" }] })] });
  assert.strictEqual(ok.ok && ok.value.bloques.length, 1);
  const mal = parsearRespuesta({ texto: "x", bloques: [b("recomendaciones", { items: [{ tipo: "arista", titulo: "x", motivo: "y", datos: "{}" }] })] });
  assert.strictEqual(mal.ok && mal.value.bloques.length, 0);
});

test("El esquema de Gemini pide texto y bloques con kind cerrado y datos en texto", () => {
  assert.strictEqual(ESQUEMA_RESPUESTA.type, "OBJECT");
  assert.deepStrictEqual(ESQUEMA_RESPUESTA.required, ["texto", "bloques"]);
  const item = ESQUEMA_RESPUESTA.properties?.bloques?.items;
  assert.ok(item?.properties?.kind?.enum?.includes("lista"));
  assert.ok(item?.properties?.kind?.enum?.includes("mercado"));
  assert.strictEqual(item?.properties?.datos?.type, "STRING");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-contrato.test.ts`
Expected: FAIL `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `contrato.ts`**

```ts
// src/lib/domain/centro/agente/contrato.ts
// Lo que el agente de interfaz puede decir (D-194). Puro, probado en
// tests/domain/centro-agente-contrato.test.ts.
//
// EL AGENTE NO ESCRIBE VALORES, ESCRIBE REFERENCIAS. Un bloque genérico no dice
// «saldo: $4,000»: dice «la columna `balance` de `fila:debts:<uuid>`», y el
// servidor lee el valor de la fila que las herramientas le entregaron en ESTE
// turno. Es la misma idea que `factIds` en el chat, llevada a la interfaz: lo
// que no se leyó no se puede enseñar.
//
// POR QUÉ `datos` ES UNA CADENA JSON. El `responseSchema` de Gemini no admite
// uniones discriminadas; un esquema que fingiera que las once formas son la
// misma dejaría pasar cualquier cosa. Así que el modelo devuelve
// `{ kind, datos: "<JSON>" }` —como `coach_proposals`— y la forma real se
// comprueba aquí, kind por kind.
//
// UN BLOQUE MALO NO TUMBA EL TURNO. Se descarta con motivo (para el log) y el
// resto sigue. Sin texto, en cambio, no hay turno: el texto es lo único que
// siempre se enseña.

import { z } from "zod";
import type { GeminiSchema } from "../../ai/tools.ts";
import { TIPOS_DEL_CENTRO } from "../../coach/proposals.ts";

export const MAX_BLOQUES = 4;
const MAX_TEXTO = 600;

export const GENERICOS = ["lista", "metricas", "tabla", "grafica", "tarjetas", "linea"] as const;
export const CAPACIDADES = ["mercado", "hoy"] as const;
export const KINDS_DEL_AGENTE = [...GENERICOS, "ir_a", "recomendaciones", "insight", ...CAPACIDADES] as const;

export const FORMATOS = ["numero", "dinero", "porcentaje", "fecha", "texto"] as const;
export type Formato = (typeof FORMATOS)[number];

/** `fila:<tabla>:<id>`: el id que `consultar` pone a cada fila (`idDeFila`). */
const fila = z.string().regex(/^fila:[a-z_]+:[A-Za-z0-9-]+$/);
/** Un nombre de columna y nada más: ni puntos, ni espacios, ni expresiones. */
const campo = z.string().regex(/^[a-z][a-z0-9_]{0,62}$/);
const etiqueta = z.string().trim().min(1).max(60);
const titulo = z.string().trim().min(1).max(80);
const formato = z.enum(FORMATOS);

const ESQUEMAS_GENERICOS = {
  lista: z
    .object({
      titulo,
      items: z.array(z.object({ fila, titulo: campo, detalle: campo.nullable(), estado: campo.nullable() }).strict()).min(1).max(8)
    })
    .strict(),
  metricas: z
    .object({
      titulo: titulo.nullable(),
      items: z.array(z.object({ etiqueta, fila, campo, formato }).strict()).min(1).max(4)
    })
    .strict(),
  tabla: z
    .object({
      titulo,
      columnas: z.array(z.object({ etiqueta, campo, formato }).strict()).min(1).max(4),
      filas: z.array(fila).min(1).max(10)
    })
    .strict(),
  grafica: z
    .object({
      titulo,
      tipo: z.enum(["linea", "barras"]),
      campoX: campo,
      campoY: campo,
      formato,
      filas: z.array(fila).min(2).max(31)
    })
    .strict(),
  tarjetas: z
    .object({
      titulo,
      items: z.array(z.object({ fila, titulo: campo, detalle: campo.nullable() }).strict()).min(1).max(4)
    })
    .strict(),
  linea: z
    .object({
      titulo,
      items: z.array(z.object({ fila, fecha: campo, titulo: campo }).strict()).min(1).max(8)
    })
    .strict()
} as const;

const ESQUEMA_IR_A = z
  .object({ destinos: z.array(z.object({ etiqueta: z.string().trim().min(1).max(40), href: z.string().max(300) }).strict()).min(1).max(3) })
  .strict();

const ESQUEMA_RECOMENDACIONES = z
  .object({
    items: z
      .array(
        z
          .object({
            tipo: z.enum(TIPOS_DEL_CENTRO as unknown as [string, ...string[]]),
            titulo: z.string().trim().min(1).max(90),
            motivo: z.string().trim().min(1).max(160),
            /** JSON en texto, como `PropuestaCruda.datos`: lo sanea `sanearPropuesta`. */
            datos: z.string().max(2000)
          })
          .strict()
      )
      .min(1)
      .max(3)
  })
  .strict();

const ESQUEMA_INSIGHT = z.object({ texto: z.string().trim().min(1).max(240) }).strict();

type Genericos = typeof ESQUEMAS_GENERICOS;
export type BloqueGenerico = { [K in keyof Genericos]: { kind: K } & z.infer<Genericos[K]> }[keyof Genericos];

export type BloqueDelAgente =
  | BloqueGenerico
  | ({ kind: "ir_a" } & z.infer<typeof ESQUEMA_IR_A>)
  | ({ kind: "recomendaciones" } & z.infer<typeof ESQUEMA_RECOMENDACIONES>)
  | ({ kind: "insight" } & z.infer<typeof ESQUEMA_INSIGHT>)
  | { kind: "capacidad"; nombre: (typeof CAPACIDADES)[number]; parametros: Record<string, unknown> };

export interface RespuestaDelAgente {
  texto: string;
  bloques: BloqueDelAgente[];
  /** Por qué se cayó cada bloque descartado. Va al log, nunca a la persona. */
  descartados: string[];
}

function leerJson(datos: unknown): Record<string, unknown> | null {
  if (typeof datos !== "string") return null;
  try {
    const v: unknown = JSON.parse(datos.trim() || "{}");
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function parsearBloque(crudo: unknown): { ok: true; bloque: BloqueDelAgente } | { ok: false; reason: string } {
  const c = (crudo ?? {}) as { kind?: unknown; datos?: unknown };
  const kind = typeof c.kind === "string" ? c.kind : "";
  const datos = leerJson(c.datos);
  if (!datos) return { ok: false, reason: `«${kind || "?"}»: datos no es un objeto JSON.` };

  if ((CAPACIDADES as readonly string[]).includes(kind)) {
    return { ok: true, bloque: { kind: "capacidad", nombre: kind as (typeof CAPACIDADES)[number], parametros: datos } };
  }

  const esquema =
    kind in ESQUEMAS_GENERICOS
      ? ESQUEMAS_GENERICOS[kind as keyof Genericos]
      : kind === "ir_a"
        ? ESQUEMA_IR_A
        : kind === "recomendaciones"
          ? ESQUEMA_RECOMENDACIONES
          : kind === "insight"
            ? ESQUEMA_INSIGHT
            : null;
  if (!esquema) return { ok: false, reason: `«${kind || "?"}» no es un bloque del catálogo.` };

  const r = esquema.safeParse(datos);
  if (!r.success) {
    const i = r.error.issues[0];
    return { ok: false, reason: `«${kind}»: ${i?.path.join(".") || "datos"} ${i?.message ?? "inválido"}.` };
  }
  return { ok: true, bloque: { kind, ...r.data } as BloqueDelAgente };
}

export function parsearRespuesta(raw: unknown): { ok: true; value: RespuestaDelAgente } | { ok: false; reason: string } {
  const r = raw as { texto?: unknown; bloques?: unknown } | null;
  const texto = typeof r?.texto === "string" ? r.texto.trim().slice(0, MAX_TEXTO) : "";
  if (!texto) return { ok: false, reason: "La respuesta no trae texto." };

  const crudos = Array.isArray(r?.bloques) ? r.bloques : [];
  const bloques: BloqueDelAgente[] = [];
  const descartados: string[] = [];
  for (const c of crudos) {
    if (bloques.length >= MAX_BLOQUES) {
      descartados.push(`Más de ${MAX_BLOQUES} bloques: se ignora el resto.`);
      break;
    }
    const p = parsearBloque(c);
    if (p.ok) bloques.push(p.bloque);
    else descartados.push(p.reason);
  }
  return { ok: true, value: { texto, bloques, descartados } };
}

export const ESQUEMA_RESPUESTA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    texto: { type: "STRING", description: "Una a tres frases para la persona." },
    bloques: {
      type: "ARRAY",
      description: `Como mucho ${MAX_BLOQUES}. Vacío si basta con el texto.`,
      items: {
        type: "OBJECT",
        properties: {
          kind: { type: "STRING", format: "enum", enum: [...KINDS_DEL_AGENTE] },
          datos: { type: "STRING", description: "Objeto JSON con la forma del kind, en texto." }
        },
        required: ["kind", "datos"],
        propertyOrdering: ["kind", "datos"]
      }
    }
  },
  required: ["texto", "bloques"],
  propertyOrdering: ["texto", "bloques"]
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-contrato.test.ts && pnpm typecheck`
Expected: 10 PASS; typecheck clean.

- [ ] **Step 5: Commit (controller)**

```bash
git add src/lib/domain/centro/agente/contrato.ts tests/domain/centro-agente-contrato.test.ts
git commit -m "$(printf 'centro-agente: el contrato del turno\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 3 (Codex): resolver referencias, enlaces, formato y el filtro de cifras

**Files:**
- Create: `src/lib/domain/centro/agente/resolver.ts`
- Create: `src/lib/domain/centro/agente/texto.ts`
- Test: `tests/domain/centro-agente-resolver.test.ts`

**Interfaces:**
- Consumes: `BloqueGenerico`, `Formato` (Task 2); `AnySection` (`runtime/types.ts`); `destinoValido` (`../sugerencias.ts`); `money`, `fdate` (`../../../format.ts`).
- Produces:
  - `texto.ts`: `tieneCifras(t: string): boolean`.
  - `resolver.ts`: `type Filas = ReadonlyMap<string, Record<string, unknown>>`; `interface ContextoDeResolucion { filas: Filas; moneda: string; locale: string }`; `proyectosVistos(filas): { id: string }[]`; `rutaDeFila(fila: string, registro: Record<string, unknown>, proyectos): string | null`; `formatear(valor: unknown, formato: Formato, moneda: string, locale: string): string | null`; `resolverBloque(b: BloqueGenerico, id: string, ctx): AnySection | null`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-agente-resolver.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolverBloque, rutaDeFila, formatear, proyectosVistos } from "../../src/lib/domain/centro/agente/resolver.ts";
import { tieneCifras } from "../../src/lib/domain/centro/agente/texto.ts";

const P = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const D = "33333333-3333-4333-8333-333333333333";
const N = "44444444-4444-4444-8444-444444444444";

const filas = new Map<string, Record<string, unknown>>([
  [`fila:projects:${P}`, { id: P, name: "Malpaso", status: "active" }],
  [`fila:tasks:${T}`, { id: T, title: "Revisar U3", project_id: P, due_date: "2026-09-26", status: "working" }],
  [`fila:debts:${D}`, { id: D, name: "Tarjeta", balance: 4000 }],
  [`fila:notes:${N}`, { id: N, title: "Idea" }]
]);
const ctx = { filas, moneda: "MXN", locale: "es-MX" };

test("Los proyectos vistos salen de las filas de proyectos y de las tareas", () => {
  assert.deepStrictEqual(proyectosVistos(filas), [{ id: P }]);
});

test("Cada tabla va a su sección; lo que no está en el menú, sin enlace", () => {
  const pv = proyectosVistos(filas);
  assert.strictEqual(rutaDeFila(`fila:tasks:${T}`, filas.get(`fila:tasks:${T}`)!, pv), `/execution?project=${P}`);
  assert.strictEqual(rutaDeFila(`fila:projects:${P}`, filas.get(`fila:projects:${P}`)!, pv), `/execution?project=${P}`);
  assert.strictEqual(rutaDeFila(`fila:debts:${D}`, {}, pv), "/debt");
  assert.strictEqual(rutaDeFila(`fila:habits:x`, {}, pv), "/development/routines");
  assert.strictEqual(rutaDeFila(`fila:notes:${N}`, {}, pv), null);
  assert.strictEqual(rutaDeFila(`fila:tablainventada:x`, {}, pv), null);
});

test("Una tarea de un proyecto que no se vio va a /execution a secas", () => {
  assert.strictEqual(rutaDeFila(`fila:tasks:x`, { project_id: "99999999-9999-4999-8999-999999999999" }, [{ id: P }]), "/execution");
});

test("Formatos", () => {
  assert.strictEqual(formatear(4000, "dinero", "MXN", "es-MX"), "$4,000.00");
  assert.strictEqual(formatear(12.345, "porcentaje", "MXN", "es-MX"), "12.3%");
  assert.strictEqual(formatear("2026-09-26", "fecha", "MXN", "es-MX"), "26 sep 2026");
  assert.strictEqual(formatear(1234.5, "numero", "MXN", "es-MX"), "1,234.5");
  assert.strictEqual(formatear(null, "numero", "MXN", "es-MX"), null);
  assert.strictEqual(formatear("abc", "dinero", "MXN", "es-MX"), null);
  assert.strictEqual(formatear("  hola  ", "texto", "MXN", "es-MX"), "hola");
});

test("Una lista se resuelve contra las filas leídas", () => {
  const s = resolverBloque(
    { kind: "lista", titulo: "Pendiente", items: [{ fila: `fila:tasks:${T}`, titulo: "title", detalle: "due_date", estado: "status" }] },
    "b0",
    ctx
  );
  assert.deepStrictEqual(s, {
    id: "b0",
    kind: "lista",
    data: { titulo: "Pendiente", items: [{ id: T, titulo: "Revisar U3", detalle: "26 sep 2026", estado: "working", href: `/execution?project=${P}` }] }
  });
});

test("Una fila que no se leyó no sale (y si no queda nada, el bloque tampoco)", () => {
  const s = resolverBloque(
    { kind: "lista", titulo: "x", items: [{ fila: "fila:debts:99999999-9999-4999-8999-999999999999", titulo: "name", detalle: null, estado: null }] },
    "b0",
    ctx
  );
  assert.strictEqual(s, null);
});

test("Un campo que la fila no tiene invalida ese ítem", () => {
  const s = resolverBloque(
    {
      kind: "lista",
      titulo: "x",
      items: [
        { fila: `fila:debts:${D}`, titulo: "nombre_que_no_existe", detalle: null, estado: null },
        { fila: `fila:debts:${D}`, titulo: "name", detalle: null, estado: null }
      ]
    },
    "b0",
    ctx
  );
  assert.strictEqual(s?.kind === "lista" ? s.data.items.length : -1, 1);
});

test("Métricas: el valor sale de la fila y con formato", () => {
  const s = resolverBloque(
    { kind: "metricas", titulo: null, items: [{ etiqueta: "Deuda", fila: `fila:debts:${D}`, campo: "balance", formato: "dinero" }] },
    "b1",
    ctx
  );
  assert.deepStrictEqual(s?.data, { titulo: null, items: [{ etiqueta: "Deuda", valor: "$4,000.00" }] });
});

test("Tabla: columnas por campo, filas por referencia", () => {
  const s = resolverBloque(
    {
      kind: "tabla",
      titulo: "Deudas",
      columnas: [{ etiqueta: "Nombre", campo: "name", formato: "texto" }, { etiqueta: "Saldo", campo: "balance", formato: "dinero" }],
      filas: [`fila:debts:${D}`]
    },
    "b2",
    ctx
  );
  assert.deepStrictEqual(s, {
    id: "b2",
    kind: "table",
    data: { titulo: "Deudas", columnas: ["Nombre", "Saldo"], filas: [{ id: D, celdas: ["Tarjeta", "$4,000.00"], href: "/debt" }] }
  });
});

test("Gráfica: todas de la misma tabla, y al menos dos puntos numéricos", () => {
  const m = new Map<string, Record<string, unknown>>([
    ["fila:net_worth_snapshots:a", { id: "a", as_of: "2026-09-01", net: 100 }],
    ["fila:net_worth_snapshots:b", { id: "b", as_of: "2026-09-02", net: 110 }]
  ]);
  const b = { kind: "grafica" as const, titulo: "Patrimonio", tipo: "linea" as const, campoX: "as_of", campoY: "net", formato: "dinero" as const, filas: ["fila:net_worth_snapshots:a", "fila:net_worth_snapshots:b"] };
  const s = resolverBloque(b, "g", { filas: m, moneda: "MXN", locale: "es-MX" });
  assert.deepStrictEqual(s?.data, { titulo: "Patrimonio", tipo: "linea", unidad: "MXN", puntos: [{ x: "2026-09-01", y: 100 }, { x: "2026-09-02", y: 110 }] });
  const mezclada = resolverBloque({ ...b, filas: ["fila:net_worth_snapshots:a", `fila:debts:${D}`] }, "g", { ...ctx, filas: new Map([...m, ...filas]) });
  assert.strictEqual(mezclada, null);
});

test("Cifras en texto libre", () => {
  assert.strictEqual(tieneCifras("Te ahorras $3,000 al mes"), true);
  assert.strictEqual(tieneCifras("Subió 4.3%"), true);
  assert.strictEqual(tieneCifras("Son 200 pesos"), true);
  assert.strictEqual(tieneCifras("Tienes 3 tareas vencidas"), false);
  assert.strictEqual(tieneCifras("NVDA y AVGO siguen fuertes"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-resolver.test.ts`
Expected: FAIL `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `texto.ts`**

```ts
// src/lib/domain/centro/agente/texto.ts
// El texto libre de un bloque no lleva cifras (D-194). Puro.
//
// El `texto` del turno puede citar cifras —el prompt le exige citar solo lo que
// leyó—, pero lo que va DENTRO de un bloque se lee como dato de la interfaz, y
// ahí una cifra escrita por el modelo se confunde con una calculada. Un conteo
// suelto («3 tareas») no es una cifra de dinero ni un porcentaje: pasa.

const CIFRA_CON_UNIDAD = /[$€£]\s*\d|\d[\d.,]*\s*(%|por ?ciento|mxn|usd|eur|pesos|d[oó]lares|euros)\b/i;

export function tieneCifras(t: string): boolean {
  return CIFRA_CON_UNIDAD.test(t);
}
```

- [ ] **Step 4: Write `resolver.ts`**

```ts
// src/lib/domain/centro/agente/resolver.ts
// De una referencia a un valor (D-194). Puro, probado en
// tests/domain/centro-agente-resolver.test.ts.
//
// LO QUE NO SE LEYÓ NO SE ENSEÑA. Cada `fila:<tabla>:<uuid>` se busca en las
// filas que las herramientas entregaron en ESTE turno (bajo la RLS de la
// persona). Una fila inventada, o un campo que la fila no tiene, invalida ESE
// ítem —no el bloque, no el turno—; un bloque que se queda sin ítems no sale.
//
// EL ENLACE LO PONE EL SERVIDOR, NO EL MODELO. Se deriva de la tabla de la fila
// y pasa por `destinoValido`: una tabla sin sección en el menú (notas,
// comentarios) sale sin enlace, nunca con uno a una pantalla oculta.

import { destinoValido } from "../sugerencias.ts";
import { fdate, money } from "../../../format.ts";
import type { AnySection } from "../runtime/types.ts";
import type { BloqueGenerico, Formato } from "./contrato.ts";

export type Filas = ReadonlyMap<string, Record<string, unknown>>;

export interface ContextoDeResolucion {
  filas: Filas;
  moneda: string;
  locale: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tabla → sección. Lo que no está aquí no tiene enlace. */
const SECCION_DE_TABLA: Record<string, string> = {
  tasks: "/execution",
  task_groups: "/execution",
  task_history: "/execution",
  daily_plans: "/planning",
  weekly_reviews: "/planning",
  occupations: "/time",
  reminders: "/time",
  habits: "/development/routines",
  habit_logs: "/development/routines",
  routines: "/development/routines",
  routine_runs: "/development/routines",
  identity_profiles: "/development",
  identity_traits: "/development",
  habit_identity_traits: "/development",
  identity_scores: "/development",
  daily_reflections: "/development",
  personal_goals: "/development/goals",
  key_results: "/development/goals",
  books: "/development/library",
  book_notes: "/development/library",
  book_progress: "/development/library",
  reading_plan_weeks: "/development/library",
  nutrition_profiles: "/development/nutrition",
  food_entries: "/development/nutrition",
  body_measurements: "/development/nutrition",
  budgets: "/money/budget",
  budget_carryovers: "/money/budget",
  categories: "/money/budget",
  accounts: "/money",
  savings_goals: "/savings",
  financial_goals: "/goals",
  investments: "/investments",
  assets: "/wealth",
  liabilities: "/wealth",
  net_worth_snapshots: "/wealth",
  debts: "/debt",
  cashback_cards: "/cashback",
  cashback_redemptions: "/cashback",
  family_members: "/household"
};

function partes(fila: string): { tabla: string; id: string } {
  const [, tabla = "", id = ""] = fila.split(":");
  return { tabla, id };
}

/** Los proyectos que la persona puede enlazar: los que se leyeron, y los de sus tareas leídas. */
export function proyectosVistos(filas: Filas): { id: string }[] {
  const ids = new Set<string>();
  for (const [fila, r] of filas) {
    const { tabla, id } = partes(fila);
    if (tabla === "projects" && UUID.test(id)) ids.add(id);
    if (tabla === "tasks" && typeof r.project_id === "string" && UUID.test(r.project_id)) ids.add(r.project_id);
  }
  return [...ids].map((id) => ({ id }));
}

export function rutaDeFila(fila: string, registro: Record<string, unknown>, proyectos: { id: string }[]): string | null {
  const { tabla, id } = partes(fila);
  let href: string | null = null;
  if (tabla === "projects") href = `/execution?project=${id}`;
  else if (tabla === "tasks" && typeof registro.project_id === "string" && proyectos.some((p) => p.id === registro.project_id)) {
    href = `/execution?project=${registro.project_id}`;
  } else href = SECCION_DE_TABLA[tabla] ?? null;
  return href && destinoValido(href, proyectos) ? href : null;
}

export function formatear(valor: unknown, formato: Formato, moneda: string, locale: string): string | null {
  if (valor === null || valor === undefined) return null;
  if (formato === "texto") {
    const t = String(valor).trim().replace(/\s+/g, " ");
    return t ? t.slice(0, 160) : null;
  }
  if (formato === "fecha") {
    if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(valor)) return null;
    return fdate(valor.slice(0, 10), locale);
  }
  const n = typeof valor === "number" ? valor : typeof valor === "string" && valor.trim() !== "" ? Number(valor) : NaN;
  if (!Number.isFinite(n)) return null;
  if (formato === "dinero") return money(n, moneda, locale);
  if (formato === "porcentaje") return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
}

/** Un campo de una fila, como texto para pintar. Las fechas ISO se leen como fechas. */
function textoDe(r: Record<string, unknown>, campo: string, ctx: ContextoDeResolucion): string | null {
  if (!(campo in r)) return null;
  const v = r[campo];
  const esFecha = typeof v === "string" && /^\d{4}-\d{2}-\d{2}(T|$)/.test(v);
  return formatear(v, esFecha ? "fecha" : "texto", ctx.moneda, ctx.locale);
}

export function resolverBloque(b: BloqueGenerico, id: string, ctx: ContextoDeResolucion): AnySection | null {
  const pv = proyectosVistos(ctx.filas);
  const leer = (fila: string) => ctx.filas.get(fila) ?? null;
  const idDe = (fila: string) => partes(fila).id;

  switch (b.kind) {
    case "lista": {
      const items = b.items.flatMap((it) => {
        const r = leer(it.fila);
        const titulo = r ? textoDe(r, it.titulo, ctx) : null;
        if (!r || !titulo) return [];
        return [{
          id: idDe(it.fila),
          titulo,
          detalle: it.detalle ? textoDe(r, it.detalle, ctx) : null,
          estado: it.estado ? textoDe(r, it.estado, ctx) : null,
          href: rutaDeFila(it.fila, r, pv)
        }];
      });
      return items.length ? { id, kind: "lista", data: { titulo: b.titulo, items } } : null;
    }
    case "metricas": {
      const items = b.items.flatMap((it) => {
        const r = leer(it.fila);
        const valor = r && it.campo in r ? formatear(r[it.campo], it.formato, ctx.moneda, ctx.locale) : null;
        return valor ? [{ etiqueta: it.etiqueta, valor }] : [];
      });
      return items.length ? { id, kind: "metricas", data: { titulo: b.titulo, items } } : null;
    }
    case "tabla": {
      const filas = b.filas.flatMap((fila) => {
        const r = leer(fila);
        if (!r) return [];
        const celdas = b.columnas.map((c) => (c.campo in r ? formatear(r[c.campo], c.formato, ctx.moneda, ctx.locale) : null) ?? "—");
        if (celdas.every((c) => c === "—")) return [];
        return [{ id: idDe(fila), celdas, href: rutaDeFila(fila, r, pv) }];
      });
      return filas.length
        ? { id, kind: "table", data: { titulo: b.titulo, columnas: b.columnas.map((c) => c.etiqueta), filas } }
        : null;
    }
    case "grafica": {
      const tablas = new Set(b.filas.map((f) => partes(f).tabla));
      if (tablas.size !== 1) return null;
      const puntos = b.filas.flatMap((fila) => {
        const r = leer(fila);
        const x = r?.[b.campoX];
        const y = typeof r?.[b.campoY] === "number" ? (r[b.campoY] as number) : Number(r?.[b.campoY]);
        return r && x !== undefined && x !== null && Number.isFinite(y) ? [{ x: String(x).slice(0, 40), y }] : [];
      });
      if (puntos.length < 2) return null;
      const unidad = b.formato === "dinero" ? ctx.moneda : b.formato === "porcentaje" ? "%" : "";
      return { id, kind: "chart", data: { titulo: b.titulo, tipo: b.tipo, unidad, puntos } };
    }
    case "tarjetas": {
      const items = b.items.flatMap((it) => {
        const r = leer(it.fila);
        const titulo = r ? textoDe(r, it.titulo, ctx) : null;
        if (!r || !titulo) return [];
        return [{ id: idDe(it.fila), titulo, detalle: it.detalle ? textoDe(r, it.detalle, ctx) : null, href: rutaDeFila(it.fila, r, pv) }];
      });
      return items.length ? { id, kind: "cards", data: { titulo: b.titulo, items } } : null;
    }
    case "linea": {
      const items = b.items.flatMap((it) => {
        const r = leer(it.fila);
        const fecha = r && it.fecha in r ? formatear(r[it.fecha], "fecha", ctx.moneda, ctx.locale) : null;
        const titulo = r ? textoDe(r, it.titulo, ctx) : null;
        if (!r || !fecha || !titulo) return [];
        return [{ id: idDe(it.fila), fecha, titulo, href: rutaDeFila(it.fila, r, pv) }];
      });
      return items.length ? { id, kind: "timeline", data: { titulo: b.titulo, items } } : null;
    }
  }
}
```

If `fdate("2026-09-26")` does not produce `"26 sep 2026"` in node's ICU, fix the EXPECTATION in the test to whatever `fdate` returns for that date in `es-MX` (run `node -e` with `fdate`), not `fdate` itself — the format is the app's existing one.

- [ ] **Step 5: Run tests + typecheck**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-resolver.test.ts && pnpm typecheck`
Expected: 11 PASS; typecheck clean.

- [ ] **Step 6: Commit (controller)**

```bash
git add src/lib/domain/centro/agente/resolver.ts src/lib/domain/centro/agente/texto.ts tests/domain/centro-agente-resolver.test.ts
git commit -m "$(printf 'centro-agente: referencias a filas, enlaces por tabla y el filtro de cifras\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 4 (Codex): mercado puro y el hilo

**Files:**
- Create: `src/lib/domain/centro/agente/mercado.ts`
- Create: `src/lib/domain/centro/agente/hilo.ts`
- Test: `tests/domain/centro-agente-mercado.test.ts`
- Test: `tests/domain/centro-agente-hilo.test.ts`

**Interfaces:**
- Consumes: `addDaysISO` (`../../datetime.ts`); `normalizarTicker`, `variacion` (`../../money/watchlist.ts`); `money`, `fdate` (`../../../format.ts`); `tieneCifras` (Task 3); `AnySection` (`runtime/types.ts`).
- Produces:
  - `mercado.ts`: `RANGOS`, `Rango`, `VISTAS`, `ParametrosMercado`, `leerParametrosMercado(raw: unknown): ParametrosMercado`, `rutaDeSerie(ticker: string, rango: Rango, hoyISO: string): string`, `interface CotizacionPura { ticker; nombre; precio: number|null; pct: number|null }`, `interface InversionPura { valuation: number|null; currency: string; as_of: string|null }`, `SIN_FUENTE = "Falta conectar la fuente de mercado."`, `seccionesDeMercado(e: EntradaMercado): AnySection[]`.
  - `hilo.ts`: `interface Turno { id: string; rol: "persona"|"agente"; texto: string; secciones: AnySection[] }`, `agregar(hilo: Turno[], t: Turno): Turno[]`, `historialParaModelo(hilo: Turno[]): { rol: "persona"|"agente"; texto: string }[]` (últimos 12, solo texto), `MAX_HISTORIAL = 12`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/centro-agente-mercado.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { leerParametrosMercado, rutaDeSerie, seccionesDeMercado, SIN_FUENTE } from "../../src/lib/domain/centro/agente/mercado.ts";

test("Parámetros: por defecto watchlist en una semana; tickers normalizados y sin repetir", () => {
  assert.deepStrictEqual(leerParametrosMercado({}), { vista: "watchlist", tickers: [], rango: "1S", notas: {} });
  const p = leerParametrosMercado({ vista: "movimientos", tickers: ["nvda", " NVDA ", "no válido!", "avgo"], rango: "1M", notas: { NVDA: "Fuerte." } });
  assert.deepStrictEqual(p, { vista: "movimientos", tickers: ["NVDA", "AVGO"], rango: "1M", notas: { NVDA: "Fuerte." } });
  assert.strictEqual(leerParametrosMercado({ vista: "volar", rango: "5Y" }).vista, "watchlist");
});

test("Las notas con cifras se tiran", () => {
  const p = leerParametrosMercado({ notas: { NVDA: "Subió 4%", AVGO: "Buen momento." } });
  assert.deepStrictEqual(p.notas, { AVGO: "Buen momento." });
});

test("Rutas de serie por rango", () => {
  assert.strictEqual(rutaDeSerie("NVDA", "1D", "2026-09-24"), "/v2/aggs/ticker/NVDA/range/5/minute/2026-09-23/2026-09-24?adjusted=true&sort=asc&limit=5000");
  assert.strictEqual(rutaDeSerie("NVDA", "1S", "2026-09-24"), "/v2/aggs/ticker/NVDA/range/1/hour/2026-09-17/2026-09-24?adjusted=true&sort=asc&limit=5000");
  assert.strictEqual(rutaDeSerie("NVDA", "1M", "2026-09-24"), "/v2/aggs/ticker/NVDA/range/1/day/2026-08-24/2026-09-24?adjusted=true&sort=asc&limit=5000");
  assert.strictEqual(rutaDeSerie("NVDA", "1A", "2026-09-24"), "/v2/aggs/ticker/NVDA/range/1/week/2025-09-23/2026-09-24?adjusted=true&sort=asc&limit=5000");
});

const base = {
  moneda: "MXN",
  locale: "es-MX",
  configurado: true,
  cotizaciones: [
    { ticker: "NVDA", nombre: "NVIDIA", precio: 118.24, pct: 4.32 },
    { ticker: "AVGO", nombre: "Broadcom", precio: 1142.67, pct: 2.18 },
    { ticker: "TSM", nombre: "Taiwan Semi", precio: 214.76, pct: -1.76 }
  ],
  series: { NVDA: [1, 2, 3], AVGO: [3, 2, 4] } as Record<string, number[]>,
  inversiones: [
    { valuation: 10000, currency: "MXN", as_of: "2026-09-12" },
    { valuation: 5000, currency: "MXN", as_of: "2026-09-10" },
    { valuation: 300, currency: "USD", as_of: "2026-09-01" }
  ],
  historia: [{ x: "2026-09-01", y: 14000 }, { x: "2026-09-15", y: 15000 }, { x: "2026-09-20", y: 15200 }]
};

test("Watchlist con cotizaciones y sparkline", () => {
  const [s] = seccionesDeMercado({ ...base, parametros: leerParametrosMercado({ vista: "watchlist" }) });
  assert.strictEqual(s?.kind, "watchlist");
  assert.ok(s?.kind === "watchlist");
  assert.deepStrictEqual(s.data.items[0], { ticker: "NVDA", nombre: "NVIDIA", precio: "USD 118.24", variacion: "+4.32%", tono: "ok", serie: [1, 2, 3] });
  assert.deepStrictEqual(s.data.items[2]?.serie, []);
});

test("Movimientos: los N mayores en valor absoluto, con su nota", () => {
  const [s] = seccionesDeMercado({ ...base, parametros: leerParametrosMercado({ vista: "movimientos", notas: { NVDA: "Sigue fuerte." } }) });
  assert.ok(s?.kind === "movimientos");
  assert.deepStrictEqual(s.data.items.map((i) => i.ticker), ["NVDA", "AVGO", "TSM"]);
  assert.strictEqual(s.data.items[0]?.nota, "Sigue fuerte.");
  assert.strictEqual(s.data.items[2]?.tono, "bad");
});

test("Portafolio: suma en la moneda del perfil y avisa de lo que no suma", () => {
  const [s] = seccionesDeMercado({ ...base, parametros: leerParametrosMercado({ vista: "portafolio" }) });
  assert.ok(s?.kind === "portfolio");
  assert.strictEqual(s.data.total, "$15,000.00");
  assert.match(s.data.nota, /12 sep 2026/);
  assert.match(s.data.nota, /1 inversión en otra moneda no suma/);
  assert.strictEqual(s.data.serie.length, 3);
});

test("Portafolio con menos de tres puntos de historia: sin gráfica", () => {
  const [s] = seccionesDeMercado({ ...base, historia: [{ x: "a", y: 1 }], parametros: leerParametrosMercado({ vista: "portafolio" }) });
  assert.ok(s?.kind === "portfolio");
  assert.deepStrictEqual(s.data.serie, []);
});

test("Sin llave: tickers sí, cifras no, y lo dice", () => {
  const [s] = seccionesDeMercado({
    ...base,
    configurado: false,
    cotizaciones: base.cotizaciones.map((c) => ({ ...c, precio: null, pct: null })),
    series: {},
    parametros: leerParametrosMercado({ vista: "watchlist" })
  });
  assert.ok(s?.kind === "watchlist");
  assert.strictEqual(s.data.configurado, false);
  assert.ok(s.data.items.every((i) => i.precio === null && i.variacion === null));
});

test("Gráfica de un ticker: un solo ticker con su serie; sin serie, mensaje", () => {
  const conSerie = seccionesDeMercado({ ...base, parametros: leerParametrosMercado({ vista: "grafica", tickers: ["NVDA"] }) });
  assert.strictEqual(conSerie[0]?.kind, "chart");
  const sin = seccionesDeMercado({ ...base, series: {}, parametros: leerParametrosMercado({ vista: "grafica", tickers: ["NVDA"] }) });
  assert.deepStrictEqual(sin[0], { id: "mercado-grafica", kind: "emptyState", title: "NVDA", data: { mensaje: SIN_FUENTE } });
});

test("Sin tickers en la watchlist: dice qué hacer", () => {
  const [s] = seccionesDeMercado({ ...base, cotizaciones: [], parametros: leerParametrosMercado({ vista: "watchlist" }) });
  assert.strictEqual(s?.kind, "emptyState");
});
```

```ts
// tests/domain/centro-agente-hilo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { agregar, historialParaModelo, MAX_HISTORIAL, type Turno } from "../../src/lib/domain/centro/agente/hilo.ts";

const t = (i: number, rol: Turno["rol"]): Turno => ({ id: `t${i}`, rol, texto: `m${i}`, secciones: [] });

test("Agregar no muta el hilo anterior", () => {
  const a: Turno[] = [];
  const b = agregar(a, t(1, "persona"));
  assert.strictEqual(a.length, 0);
  assert.strictEqual(b.length, 1);
});

test("Al modelo solo viaja el texto de los últimos turnos", () => {
  let h: Turno[] = [];
  for (let i = 0; i < 20; i++) h = agregar(h, { ...t(i, i % 2 ? "agente" : "persona"), secciones: [{ id: "x", kind: "insight", data: { texto: "x" } }] });
  const hist = historialParaModelo(h);
  assert.strictEqual(hist.length, MAX_HISTORIAL);
  assert.deepStrictEqual(hist[hist.length - 1], { rol: "agente", texto: "m19" });
  assert.ok(hist.every((m) => Object.keys(m).join() === "rol,texto"));
});

test("El turno de «Hoy» (sin texto) no viaja", () => {
  const h = agregar([], { id: "hoy", rol: "agente", texto: "", secciones: [] });
  assert.deepStrictEqual(historialParaModelo(h), []);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-mercado.test.ts tests/domain/centro-agente-hilo.test.ts`
Expected: FAIL `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `hilo.ts`**

```ts
// src/lib/domain/centro/agente/hilo.ts
// El hilo de la conversación del Centro (D-194). Puro.
//
// Vive en el cliente y no se guarda (decisión del usuario: mismo cerebro que el
// chat, hilo propio). Al modelo solo le viaja el TEXTO de los últimos turnos:
// los bloques ya se pintaron y reenviarlos llenaría el prompt con datos que el
// modelo puede volver a leer si los necesita.

import type { AnySection } from "../runtime/types.ts";

export const MAX_HISTORIAL = 12;

export interface Turno {
  id: string;
  rol: "persona" | "agente";
  texto: string;
  secciones: AnySection[];
}

export function agregar(hilo: readonly Turno[], turno: Turno): Turno[] {
  return [...hilo, turno];
}

export function historialParaModelo(hilo: readonly Turno[]): { rol: "persona" | "agente"; texto: string }[] {
  return hilo
    .filter((t) => t.texto.trim() !== "")
    .slice(-MAX_HISTORIAL)
    .map((t) => ({ rol: t.rol, texto: t.texto }));
}
```

- [ ] **Step 4: Write `mercado.ts`**

```ts
// src/lib/domain/centro/agente/mercado.ts
// La capacidad «mercado», sin red (D-195). Puro, probado en
// tests/domain/centro-agente-mercado.test.ts.
//
// NUNCA UNA CIFRA INVENTADA. Sin llave de mercado, las filas salen con el
// ticker y sin precio, y el componente dice que falta la fuente. El portafolio
// es la suma de TUS valuaciones registradas —no se valora en vivo: `investments`
// no guarda ticker ni cantidad— y dice de cuándo es.

import { addDaysISO } from "../../datetime.ts";
import { normalizarTicker, variacion } from "../../money/watchlist.ts";
import { fdate, money } from "../../../format.ts";
import type { AnySection } from "../runtime/types.ts";
import { tieneCifras } from "./texto.ts";

export const RANGOS = ["1D", "1S", "1M", "1A"] as const;
export type Rango = (typeof RANGOS)[number];
export const VISTAS = ["portafolio", "movimientos", "watchlist", "grafica"] as const;
export type Vista = (typeof VISTAS)[number];

export const SIN_FUENTE = "Falta conectar la fuente de mercado.";
const MAX_TICKERS = 8;
const MAX_NOTA = 80;
const MIN_HISTORIA = 3;

export interface ParametrosMercado {
  vista: Vista;
  tickers: string[];
  rango: Rango;
  notas: Record<string, string>;
}

export function leerParametrosMercado(raw: unknown): ParametrosMercado {
  const r = (raw ?? {}) as Record<string, unknown>;
  const vista = (VISTAS as readonly string[]).includes(r.vista as string) ? (r.vista as Vista) : "watchlist";
  const rango = (RANGOS as readonly string[]).includes(r.rango as string) ? (r.rango as Rango) : "1S";
  const tickers: string[] = [];
  for (const t of Array.isArray(r.tickers) ? r.tickers : []) {
    const n = typeof t === "string" ? normalizarTicker(t) : null;
    if (n && !tickers.includes(n) && tickers.length < MAX_TICKERS) tickers.push(n);
  }
  const notas: Record<string, string> = {};
  const crudas = r.notas && typeof r.notas === "object" ? (r.notas as Record<string, unknown>) : {};
  for (const [k, v] of Object.entries(crudas)) {
    const t = normalizarTicker(k);
    const texto = typeof v === "string" ? v.trim().slice(0, MAX_NOTA) : "";
    if (t && texto && !tieneCifras(texto)) notas[t] = texto;
  }
  return { vista, tickers, rango, notas };
}

const TRAMO: Record<Rango, { n: number; unidad: string; dias: number }> = {
  "1D": { n: 5, unidad: "minute", dias: 1 },
  "1S": { n: 1, unidad: "hour", dias: 7 },
  "1M": { n: 1, unidad: "day", dias: 31 },
  "1A": { n: 1, unidad: "week", dias: 366 }
};

export function rutaDeSerie(ticker: string, rango: Rango, hoyISO: string): string {
  const t = TRAMO[rango];
  const desde = addDaysISO(hoyISO, -t.dias);
  return `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/${t.n}/${t.unidad}/${desde}/${hoyISO}?adjusted=true&sort=asc&limit=5000`;
}

export interface CotizacionPura {
  ticker: string;
  nombre: string;
  precio: number | null;
  pct: number | null;
}

export interface InversionPura {
  valuation: number | null;
  currency: string;
  as_of: string | null;
}

export interface EntradaMercado {
  parametros: ParametrosMercado;
  moneda: string;
  locale: string;
  /** `false` = sin POLYGON_API_KEY. */
  configurado: boolean;
  cotizaciones: CotizacionPura[];
  /** Cierres por ticker, del más viejo al más nuevo. */
  series: Record<string, number[]>;
  inversiones: InversionPura[];
  /** Patrimonio neto histórico (`net_worth_snapshots`), para la línea del portafolio. */
  historia: { x: string; y: number }[];
}

/** Los precios de mercado vienen en USD: se formatean en su moneda, no en la del perfil. */
const precioDe = (p: number | null, locale: string) => (p === null ? null : money(p, "USD", locale));

function fila(c: CotizacionPura, locale: string) {
  const v = variacion(c.pct);
  return { ticker: c.ticker, nombre: c.nombre, precio: precioDe(c.precio, locale), variacion: v?.texto ?? null, tono: v?.tono ?? null };
}

export function seccionesDeMercado(e: EntradaMercado): AnySection[] {
  const { parametros: p } = e;

  if (p.vista === "portafolio") {
    const propias = e.inversiones.filter((i) => i.currency === e.moneda && typeof i.valuation === "number");
    const otras = e.inversiones.length - propias.length;
    const total = propias.reduce((s, i) => s + (i.valuation ?? 0), 0);
    const fechas = propias.map((i) => i.as_of).filter((f): f is string => !!f).sort();
    const ultima = fechas[fechas.length - 1];
    const nota = [
      ultima ? `Valuación al ${fdate(ultima, e.locale)}` : "Sin fecha de valuación",
      otras > 0 ? `${otras} ${otras === 1 ? "inversión" : "inversiones"} en otra moneda no ${otras === 1 ? "suma" : "suman"}` : null
    ]
      .filter(Boolean)
      .join(" · ");
    return [{
      id: "mercado-portafolio",
      kind: "portfolio",
      title: "Tu portafolio hoy",
      data: { total: money(total, e.moneda, e.locale), nota, serie: e.historia.length >= MIN_HISTORIA ? e.historia : [] }
    }];
  }

  const elegidas = p.tickers.length ? e.cotizaciones.filter((c) => p.tickers.includes(c.ticker)) : e.cotizaciones;

  if (p.vista === "grafica") {
    const t = p.tickers[0] ?? elegidas[0]?.ticker;
    const serie = t ? e.series[t] ?? [] : [];
    if (!t || serie.length < 2) {
      return [{ id: "mercado-grafica", kind: "emptyState", title: t ?? "Mercado", data: { mensaje: SIN_FUENTE } }];
    }
    return [{
      id: "mercado-grafica",
      kind: "chart",
      data: { titulo: `${t} · ${p.rango}`, tipo: "linea", unidad: "USD", puntos: serie.map((y, i) => ({ x: String(i), y })) }
    }];
  }

  if (elegidas.length === 0) {
    return [{ id: `mercado-${p.vista}`, kind: "emptyState", title: "Mercado", data: { mensaje: "No sigues ningún ticker todavía: añádelos en Watchlist." } }];
  }

  if (p.vista === "movimientos") {
    const orden = [...elegidas].sort((a, b) => Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)).slice(0, MAX_TICKERS);
    return [{
      id: "mercado-movimientos",
      kind: "movimientos",
      title: "Principales movimientos",
      data: { configurado: e.configurado, items: orden.map((c) => ({ ...fila(c, e.locale), nota: p.notas[c.ticker] ?? null })) }
    }];
  }

  return [{
    id: "mercado-watchlist",
    kind: "watchlist",
    title: "Tu watchlist",
    data: { configurado: e.configurado, items: elegidas.slice(0, 20).map((c) => ({ ...fila(c, e.locale), serie: e.series[c.ticker] ?? [] })) }
  }];
}
```

If `money(118.24, "USD", "es-MX")` renders differently from `"USD 118.24"` in node's ICU, change the EXPECTATION in the watchlist test to the actual `money()` output (the app's existing formatter is the source of truth).

- [ ] **Step 5: Run tests + typecheck**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-mercado.test.ts tests/domain/centro-agente-hilo.test.ts && pnpm typecheck`
Expected: all PASS; typecheck clean.

- [ ] **Step 6: Commit (controller)**

```bash
git add src/lib/domain/centro/agente/mercado.ts src/lib/domain/centro/agente/hilo.ts tests/domain/centro-agente-mercado.test.ts tests/domain/centro-agente-hilo.test.ts
git commit -m "$(printf 'centro-agente: la capacidad de mercado y el hilo, puros\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 5 (Claude): las herramientas conservan lo que entregan, el cerebro compartido y la serie de Polygon

**Files:**
- Modify: `src/lib/domain/ai/tools.ts` (interfaz `CajaDeHerramientas`)
- Modify: `src/lib/ai/tools.ts`
- Create: `src/lib/ai-chat/cerebro.ts`
- Modify: `src/lib/ai-chat/actions.ts`
- Modify: `src/lib/money/polygon.ts`
- Test: `tests/domain/ai-tools.test.ts` (añadir), `tests/domain/centro-agente-mercado.test.ts` (ya cubre la ruta)

**Interfaces:**
- Produces:
  - `CajaDeHerramientas.filasEntregadas: () => ReadonlyMap<string, Record<string, unknown>>`.
  - `prepararCerebro(): Promise<Cerebro | null>` con `Cerebro { supabase; user: { id: string }; today: string; context: string; herramientas: CajaDeHerramientas | null; moneda: string; locale: string }` (null sin sesión).
  - `serieDe(ticker: string, rango: Rango): Promise<Resultado<number[]>>` en `polygon.ts` (cierres `c` de `results`, en orden).

- [ ] **Step 1: Failing test for row values**

Read `tests/domain/ai-tools.test.ts` first and follow how it builds a fake Supabase for `consultar` (if no fake exists there, add a minimal one inline: `from().select().limit().gte().lt().order()` chain resolving `{ data, error: null }`). Add:

```ts
test("consultar conserva el valor de cada fila entregada, no solo su id", async () => {
  // …crear la caja con el cliente falso que devuelve [{ id: "d1", name: "Tarjeta", balance: 4000 }] para `debts`
  await caja.ejecutar("consultar", { tabla: "debts", desde: "", hasta: "", limite: 10 });
  assert.deepStrictEqual(caja.filasEntregadas().get("fila:debts:d1"), { id: "d1", name: "Tarjeta", balance: 4000 });
});
```

If `tests/domain/ai-tools.test.ts` cannot import `src/lib/ai/tools.ts` because it is server-only, put the retention in a pure helper instead: `registrarFilas(mapa, tabla, filas)` in `src/lib/domain/ai/tools.ts`, test that, and call it from `consultar`.

- [ ] **Step 2: Run, watch it fail; implement**

In `src/lib/domain/ai/tools.ts` add to `CajaDeHerramientas`:

```ts
  /**
   * Las filas que `consultar` entregó, con sus valores (D-194). El agente de
   * interfaz cita `fila:<tabla>:<id>` + columna y el servidor lee el valor de
   * aquí: lo que no se entregó en este turno no se puede enseñar.
   */
  filasEntregadas: () => ReadonlyMap<string, Record<string, unknown>>;
```

In `src/lib/ai/tools.ts`: `const filas = new Map<string, Record<string, unknown>>();`; inside `consultar`, next to `entregados.add(id)`, add `filas.set(id, registro);`; return `filasEntregadas: () => filas` from the factory. Update any other object that implements `CajaDeHerramientas` (grep `entregados:` in `src` and `tests`) with `filasEntregadas: () => new Map()`.

- [ ] **Step 3: Extract `prepararCerebro`**

Create `src/lib/ai-chat/cerebro.ts` by MOVING (not copying) from `sendChatMessage` everything between the auth check and the `crearCajaDeHerramientas` call: profile/memory reads, `loadFacts`, `loadChainFacts`, `buildContext`, `crearCajaDeHerramientas`. Keep the chat-only parts (saving the question, reading `ai_chat_messages`) in `actions.ts`. Also read `profiles.currency` and `profiles.locale` if those columns exist (`grep -n "currency\|locale" src/lib/database.types.ts | head`), falling back to `"MXN"` / `"es-MX"`.

```ts
// src/lib/ai-chat/cerebro.ts
// El contexto y las herramientas del chat, para quien los necesite (D-194).
//
// Estaba dentro de `sendChatMessage`. El Centro-agente usa el MISMO cerebro
// (decisión del usuario: mismo modelo, herramientas y memoria; hilo propio), y
// copiarlo habría sido la quinta copia del trayecto de contexto que
// AGENTIC_KERNEL_ARCHITECTURE.md ya contaba cuatro veces.
import "server-only";
// …imports moved from actions.ts…

export interface Cerebro {
  supabase: Db;
  user: { id: string };
  today: string;
  context: string;
  herramientas: CajaDeHerramientas | null;
  moneda: string;
  locale: string;
}

export async function prepararCerebro(): Promise<Cerebro | null> {
  // …moved code; returns null without session…
}
```

`sendChatMessage` then calls `const cerebro = await prepararCerebro()` in parallel with its own `guardarPregunta`/`readHistory`. Behavior of the chat must not change: same facts, same tools, same audit.

- [ ] **Step 4: `serieDe` in `polygon.ts`**

```ts
import { rutaDeSerie, type Rango } from "@/lib/domain/centro/agente/mercado.ts";
import { todayLocal } from "@/lib/data/dates";

/** Cierres de un ticker en un rango (D-195). Vacío si Polygon no tiene barras. */
export async function serieDe(ticker: string, rango: Rango, hoyISO: string): Promise<Resultado<number[]>> {
  const r = await pedir<{ results?: { c?: number }[] }>(rutaDeSerie(ticker, rango, hoyISO));
  if (!r.ok) return r;
  return { ok: true, datos: (r.datos.results ?? []).map((b) => b.c).filter((c): c is number => typeof c === "number") };
}
```

(`hoyISO` is passed in by the caller; drop the `todayLocal` import if unused.)

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: all PASS (incl. `ai-chat.test.ts`, `ai-tools.test.ts`).

- [ ] **Step 6: Commit**

```bash
git add -A src/lib/domain/ai/tools.ts src/lib/ai/tools.ts src/lib/ai-chat/ src/lib/money/polygon.ts tests/domain/ai-tools.test.ts
git commit -m "$(printf 'centro-agente: las herramientas conservan lo que entregan, cerebro compartido, serie de Polygon\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 6 (Claude): el turno en el servidor

**Files:**
- Create: `src/lib/centro/agente/capacidades.ts`
- Create: `src/lib/centro/agente/pensar.ts`
- Create: `src/lib/centro/agente/turno.ts`
- Create: `src/app/api/centro/turno/route.ts`
- Create: `src/lib/domain/centro/agente/prompt.ts`
- Modify: `src/lib/domain/centro/runtime/ensamblar.ts` (exportar `conLimite`)
- Test: `tests/domain/centro-agente-prompt.test.ts`, `tests/domain/centro-agente-turno.test.ts`

**Interfaces:**
- Consumes: Tasks 1–5; `generateJson`, `Budget` (`@/lib/ai/gemini-provider`); `sanearPropuesta` (`@/lib/domain/coach/proposals.ts`); `armarPantalla` (`@/lib/centro/runtime/pantalla`); `loadRitualGate`, `loadRitualContent` (`@/lib/data/ritual`); `sugerenciasDelCentro`; `listarWatchlist` (`@/lib/money/watchlist-actions`); `cotizaciones`, `serieDe`; `validarScreen`; `destinoValido`; `flagsDelRuntime`.
- Produces:
  - `prompt.ts` (puro): `SYSTEM_AGENTE: string`, `promptDelTurno({ contexto, historial, texto }): string`.
  - `turno.ts` (puro): `componerTurno(e: EntradaComponer): { texto: string; secciones: AnySection[] }` — recibe la respuesta parseada y los resultados ya resueltos, aplica el filtro de cifras a `insight`, arma y valida con `validarScreen`, y si no valida devuelve solo texto.
  - `pensar.ts` (servidor): `pensarTurno(input: { texto: string; historial }): Promise<{ id: string; texto: string; secciones: AnySection[] }>`.
  - Ruta: `POST /api/centro/turno` → `{ ok: true, turno }` | 400/401/404.

- [ ] **Step 1: Failing tests (pure parts)**

```ts
// tests/domain/centro-agente-prompt.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_AGENTE, promptDelTurno } from "../../src/lib/domain/centro/agente/prompt.ts";

test("El system nombra todos los bloques y la regla de las cifras", () => {
  for (const k of ["lista", "metricas", "tabla", "grafica", "tarjetas", "linea", "ir_a", "recomendaciones", "insight", "mercado", "hoy"]) {
    assert.ok(SYSTEM_AGENTE.includes(`«${k}»`), k);
  }
  assert.match(SYSTEM_AGENTE, /nunca escribas una cifra dentro de un bloque/i);
  assert.match(SYSTEM_AGENTE, /fila:<tabla>:<id>/);
});

test("El prompt lleva contexto, historial y la pregunta, en ese orden", () => {
  const p = promptDelTurno({ contexto: "CTX", historial: [{ rol: "persona", texto: "hola" }, { rol: "agente", texto: "qué tal" }], texto: "¿cómo voy?" });
  assert.ok(p.indexOf("CTX") < p.indexOf("hola") && p.indexOf("hola") < p.indexOf("¿cómo voy?"));
});
```

```ts
// tests/domain/centro-agente-turno.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { componerTurno } from "../../src/lib/domain/centro/agente/turno.ts";

const P = "11111111-1111-4111-8111-111111111111";

test("Solo texto cuando no hay bloques", () => {
  assert.deepStrictEqual(componerTurno({ texto: "Hola", secciones: [], proyectos: [] }), { texto: "Hola", secciones: [] });
});

test("Un insight con cifras se cae, el resto se queda", () => {
  const r = componerTurno({
    texto: "x",
    secciones: [
      { id: "b0", kind: "insight", data: { texto: "Ahorras $3,000" } },
      { id: "b1", kind: "irA", data: { destinos: [{ etiqueta: "Presupuesto", href: "/money/budget" }] } }
    ],
    proyectos: []
  });
  assert.deepStrictEqual(r.secciones.map((s) => s.kind), ["irA"]);
});

test("Si la pantalla no valida, queda solo el texto", () => {
  const r = componerTurno({
    texto: "x",
    secciones: [{ id: "b0", kind: "irA", data: { destinos: [{ etiqueta: "Fuera", href: "https://evil.example" }] } }],
    proyectos: []
  });
  assert.deepStrictEqual(r, { texto: "x", secciones: [] });
});

test("Enlaces a tus proyectos pasan", () => {
  const r = componerTurno({
    texto: "x",
    secciones: [{ id: "b0", kind: "irA", data: { destinos: [{ etiqueta: "Malpaso", href: `/execution?project=${P}` }] } }],
    proyectos: [{ id: P }]
  });
  assert.strictEqual(r.secciones.length, 1);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-prompt.test.ts tests/domain/centro-agente-turno.test.ts`
Expected: FAIL `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Write `prompt.ts`**

```ts
// src/lib/domain/centro/agente/prompt.ts
// Lo que el agente de interfaz sabe de sí mismo (D-194). Puro.

import { MAX_BLOQUES } from "./contrato.ts";

export const SYSTEM_AGENTE = `Eres el Centro de LifeOS: un agente que contesta con INTERFAZ, no solo con texto.
Cada turno devuelves "texto" (1–3 frases, cálidas y concretas, en español) y hasta ${MAX_BLOQUES} "bloques".
Cada bloque es { "kind", "datos" }, donde "datos" es un objeto JSON en texto.

ANTES DE DIBUJAR, LEE. Usa las herramientas (consultar, leer_hechos, explorar_grafo) para traer las filas que la pregunta necesita. Cada fila llega con un id "fila:<tabla>:<id>".

REGLA DE ORO: nunca escribas una cifra dentro de un bloque. En los bloques de datos no pones valores: pones REFERENCIAS — el id de la fila y el nombre de la columna — y el sistema lee el valor. Solo puedes referenciar filas que te entregó una herramienta en este turno. En "texto" sí puedes mencionar cifras, pero solo las que leíste.

Bloques de datos (anclados a filas):
- «lista»: { "titulo", "items": [{ "fila", "titulo": columna, "detalle": columna|null, "estado": columna|null }] } (1–8). Tareas, hábitos, libros, pendientes.
- «metricas»: { "titulo"|null, "items": [{ "etiqueta", "fila", "campo", "formato": "numero"|"dinero"|"porcentaje"|"fecha"|"texto" }] } (1–4). KPIs.
- «tabla»: { "titulo", "columnas": [{ "etiqueta", "campo", "formato" }] (1–4), "filas": [ids] (1–10) }.
- «grafica»: { "titulo", "tipo": "linea"|"barras", "campoX", "campoY", "formato", "filas": [ids de UNA tabla] (2–31) }.
- «tarjetas»: { "titulo", "items": [{ "fila", "titulo": columna, "detalle": columna|null }] } (1–4).
- «linea»: { "titulo", "items": [{ "fila", "fecha": columna, "titulo": columna }] } (1–8). Línea de tiempo.

Bloques de acción:
- «ir_a»: { "destinos": [{ "etiqueta", "href" }] } (1–3). Solo rutas de la app: /execution, /planning, /time, /development, /development/routines, /development/goals, /development/library, /development/nutrition, /money, /money/budget, /money/watchlist, /investments, /savings, /debt, /cashback, /wealth, /goals, /household, /reports, o /execution?project=<uuid de un proyecto que leíste>.
- «recomendaciones»: { "items": [{ "tipo": "foco"|"tarea"|"bloque", "titulo", "motivo", "datos": JSON en texto }] } (1–3). Propones; la persona acepta con un clic. "foco" lleva {"href","motivo"}; "tarea" lleva {"projectId"} de un proyecto leído; "bloque" lleva {"fecha","inicio","fin","categoria"}. Sin cifras en "motivo".
- «insight»: { "texto" } una observación breve, sin cifras.

Capacidades (el sistema trae los datos):
- «mercado»: { "vista": "portafolio"|"movimientos"|"watchlist"|"grafica", "tickers"?: [..] (≤8), "rango"?: "1D"|"1S"|"1M"|"1A", "notas"?: { "TICKER": "una línea sin cifras" } }. Para acciones, portafolio, bolsa.
- «hoy»: {} el resumen del día (saludo, foco, atajos). Para «¿qué hago hoy?».

Elige los bloques que la pregunta necesita — ni uno más. Si basta con texto, "bloques": []. Si la pregunta es sobre una sección, añade «ir_a» hacia ella. Si hay algo concreto que conviene hacer, añade «recomendaciones».`;

export function promptDelTurno(e: { contexto: string; historial: { rol: "persona" | "agente"; texto: string }[]; texto: string }): string {
  const hilo = e.historial.map((m) => `${m.rol === "persona" ? "Persona" : "Centro"}: ${m.texto}`).join("\n");
  return [e.contexto, hilo ? `\nConversación hasta ahora:\n${hilo}` : "", `\nPersona: ${e.texto}`].join("\n");
}
```

- [ ] **Step 4: Write `turno.ts` (pure composition)**

```ts
// src/lib/domain/centro/agente/turno.ts
// La última puerta del turno (D-194). Pura.
import { validarScreen } from "../runtime/validador.ts";
import type { AnySection, Screen } from "../runtime/types.ts";
import { tieneCifras } from "./texto.ts";

export interface EntradaComponer {
  texto: string;
  secciones: AnySection[];
  proyectos: { id: string }[];
}

export function componerTurno(e: EntradaComponer): { texto: string; secciones: AnySection[] } {
  const limpias = e.secciones.filter((s) => !(s.kind === "insight" && tieneCifras(s.data.texto)));
  if (limpias.length === 0) return { texto: e.texto, secciones: [] };
  const screen: Screen = {
    id: "turno",
    intent: "libre",
    title: "Centro",
    layout: { densidad: "aireada" },
    sections: limpias,
    actions: [],
    refreshPolicy: { tipo: "alAbrir" },
    permissions: { lectura: true, escritura: false }
  };
  const r = validarScreen(screen, { proyectos: e.proyectos });
  return r.ok ? { texto: e.texto, secciones: r.screen.sections } : { texto: e.texto, secciones: [] };
}
```

Run the two tests: PASS.

- [ ] **Step 5: Server — `capacidades.ts`**

```ts
// src/lib/centro/agente/capacidades.ts
// Las capacidades enchufables del agente (D-195). SERVIDOR.
//
// Añadir una = una entrada en CAPACIDADES_REGISTRADAS con su hidratador. El
// agente la ve en SYSTEM_AGENTE y el renderer la pinta con sus componentes.
import "server-only";
import type { AnySection } from "@/lib/domain/centro/runtime/types.ts";
import { leerParametrosMercado, seccionesDeMercado } from "@/lib/domain/centro/agente/mercado.ts";
import { cotizaciones, serieDe } from "@/lib/money/polygon";
import { listarWatchlist } from "@/lib/money/watchlist-actions";
import { polygonApiKey } from "@/config/env";
import { armarPantalla } from "@/lib/centro/runtime/pantalla";
import { loadRitualContent, loadRitualGate } from "@/lib/data/ritual";
import { sugerenciasDelCentro } from "@/lib/centro/sugerencias";
import { flagsDelRuntime } from "@/config/env";
import type { Cerebro } from "@/lib/ai-chat/cerebro";

export type Hidratador = (parametros: Record<string, unknown>, cerebro: Cerebro) => Promise<AnySection[]>;

async function mercado(parametros: Record<string, unknown>, c: Cerebro): Promise<AnySection[]> {
  const p = leerParametrosMercado(parametros);
  const configurado = polygonApiKey() !== null;
  const lista = await listarWatchlist();
  const tickers = p.tickers.length ? p.tickers : lista.map((w) => w.ticker);
  const nombres = new Map(lista.map((w) => [w.ticker, w.nombre ?? w.ticker]));

  const [cot, inv, snap] = await Promise.all([
    configurado && tickers.length ? cotizaciones(tickers) : Promise.resolve(null),
    p.vista === "portafolio" ? c.supabase.from("investments").select("valuation, currency, as_of") : Promise.resolve(null),
    p.vista === "portafolio" ? c.supabase.from("net_worth_snapshots").select("as_of, net").order("as_of", { ascending: true }).limit(60) : Promise.resolve(null)
  ]);

  const precios = new Map((cot?.ok ? cot.datos : []).map((q) => [q.ticker, q]));
  const cotizacionesPuras = tickers.map((t) => ({
    ticker: t,
    nombre: nombres.get(t) ?? t,
    precio: precios.get(t)?.precio ?? null,
    pct: precios.get(t)?.variacion?.pct ?? null
  }));

  const quiereSeries = configurado && (p.vista === "watchlist" || p.vista === "grafica");
  const paraSerie = p.vista === "grafica" ? tickers.slice(0, 1) : tickers.slice(0, 8);
  const rango = p.vista === "watchlist" ? "1S" : p.rango;
  const series: Record<string, number[]> = {};
  if (quiereSeries) {
    const rs = await Promise.all(paraSerie.map((t) => serieDe(t, rango, c.today)));
    rs.forEach((r, i) => { if (r.ok) series[paraSerie[i]!] = r.datos; });
  }

  return seccionesDeMercado({
    parametros: p,
    moneda: c.moneda,
    locale: c.locale,
    configurado,
    cotizaciones: cotizacionesPuras,
    series,
    inversiones: (inv?.data ?? []).map((i) => ({ valuation: i.valuation, currency: i.currency, as_of: i.as_of })),
    historia: (snap?.data ?? []).map((s) => ({ x: s.as_of, y: Number(s.net) })).filter((p) => Number.isFinite(p.y))
  });
}

async function hoy(): Promise<AnySection[]> {
  const puerta = await loadRitualGate();
  if (!puerta) return [];
  const [contenido, pensado] = await Promise.all([loadRitualContent(puerta), sugerenciasDelCentro().catch(() => ({ resumen: "" }))]);
  if (!contenido) return [];
  const screen = await armarPantalla({ kind: "hoy" }, { puerta, contenido, resumen: pensado.resumen, flags: flagsDelRuntime() });
  return screen?.sections ?? [];
}

export const CAPACIDADES_REGISTRADAS: Record<"mercado" | "hoy", Hidratador> = { mercado, hoy };
```

(Adjust column names — `valuation`, `currency`, `as_of`, `net` — to `src/lib/database.types.ts` if they differ; `FilaDeWatchlist.nombre` may be `string | null`.)

- [ ] **Step 6: Server — `pensar.ts`**

```ts
// src/lib/centro/agente/pensar.ts
// Un turno del agente de interfaz, de punta a punta (D-194). SERVIDOR.
import "server-only";
import { randomUUID } from "node:crypto";
import { generateJson, type Budget } from "@/lib/ai/gemini-provider";
import { prepararCerebro } from "@/lib/ai-chat/cerebro";
import { parsearRespuesta, ESQUEMA_RESPUESTA, type BloqueDelAgente } from "@/lib/domain/centro/agente/contrato.ts";
import { resolverBloque, proyectosVistos } from "@/lib/domain/centro/agente/resolver.ts";
import { SYSTEM_AGENTE, promptDelTurno } from "@/lib/domain/centro/agente/prompt.ts";
import { componerTurno } from "@/lib/domain/centro/agente/turno.ts";
import { tieneCifras } from "@/lib/domain/centro/agente/texto.ts";
import { destinoValido } from "@/lib/domain/centro/sugerencias.ts";
import { sanearPropuesta } from "@/lib/domain/coach/proposals.ts";
import { conLimite } from "@/lib/domain/centro/runtime/ensamblar.ts";
import type { AnySection } from "@/lib/domain/centro/runtime/types.ts";
import { CAPACIDADES_REGISTRADAS } from "./capacidades";

const CENTRO_AGENTE_BUDGET: Budget = { maxOutputTokens: 3000, thinkingBudget: 256 };
const TIEMPO_CAPACIDAD_MS = 8000;
export const DISCULPA = "No pude pensar esto ahora; inténtalo de nuevo.";

export async function pensarTurno(input: { texto: string; historial: { rol: "persona" | "agente"; texto: string }[] }) {
  const id = randomUUID();
  const cerebro = await prepararCerebro();
  if (!cerebro) return { id, texto: DISCULPA, secciones: [] as AnySection[] };

  const r = await generateJson({
    system: SYSTEM_AGENTE,
    prompt: promptDelTurno({ contexto: cerebro.context, historial: input.historial, texto: input.texto }),
    schema: ESQUEMA_RESPUESTA,
    validate: (raw) => parsearRespuesta(raw),
    budget: CENTRO_AGENTE_BUDGET,
    ...(cerebro.herramientas
      ? { tools: cerebro.herramientas.declaraciones, executeTool: cerebro.herramientas.ejecutar }
      : {})
  });
  if (!r.ok || !r.data) {
    console.warn("[centro-agente] el modelo no contestó:", r.reason);
    return { id, texto: DISCULPA, secciones: [] as AnySection[] };
  }
  for (const d of r.data.descartados) console.warn("[centro-agente] bloque descartado:", d);

  const filas = cerebro.herramientas?.filasEntregadas() ?? new Map();
  const proyectos = proyectosVistos(filas);
  const ctx = { filas, moneda: cerebro.moneda, locale: cerebro.locale };

  const porBloque = await Promise.all(
    r.data.bloques.map((b, i) => resolverUno(b, `b${i}`, ctx, proyectos, cerebro).catch((e: unknown) => {
      console.warn("[centro-agente] bloque falló:", e);
      return [{ id: `b${i}`, kind: "error", data: { mensaje: "No se pudo cargar esta parte." } } as AnySection];
    }))
  );

  return { id, ...componerTurno({ texto: r.data.texto, secciones: porBloque.flat(), proyectos }) };
}

async function resolverUno(
  b: BloqueDelAgente,
  id: string,
  ctx: Parameters<typeof resolverBloque>[2],
  proyectos: { id: string }[],
  cerebro: NonNullable<Awaited<ReturnType<typeof prepararCerebro>>>
): Promise<AnySection[]> {
  switch (b.kind) {
    case "capacidad":
      return conLimite(CAPACIDADES_REGISTRADAS[b.nombre](b.parametros, cerebro), TIEMPO_CAPACIDAD_MS);
    case "ir_a": {
      const destinos = b.destinos.filter((d) => destinoValido(d.href, proyectos));
      return destinos.length ? [{ id, kind: "irA", data: { destinos } }] : [];
    }
    case "insight":
      return tieneCifras(b.texto) ? [] : [{ id, kind: "insight", data: { texto: b.texto } }];
    case "recomendaciones": {
      const items: { propuestaId: string; titulo: string; motivo: string }[] = [];
      for (const it of b.items) {
        if (tieneCifras(it.motivo)) continue;
        const limpia = sanearPropuesta({ tipo: it.tipo, titulo: it.titulo, detalle: it.motivo, datos: it.datos });
        if (!limpia) continue;
        const { data } = await cerebro.supabase
          .from("coach_proposals")
          .insert({ user_id: cerebro.user.id, origen: "centro", tipo: limpia.tipo, titulo: limpia.titulo, detalle: limpia.detalle, payload: limpia.payload })
          .select("id")
          .single();
        if (data) items.push({ propuestaId: data.id, titulo: limpia.titulo, motivo: limpia.detalle });
      }
      return items.length ? [{ id, kind: "recomendaciones", data: { items } }] : [];
    }
    default: {
      const s = resolverBloque(b, id, ctx);
      return s ? [s] : [];
    }
  }
}
```

Before writing the insert, read how `src/lib/centro/sugerencias.ts` inserts into `coach_proposals` (columns, `status`, any `run_id`/`dedupe` field) and copy that exact column set. If `sanearPropuesta` rejects `foco` without `href`/`motivo` in `datos`, that is correct behavior — the prompt already tells the model what each type carries.

In `src/lib/domain/centro/runtime/ensamblar.ts` change `function conLimite` to `export function conLimite`.

- [ ] **Step 7: The route**

```ts
// src/app/api/centro/turno/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { flagsDelRuntime } from "@/config/env";
import { getSessionUser } from "@/lib/data/session";
import { pensarTurno } from "@/lib/centro/agente/pensar";
import { MAX_HISTORIAL } from "@/lib/domain/centro/agente/hilo.ts";

/**
 * Un turno del Centro-agente (D-194). Solo existe con AGENTIC_CENTER_RUNTIME:
 * apagado responde 404, como si no existiera.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Entrada = z.object({
  texto: z.string().trim().min(1).max(2000),
  historial: z.array(z.object({ rol: z.enum(["persona", "agente"]), texto: z.string().max(2000) })).max(MAX_HISTORIAL)
});

export async function POST(req: Request) {
  if (!flagsDelRuntime().runtime) return NextResponse.json({ ok: false, reason: "No encontrado." }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, reason: "Sin sesión." }, { status: 401 });
  const e = Entrada.safeParse(await req.json().catch(() => null));
  if (!e.success) return NextResponse.json({ ok: false, reason: "Entrada inválida." }, { status: 400 });
  const turno = await pensarTurno(e.data);
  return NextResponse.json({ ok: true, turno });
}
```

- [ ] **Step 8: Verify + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: all PASS.

```bash
git add -A src/lib/centro/agente/ src/app/api/centro/turno/ src/lib/domain/centro/agente/prompt.ts src/lib/domain/centro/agente/turno.ts src/lib/domain/centro/runtime/ensamblar.ts tests/domain/centro-agente-prompt.test.ts tests/domain/centro-agente-turno.test.ts
git commit -m "$(printf 'centro-agente: el turno en el servidor\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 7 (Claude): los componentes de los bloques

**Files:**
- Create: `src/components/centro-runtime/secciones/{Lista,Metricas,Tabla,Grafica,Tarjetas,LineaDeTiempo,IrA,Recomendaciones,Insight,Portafolio,Movimientos,Watchlist}.tsx`
- Create: `src/components/centro-runtime/Sparkline.tsx`
- Create: `src/components/centro-runtime/contexto.tsx` (`ContextoDelAgente` con `workspaceId`)
- Create: `src/lib/domain/centro/agente/grafica.ts` + `tests/domain/centro-agente-grafica.test.ts`
- Modify: `src/components/centro-runtime/index.ts`
- Modify: `src/app/globals.css` (bloque `.ag-*`)

**Interfaces:**
- Consumes: `PropsDeSeccion<K>` y `registrarSeccion` (`../registro`); `acceptProposal`, `dismissProposal` (`@/lib/coach/actions`).
- Produces: un componente registrado por cada kind de Task 1; `trazo(puntos: number[], ancho: number, alto: number): string` (path SVG) en `grafica.ts`.

- [ ] **Step 1: Failing test for the SVG path (the only logic here)**

```ts
// tests/domain/centro-agente-grafica.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { trazo } from "../../src/lib/domain/centro/agente/grafica.ts";

test("Un trazo recorre de izquierda a derecha y ocupa el alto", () => {
  assert.strictEqual(trazo([0, 10], 100, 20), "M0,20 L100,0");
});
test("Una serie plana va por el medio", () => {
  assert.strictEqual(trazo([5, 5, 5], 100, 20), "M0,10 L50,10 L100,10");
});
test("Menos de dos puntos: sin trazo", () => {
  assert.strictEqual(trazo([1], 100, 20), "");
});
```

- [ ] **Step 2: Implement `grafica.ts`**

```ts
// src/lib/domain/centro/agente/grafica.ts
// El trazo de una serie como path SVG (D-194). Puro. Sin librería de gráficas:
// una línea y una sparkline no la justifican.
export function trazo(puntos: number[], ancho: number, alto: number): string {
  if (puntos.length < 2) return "";
  const min = Math.min(...puntos);
  const max = Math.max(...puntos);
  const r = (n: number) => Math.round(n * 100) / 100;
  return puntos
    .map((y, i) => {
      const px = r((i / (puntos.length - 1)) * ancho);
      const py = max === min ? r(alto / 2) : r(alto - ((y - min) / (max - min)) * alto);
      return `${i === 0 ? "M" : "L"}${px},${py}`;
    })
    .join(" ");
}
```

Run: PASS.

- [ ] **Step 3: Components**

Each file: `"use client"`, a default-exported component typed `PropsDeSeccion<"<kind>">`, ending in `registrarSeccion("<kind>", Componente)`. Links use `next/link` with `onClick={() => alAceptar(href)}`. Style (mockups): white card (`.ag-card`: background `var(--ag-surface)`, radius 18px, `box-shadow: 0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.04)`, no border), title 15px/600, big figures 32px/600, muted 13px, green `#16a34a` / red `#dc2626` only for `tono`.

Reference implementation for the pattern (write the other eleven the same way):

```tsx
// src/components/centro-runtime/secciones/Watchlist.tsx
"use client";

import Link from "next/link";
import { IconChevronRight } from "@/components/icons";
import { registrarSeccion, type PropsDeSeccion } from "../registro";
import Sparkline from "../Sparkline";

/** La watchlist de la maqueta: iniciales, precio, variación y sparkline. */
export default function SeccionWatchlist({ data, title, alAceptar }: PropsDeSeccion<"watchlist">) {
  return (
    <div className="ag-card">
      <div className="ag-card-cabecera">
        <h3 className="ag-card-titulo">{title ?? "Tu watchlist"}</h3>
        <span className="ag-muted">Rendimiento de hoy</span>
      </div>
      {!data.configurado && <p className="ag-aviso">Falta conectar la fuente de mercado.</p>}
      <ul className="ag-filas">
        {data.items.map((t) => (
          <li key={t.ticker} className="ag-fila">
            <span className="ag-avatar" aria-hidden>{t.ticker.slice(0, 4)}</span>
            <span className="ag-fila-texto">
              <strong>{t.ticker}</strong>
              <span className="ag-muted">{t.nombre}</span>
            </span>
            <span className="ag-fila-cifra">
              <span>{t.precio ?? "—"}</span>
              {t.variacion && <span className={`ag-tono-${t.tono ?? "info"}`}>{t.variacion}</span>}
            </span>
            {t.serie.length > 1 && <Sparkline puntos={t.serie} tono={t.tono} />}
          </li>
        ))}
      </ul>
      <Link href="/money/watchlist" className="ag-card-pie" onClick={() => alAceptar("/money/watchlist")}>
        Ver todos los tickers <IconChevronRight aria-hidden className="ag-chevron" />
      </Link>
    </div>
  );
}

registrarSeccion("watchlist", SeccionWatchlist);
```

```tsx
// src/components/centro-runtime/Sparkline.tsx
"use client";
import { trazo } from "@/lib/domain/centro/agente/grafica.ts";
import type { Tono } from "@/lib/domain/centro/runtime/secciones.ts";

export default function Sparkline({ puntos, tono, ancho = 64, alto = 22 }: { puntos: number[]; tono: Tono | null; ancho?: number; alto?: number }) {
  return (
    <svg className={`ag-spark ag-tono-${tono ?? "info"}`} width={ancho} height={alto} viewBox={`0 0 ${ancho} ${alto}`} aria-hidden>
      <path d={trazo(puntos, ancho, alto)} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}
```

`Recomendaciones.tsx` reads `workspaceId` from `ContextoDelAgente` (`src/components/centro-runtime/contexto.tsx`: `createContext<{ workspaceId: string | null }>({ workspaceId: null })`), and per item: «Aceptar» → `acceptProposal(propuestaId, workspaceId)`; if it returns `href`, `alAceptar(href)`; show «Hecho» / the `reason`. «Descartar» → `dismissProposal(propuestaId)`, then hide the item. Use `useTransition`.

`Portafolio.tsx`: total 32px, `nota` muted, and if `serie.length` a full-width line (`trazo` over `serie.map(p => p.y)`, 100% width via `viewBox="0 0 300 80"` + `preserveAspectRatio="none"`) with a soft green area under it.
`Grafica.tsx`: the same line (or bars when `tipo === "barras"`: one `rect` per point) with `unidad` and min/max labels.
`Movimientos.tsx`: rows ticker/precio/variación + `nota` muted under the ticker, chevron to `/money/watchlist`.
`Lista`, `Tabla`, `Tarjetas`, `LineaDeTiempo`: the resolved data straight onto rows; `href` null → no link.
`IrA`: pill buttons (`.ag-boton`), black background, white text.
`Insight`: 💡 (`IconSparkles`) + text on `var(--ag-soft)`.
`Metricas`: 1–4 tiles in a grid, `valor` 24px/600.

Add all twelve imports to `src/components/centro-runtime/index.ts`.

- [ ] **Step 4: CSS**

Append a `.ag-*` block to `src/app/globals.css` with tokens on `.ag-shell`: `--ag-bg:#fff; --ag-surface:#fff; --ag-soft:#f5f5f7; --ag-text:#0b0b0c; --ag-muted:#6e6e73; --ag-line:rgba(0,0,0,.06)`, and `@media (prefers-color-scheme: dark) { .ag-shell { --ag-bg:#0b0b0c; --ag-surface:#161618; --ag-soft:#1c1c1f; --ag-text:#f5f5f7; --ag-muted:#a1a1a6; --ag-line:rgba(255,255,255,.08) } }`. Classes used above plus `.ag-tono-ok{color:#16a34a}` `.ag-tono-bad{color:#dc2626}` `.ag-tono-info{color:var(--ag-muted)}`.

- [ ] **Step 5: Verify + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`

```bash
git add -A src/components/centro-runtime/ src/lib/domain/centro/agente/grafica.ts tests/domain/centro-agente-grafica.test.ts src/app/globals.css
git commit -m "$(printf 'centro-agente: los componentes de los bloques\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 8 (Claude): `CentroAgente`, la superficie

**Files:**
- Create: `src/components/centro-agente/CentroAgente.tsx`
- Create: `src/components/centro-agente/Composer.tsx`
- Modify: `src/components/ritual/RitualHost.tsx` (prop `agente: boolean`)
- Modify: `src/components/ritual/RitualGate.tsx` (pasa `agente={flagsDelRuntime().runtime}`)
- Modify: `src/app/globals.css` (shell, hilo, burbujas, composer, esqueleto)

**Interfaces:**
- Consumes: `/api/centro` (devuelve `screen` con el flag), `/api/centro/turno`; `agregar`, `historialParaModelo`, `Turno` (Task 4); `RuntimeScreen`; `ContextoDelAgente`; `BarraCaptura` (para la hoja del (+)); `abrirFoco`, `atraparFoco` (`@/lib/dom/ritual-focus.ts`).
- Produces: `<CentroAgente onCerrar onIrA workspaceId locale />`.

- [ ] **Step 1: `RitualHost`/`RitualGate`**

In `RitualGate.tsx` import `flagsDelRuntime` from `@/config/env` and pass `agente={flagsDelRuntime().runtime}` to `<RitualHost>`. In `RitualHost.tsx` add the prop `agente: boolean` and in the `vista === "centro"` branch:

```tsx
  if (vista === "centro") {
    // Fase 2 (D-194): con el runtime encendido, el Centro es el agente —
    // superficie propia, nada del armazón viejo. Apagado, CentroPremium de siempre.
    if (agente) {
      return <CentroAgente onCerrar={cerrarCentro} onIrA={irA} workspaceId={workspaceId} locale={locale} />;
    }
    return (
      <CentroPremium … /* unchanged */ />
    );
  }
```

(Use the exact handler names `RitualHost` already passes to `CentroPremium` for `onCerrar`/`onIrA`.)

- [ ] **Step 2: `CentroAgente.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import RuntimeScreen from "@/components/centro-runtime/RuntimeScreen";
import { ContextoDelAgente } from "@/components/centro-runtime/contexto";
import { abrirFoco, atraparFoco } from "@/lib/dom/ritual-focus.ts";
import { agregar, historialParaModelo, type Turno } from "@/lib/domain/centro/agente/hilo.ts";
import type { Screen } from "@/lib/domain/centro/runtime/types.ts";
import { IconClose } from "@/components/icons";
import Composer from "./Composer";

const LIMITE_MS = 45_000;

/**
 * El Centro como agente de interfaz (D-194).
 *
 * UNA CONVERSACIÓN, NO UN PANEL. Abre con «Hoy» y cada cosa que se escribe
 * añade un turno: texto + los bloques que el agente eligió, pintados por el
 * mismo renderer de la Fase 1. Nada del armazón viejo se monta aquí.
 */
export default function CentroAgente({
  onCerrar,
  onIrA,
  workspaceId,
  locale
}: {
  onCerrar: () => void;
  onIrA: () => void;
  workspaceId: string | null;
  locale: string;
}) {
  const [hilo, setHilo] = useState<Turno[]>([]);
  const [cargandoHoy, setCargandoHoy] = useState(true);
  const [pensando, setPensando] = useState(false);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const finRef = useRef<HTMLDivElement | null>(null);

  // Primer turno: «Hoy», de /api/centro (que ya devuelve `screen` con el flag).
  useEffect(() => {
    let vivo = true;
    void fetch("/api/centro")
      .then((r) => (r.ok ? (r.json() as Promise<{ screen?: Screen | null }>) : null))
      .catch(() => null)
      .then((r) => {
        if (!vivo) return;
        setCargandoHoy(false);
        if (r?.screen) setHilo([{ id: "hoy", rol: "agente", texto: "", secciones: r.screen.sections }]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const el = shellRef.current;
    return el ? abrirFoco(el) : undefined;
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCerrar();
        return;
      }
      if (shellRef.current) atraparFoco(shellRef.current, e);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCerrar]);

  // Mismo criterio que CentroPremium: la app de debajo deja de alcanzarse.
  useEffect(() => {
    const main = document.querySelector<HTMLElement>("body > div");
    if (!main) return;
    main.setAttribute("inert", "");
    const previo = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      main.removeAttribute("inert");
      document.body.style.overflow = previo;
    };
  }, []);

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [hilo, pensando]);

  async function enviar(texto: string) {
    const pregunta: Turno = { id: `p${Date.now()}`, rol: "persona", texto, secciones: [] };
    const historial = historialParaModelo(hilo);
    setHilo((h) => agregar(h, pregunta));
    setPensando(true);
    try {
      const res = await fetch("/api/centro/turno", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto, historial }),
        signal: AbortSignal.timeout(LIMITE_MS)
      });
      const r = res.ok ? ((await res.json()) as { turno?: { id: string; texto: string; secciones: Turno["secciones"] } }) : null;
      const t = r?.turno;
      setHilo((h) => agregar(h, t ? { id: t.id, rol: "agente", texto: t.texto, secciones: t.secciones } : { id: `e${Date.now()}`, rol: "agente", texto: "No pude pensar esto ahora; inténtalo de nuevo.", secciones: [] }));
    } catch {
      setHilo((h) => agregar(h, { id: `e${Date.now()}`, rol: "agente", texto: "Tardó demasiado. Inténtalo de nuevo.", secciones: [] }));
    } finally {
      setPensando(false);
    }
  }

  return (
    <ContextoDelAgente.Provider value={{ workspaceId }}>
      <div ref={shellRef} className="ag-shell" role="dialog" aria-modal="true" aria-label="Centro">
        <header className="ag-cabecera">
          <span className="ag-logo"><span className="ag-logo-marca" aria-hidden>✓</span> LifeOS</span>
          <button className="ag-cerrar" onClick={onCerrar} aria-label="Cerrar el centro">
            <IconClose width={20} height={20} />
          </button>
        </header>

        <main className="ag-hilo" aria-live="polite">
          {cargandoHoy && <div className="ag-esqueleto" aria-label="Cargando" />}
          {hilo.map((t) =>
            t.rol === "persona" ? (
              <p key={t.id} className="ag-burbuja">{t.texto}</p>
            ) : (
              <section key={t.id} className="ag-turno">
                {t.texto && (
                  <p className="ag-respuesta"><span className="ag-logo-marca" aria-hidden>✓</span>{t.texto}</p>
                )}
                {t.secciones.length > 0 && (
                  <RuntimeScreen
                    screen={{ id: t.id, intent: t.id === "hoy" ? "hoy" : "libre", title: "Centro", layout: { densidad: "aireada" }, sections: t.secciones, actions: [], refreshPolicy: { tipo: "alAbrir" }, permissions: { lectura: true, escritura: false } }}
                    onNavegar={onIrA}
                  />
                )}
              </section>
            )
          )}
          {pensando && <p className="ag-respuesta ag-pensando"><span className="ag-logo-marca" aria-hidden>✓</span>Pensando…</p>}
          <div ref={finRef} />
        </main>

        <Composer onEnviar={enviar} ocupado={pensando} workspaceId={workspaceId} onIrA={onIrA} />
      </div>
    </ContextoDelAgente.Provider>
  );
}
```

- [ ] **Step 3: `Composer.tsx`**

A form with `(+)` button, textarea/input `placeholder="¿Qué quieres hacer hoy?"`, and a round black send button (→). Enter sends (Shift+Enter newline); empty or `ocupado` disables send. `(+)` toggles a bottom sheet (`.ag-hoja`) that renders the existing `<BarraCaptura workspaceId={workspaceId} onNavegar={onIrA} />` so quick capture keeps working.

- [ ] **Step 4: CSS for the shell**

`.ag-shell` fixed full-screen, `background: var(--ag-bg)`, `color: var(--ag-text)`, grid rows `auto 1fr auto`, `padding: env(safe-area-inset-top) 16px env(safe-area-inset-bottom)`; `.ag-hilo` scrolls, max-width 640px centered, gap 20px; `.ag-burbuja` right-aligned, `background: var(--ag-soft)`, radius 18px, padding 12px 16px; `.ag-respuesta` with the ✓ mark (`.ag-logo-marca`: 24px black rounded square with white check); `.ag-composer` rounded 28px pill, soft shadow; `.ag-esqueleto` shimmer blocks; `.ag-pensando` with a pulsing mark. No `--rit-*` tokens here.

- [ ] **Step 5: Verify + commit**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`

```bash
git add -A src/components/centro-agente/ src/components/ritual/RitualHost.tsx src/components/ritual/RitualGate.tsx src/app/globals.css
git commit -m "$(printf 'centro-agente: la superficie, una conversación que abre con Hoy\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>')"
```

---

### Task 9 (controller): documentación y verificación en navegador

**Files:**
- Modify: `docs/AGENTIC_CENTER_RUNTIME.md` (sección «Fase 2: el agente de interfaz»: flujo del turno, vocabulario, referencias a filas, capacidades, superficie, qué no está demostrado)
- Modify: `docs/DECISIONS.md` (D-194 agente de interfaz y referencias a filas; D-195 capacidades y mercado; D-196 la superficie sustituye entera)

- [ ] **Step 1: Docs** as listed, in the house style.
- [ ] **Step 2: `pnpm typecheck && pnpm lint && pnpm test:unit`** — all PASS.
- [ ] **Step 3: Browser** — requires `GEMINI_API_KEY` in `.env.local` (the user provides it). `pnpm build && AGENTIC_CENTER_RUNTIME=1 pnpm start -p 3102`, Chromium headless at 390 px (libs per memory: libnss3, libnspr4, libasound2t64). Conversations: open → «Hoy» with no old shell; «¿Cómo van mis acciones?»; «Muéstrame mi watchlist»; «¿Cómo voy con mis hábitos?»; «¿Qué debo pagar este mes?». For each: screenshot, confirm text + at least one block, and that every figure in blocks appears in a row the tools returned (server log). Without Polygon key: market blocks say «Falta conectar la fuente de mercado». Flag off: `CentroPremium` as before and `/api/centro/turno` → 404.
- [ ] **Step 4: Commit docs.**
