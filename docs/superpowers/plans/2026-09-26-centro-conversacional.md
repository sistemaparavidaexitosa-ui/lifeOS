# Centro conversacional (subproyecto A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El Centro responde más largo, confirma lo que entendió cuando hay duda, enseña sus capacidades al abrir, deja decir «No es esto» y aprende preferencias en la conversación.

**Architecture:** Dos bloques nuevos del contrato (`confirmar_entendimiento`, `recordar`) y un filtro puro que impide preguntar y proponer a la vez. Una sección nueva del runtime pinta la confirmación. El aprendizaje resume en el prompt los resultados de los últimos 30 días (de `coach_proposals` y `audit_log`) y escribe preferencias en `memory_items` con `origin = 'centro'` (migración 0079), separadas en el contexto de lo que dijo la persona. Los chips salen de un catálogo puro filtrado por dominios y franja, ordenado por uso, servido por `/api/centro/chips`.

**Tech Stack:** Next.js 15, TypeScript, zod 3, Supabase (RLS, pgTAP), `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-09-26-centro-conversacional-design.md`

## Global Constraints

- Nada se escribe en tablas de la persona sin Guardar (D-203 sigue igual). La única escritura sin clic es `memory_items` con `origin = 'centro'` desde el bloque `recordar` (D-204).
- Todo con el cliente de SESIÓN (RLS). `createAdminClient()` no se importa en ningún archivo de este plan.
- `MAX_TEXTO` 2000, `MAX_BLOQUES` 6, `maxOutputTokens` del Centro 6000, `thinkingBudget` 256.
- `confirmar_entendimiento`: `entendi` 1–300, `seguir` 1–40, `alternativas` 0–3 (`etiqueta` 1–40, `texto` 1–300 o `null`).
- `recordar`: `texto` 1–200, `ambito` ∈ `MEMORY_SCOPES`; 1 por turno; 20 memorias `centro` vigentes como máximo; caduca a los 90 días; sin duplicados (normalizado).
- Resumen de resultados: últimos 30 días, 12 líneas como máximo.
- Chips: 4–6, solo con el hilo sin preguntas de la persona.
- Registros en `audit_log`: `ai.centro_entendimiento` `{ resultado: "seguir" | "alternativa" | "otra" | "malentendido", … }`, `ai.centro_chip` `{ id }`.
- Archivos de dominio: imports relativos con `.ts`. Servidor: alias `@/`.
- Textos visibles en español, mismo tono que el resto del Centro.
- Migración `supabase/migrations/0079_memoria_del_centro.sql`; pgTAP `supabase/tests/0049_memoria_del_centro.sql`. Decisión D-204.
- NO correr `pnpm verify` ni `supabase db reset` (la base local tiene datos reales). Para la 0079 en local: `supabase migration up`.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **El modelo manda confirmación Y propuestas en el mismo turno.** Se espera solo la confirmación. → test en Task 1.
2. **El modelo manda dos `recordar`.** Se espera que solo el primero se guarde. → test en Task 1.
3. **`recordar` con un texto casi igual a una memoria que la persona escribió a mano** («Prefiero gramos» vs «prefiero  gramos»). Se espera que no se duplique. → test en Task 3.
4. **La memoria del Centro no debe colarse como orden de la persona** en el prompt del chat o del Centro. → test en Task 3.
5. **Chips con dominios apagados.** Nunca debe salir un chip de un dominio que la persona no activó. → test en Task 5.

---

## File Structure

**Crear (dominio, puro):**
- `src/lib/domain/centro/agente/entendimiento.ts` — `seccionDeConfirmacion`.
- `src/lib/domain/centro/agente/recordar.ts` — `normalizarMemoria`, `planDeRecordar`.
- `src/lib/domain/centro/agente/resultados.ts` — `resumirResultados`.
- `src/lib/domain/centro/agente/chips.ts` — `CAPACIDADES_VISIBLES`, `elegirChips`.

**Crear (servidor / cliente):**
- `src/lib/centro/agente/resultados.ts` — `cargarResultados`.
- `src/lib/centro/agente/eventos.ts` — server actions `registrarEntendimiento`, `registrarChip`.
- `src/app/api/centro/chips/route.ts` — `GET`.
- `src/components/centro-runtime/secciones/ConfirmarEntendimiento.tsx`.
- `supabase/migrations/0079_memoria_del_centro.sql`, `supabase/tests/0049_memoria_del_centro.sql`.

**Tests nuevos:** `tests/domain/centro-agente-entendimiento.test.ts`, `…-recordar.test.ts`, `…-resultados.test.ts`, `…-chips.test.ts`.

**Modificar:** `contrato.ts`, `prompt.ts` (agente), `runtime/secciones.ts`, `runtime/validador.ts`, `domain/insights/memory.ts`, `insights/context.ts`, `centro/agente/pensar.ts`, `centro/escritura/confirmar.ts` (`descartarCambio`), `components/centro-runtime/contexto.tsx`, `components/centro-runtime/index.ts`, `components/centro-runtime/secciones/PropuestaCambio.tsx`, `components/centro-agente/CentroAgente.tsx`, `src/app/globals.css`, `src/app/(app)/intelligence/memory/page.tsx`, `docs/DECISIONS.md`, y los tests existentes que cuentan kinds o topes.

---

### Task 1: Contrato — respuestas largas y los dos bloques nuevos

**Files:**
- Modify: `src/lib/domain/centro/agente/contrato.ts`
- Modify: `tests/domain/centro-agente-contrato.test.ts`

**Interfaces:**
- Consumes: `MEMORY_SCOPES`, `MemoryScope` de `src/lib/domain/insights/memory.ts`; `tieneCifras` de `./texto.ts`.
- Produces:
  - `MAX_TEXTO = 2000` (exportada), `MAX_BLOQUES = 6`.
  - Variantes de `BloqueDelAgente`: `{ kind: "confirmar_entendimiento"; entendi: string; seguir: string; alternativas: { etiqueta: string; texto: string | null }[] }` y `{ kind: "recordar"; texto: string; ambito: MemoryScope }`.
  - `parsearRespuesta` aplica: con `confirmar_entendimiento` presente se quitan los `propuesta_cambio`; como mucho 1 `confirmar_entendimiento` y 1 `recordar` (el primero).

- [ ] **Step 1: Write the failing tests** — añadir al final de `tests/domain/centro-agente-contrato.test.ts`:

```ts
const blq = (kind: string, datos: unknown) => ({ kind, datos: JSON.stringify(datos) });
const CONF = { entendi: "Quieres registrar la avena y mover «Leer» a mañana.", seguir: "Sí, hazlo", alternativas: [{ etiqueta: "Solo la comida", texto: "Solo registra la avena" }, { etiqueta: "Otra cosa", texto: null }] };

test("confirmar_entendimiento: bien formado pasa tal cual", () => {
  const r = parsearRespuesta({ texto: "Antes de seguir:", bloques: [blq("confirmar_entendimiento", CONF)] });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques, [{ kind: "confirmar_entendimiento", ...CONF }]);
});

test("confirmar_entendimiento: límites y marcado", () => {
  for (const malo of [
    { ...CONF, entendi: "" },
    { ...CONF, entendi: "x".repeat(301) },
    { ...CONF, seguir: "x".repeat(41) },
    { ...CONF, alternativas: [1, 2, 3, 4].map(() => ({ etiqueta: "a", texto: null })) },
    { ...CONF, alternativas: [{ etiqueta: "", texto: null }] }
  ]) {
    const r = parsearRespuesta({ texto: "x", bloques: [blq("confirmar_entendimiento", malo)] });
    assert.strictEqual(r.ok && r.value.bloques.length, 0, JSON.stringify(malo).slice(0, 80));
  }
});

test("Confirmación y propuestas en el mismo turno: solo la confirmación (Review Focus 1)", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [blq("propuesta_cambio", { cambios: [{ operacion: "crear", tabla: "tasks", campos: { title: "X" } }] }), blq("confirmar_entendimiento", CONF)]
  });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques.map((b) => b.kind), ["confirmar_entendimiento"]);
  assert.ok(r.ok && r.value.descartados.some((d) => d.includes("pregunta primero")));
});

test("recordar: bien formado; ámbito fuera de la lista, vacío, largo o con cifras: fuera", () => {
  const ok = parsearRespuesta({ texto: "x", bloques: [blq("recordar", { texto: "Prefiere registrar comidas en gramos", ambito: "preference" })] });
  assert.deepStrictEqual(ok.ok && ok.value.bloques, [{ kind: "recordar", texto: "Prefiere registrar comidas en gramos", ambito: "preference" }]);
  for (const malo of [
    { texto: "x", ambito: "gustos" },
    { texto: "", ambito: "preference" },
    { texto: "x".repeat(201), ambito: "preference" },
    { texto: "Ahorra $3,000 al mes", ambito: "finance" }
  ]) {
    const r = parsearRespuesta({ texto: "x", bloques: [blq("recordar", malo)] });
    assert.strictEqual(r.ok && r.value.bloques.length, 0, JSON.stringify(malo));
  }
});

test("Dos recordar o dos confirmaciones: solo el primero (Review Focus 2)", () => {
  const r = parsearRespuesta({
    texto: "x",
    bloques: [
      blq("recordar", { texto: "Uno", ambito: "preference" }),
      blq("recordar", { texto: "Dos", ambito: "preference" }),
      blq("confirmar_entendimiento", CONF),
      blq("confirmar_entendimiento", { ...CONF, entendi: "Otra" })
    ]
  });
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.value.bloques.map((b) => (b.kind === "recordar" ? b.texto : b.kind === "confirmar_entendimiento" ? b.entendi : b.kind)), ["Uno", CONF.entendi]);
});

test("Texto hasta 2000 caracteres", () => {
  const r = parsearRespuesta({ texto: "a".repeat(2500), bloques: [] });
  assert.strictEqual(r.ok && r.value.texto.length, 2000);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-contrato.test.ts`
Expected: FAIL (bloques desconocidos, texto recortado a 600).

- [ ] **Step 3: Implement** in `src/lib/domain/centro/agente/contrato.ts`:

1. Import: `import { MEMORY_SCOPES, type MemoryScope } from "../../insights/memory.ts";`
2. Topes: `export const MAX_BLOQUES = 6;` y `export const MAX_TEXTO = 2000;` (sustituye `const MAX_TEXTO = 600;`).
3. `KINDS_DEL_AGENTE`: añadir `"confirmar_entendimiento", "recordar"` justo después de `"propuesta_cambio"`.
4. Esquemas (después de `ESQUEMA_PROPUESTA_CAMBIO`):

```ts
/**
 * «¿Entendí bien?» (D-204). Se usa cuando la petición es ambigua, toca varias
 * cosas, borra algo o interpreta lo que la persona no dijo. En el mismo turno
 * no se proponen cambios: `parsearRespuesta` los quita.
 */
const ESQUEMA_CONFIRMAR = z
  .object({
    entendi: z.string().trim().min(1).max(300),
    seguir: z.string().trim().min(1).max(40),
    alternativas: z
      .array(z.object({ etiqueta: z.string().trim().min(1).max(40), texto: z.string().trim().min(1).max(300).nullable() }).strict())
      .max(3)
  })
  .strict();

/**
 * Una preferencia que el Centro dedujo y guarda SIN preguntar (D-204, decisión
 * de la persona). Va a `memory_items` con `origin = 'centro'`, visible y
 * borrable en /intelligence/memory. Sin cifras de dinero ni porcentajes: una
 * memoria es un gusto, no un dato.
 */
const ESQUEMA_RECORDAR = z
  .object({
    texto: z.string().trim().min(1).max(200),
    ambito: z.enum(MEMORY_SCOPES as unknown as [MemoryScope, ...MemoryScope[]])
  })
  .strict()
  .refine((r) => !tieneCifras(r.texto), { message: "lleva cifras", path: ["texto"] });
```

5. `BloqueDelAgente`: añadir
```ts
  | ({ kind: "confirmar_entendimiento" } & z.infer<typeof ESQUEMA_CONFIRMAR>)
  | ({ kind: "recordar" } & z.infer<typeof ESQUEMA_RECORDAR>)
```
6. En la cadena de ternarios de `parsearBloque`, antes de `: null`:
```ts
                : kind === "confirmar_entendimiento"
                  ? ESQUEMA_CONFIRMAR
                  : kind === "recordar"
                    ? ESQUEMA_RECORDAR
```
7. En `parsearRespuesta`, sustituir el `return { ok: true, value: { texto, bloques, descartados } };` por:

```ts
  return { ok: true, value: { texto, bloques: reglasDelTurno(bloques, descartados), descartados } };
```
y añadir encima de `parsearRespuesta`:

```ts
/**
 * Reglas entre bloques (D-204), después de validar cada uno:
 *  - Si el turno pregunta «¿entendí bien?», no propone cambios a la vez.
 *  - Una sola confirmación y un solo `recordar` por turno: el primero.
 */
function reglasDelTurno(bloques: BloqueDelAgente[], descartados: string[]): BloqueDelAgente[] {
  let salida = bloques;
  if (salida.some((b) => b.kind === "confirmar_entendimiento") && salida.some((b) => b.kind === "propuesta_cambio")) {
    descartados.push("«propuesta_cambio»: el turno pregunta primero.");
    salida = salida.filter((b) => b.kind !== "propuesta_cambio");
  }
  for (const kind of ["confirmar_entendimiento", "recordar"] as const) {
    const primero = salida.findIndex((b) => b.kind === kind);
    if (primero === -1) continue;
    const antes = salida.length;
    salida = salida.filter((b, i) => b.kind !== kind || i === primero);
    if (salida.length < antes) descartados.push(`«${kind}»: solo uno por turno.`);
  }
  return salida;
}
```
8. `ESQUEMA_RESPUESTA.properties.texto.description`: `"Lo que haga falta, hasta cuatro párrafos cortos; breve si basta."`

- [ ] **Step 4: Run tests**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-contrato.test.ts`, luego `pnpm test:unit`.
Expected: PASS. Si un test existente dependía del tope viejo de bloques o de texto (p. ej. «Más de 4 bloques»), ajusta solo el número usando `MAX_BLOQUES`/`MAX_TEXTO`, sin cambiar lo que prueba.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/agente/contrato.ts tests/domain/centro-agente-contrato.test.ts
git commit -m "D-204: respuestas más largas y los bloques confirmar_entendimiento y recordar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: La sección `confirmarEntendimiento`

**Files:**
- Create: `src/lib/domain/centro/agente/entendimiento.ts`
- Modify: `src/lib/domain/centro/runtime/secciones.ts`, `src/lib/domain/centro/runtime/validador.ts`
- Modify: `tests/domain/centro-agente-catalogo.test.ts`, `tests/domain/centro-runtime-catalogo.test.ts` (conteo de kinds 33 → 34 y lista de kinds verificados si la hay)
- Test: `tests/domain/centro-agente-entendimiento.test.ts`

**Interfaces:**
- Consumes: variante `confirmar_entendimiento` de `BloqueDelAgente` (Task 1).
- Produces:
  - Kind `"confirmarEntendimiento"` con `interface DatosConfirmarEntendimiento { entendi: string; seguir: string; alternativas: { etiqueta: string; texto: string | null }[] }`.
  - `function seccionDeConfirmacion(b: { entendi: string; seguir: string; alternativas: { etiqueta: string; texto: string | null }[] }, id: string): AnySection`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-agente-entendimiento.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { seccionDeConfirmacion } from "../../src/lib/domain/centro/agente/entendimiento.ts";
import { validarPorSeccion } from "../../src/lib/domain/centro/runtime/validador.ts";

const b = { entendi: "Quieres registrar la avena.", seguir: "Sí, hazlo", alternativas: [{ etiqueta: "Otra cosa", texto: null }] };

test("La confirmación se vuelve sección y pasa el validador", () => {
  const s = seccionDeConfirmacion(b, "b0");
  assert.deepStrictEqual(s, { id: "b0", kind: "confirmarEntendimiento", data: b });
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
});

test("Marcado en el texto: el validador la tumba (no se pinta HTML del modelo)", () => {
  const s = seccionDeConfirmacion({ ...b, entendi: "<b>hola</b>" }, "b0");
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-entendimiento.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implement**

`src/lib/domain/centro/runtime/secciones.ts`: en `SECTION_KINDS`, tras `"propuestaCambio"`:
```ts
  "propuestaCambio",
  // D-204: «¿entendí bien?» antes de proponer cuando hay duda.
  "confirmarEntendimiento"
```
Tras `DatosPropuestaCambio`:
```ts
export interface DatosConfirmarEntendimiento {
  entendi: string;
  seguir: string;
  alternativas: { etiqueta: string; texto: string | null }[];
}
```
En `DatosPorKind`: `confirmarEntendimiento: DatosConfirmarEntendimiento;`

`src/lib/domain/centro/runtime/validador.ts`, tras la entrada `propuestaCambio`:
```ts
  confirmarEntendimiento: z
    .object({
      entendi: texto(300),
      seguir: texto(40),
      alternativas: z.array(z.object({ etiqueta: texto(40), texto: texto(300).nullable() }).strict()).max(3)
    })
    .strict(),
```

`src/lib/domain/centro/agente/entendimiento.ts`:
```ts
// src/lib/domain/centro/agente/entendimiento.ts
// Del bloque «¿entendí bien?» a su sección (D-204). Puro, probado en
// tests/domain/centro-agente-entendimiento.test.ts.
import type { AnySection } from "../runtime/types.ts";

export function seccionDeConfirmacion(
  b: { entendi: string; seguir: string; alternativas: { etiqueta: string; texto: string | null }[] },
  id: string
): AnySection {
  return { id, kind: "confirmarEntendimiento", data: { entendi: b.entendi, seguir: b.seguir, alternativas: b.alternativas } };
}
```

Actualizar el conteo de kinds en los dos tests de catálogo (33 → 34) y, si `centro-runtime-catalogo.test.ts` lista los kinds con componente o esquema, añadir `"confirmarEntendimiento"`.

- [ ] **Step 4: Run tests**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-entendimiento.test.ts tests/domain/centro-agente-catalogo.test.ts tests/domain/centro-runtime-catalogo.test.ts tests/domain/centro-runtime-validador.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/agente/entendimiento.ts src/lib/domain/centro/runtime/secciones.ts src/lib/domain/centro/runtime/validador.ts tests/domain/centro-agente-entendimiento.test.ts tests/domain/centro-agente-catalogo.test.ts tests/domain/centro-runtime-catalogo.test.ts
git commit -m "D-204: la sección confirmarEntendimiento

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: La memoria del Centro (0079, contexto separado y cómo se guarda)

**Files:**
- Create: `supabase/migrations/0079_memoria_del_centro.sql`, `supabase/tests/0049_memoria_del_centro.sql`
- Create: `src/lib/domain/centro/agente/recordar.ts`
- Modify: `src/lib/domain/insights/memory.ts` (`MemoryOrigin`), `src/lib/insights/context.ts` (`InsightContext.memoriaCentro`, `buildContext`, `textoDelContexto`), `src/app/(app)/intelligence/memory/page.tsx`
- Test: `tests/domain/centro-agente-recordar.test.ts`, añadir a `tests/domain/insights-context.test.ts`

**Interfaces:**
- Produces:
  - `MemoryOrigin = "user" | "ai" | "centro"`.
  - `InsightContext.memoriaCentro?: string[]` — memorias vigentes de origen `centro`; `memory` ya NO las incluye. Solo se añade la propiedad si hay alguna.
  - `normalizarMemoria(t: string): string` (minúsculas, sin acentos, espacios colapsados, sin puntuación final).
  - `planDeRecordar(nuevo: { texto: string; ambito: MemoryScope }, existentes: { id: string; text: string; origin: string; created_at: string; valid_until: string | null }[], hoy: string): { accion: "omitir"; motivo: string } | { accion: "guardar"; fila: { text: string; scope: MemoryScope; origin: "centro"; valid_until: string }; borrar: string[] }`
  - `MAX_MEMORIA_CENTRO = 20`, `DIAS_MEMORIA_CENTRO = 90`.

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/centro-agente-recordar.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarMemoria, planDeRecordar, MAX_MEMORIA_CENTRO } from "../../src/lib/domain/centro/agente/recordar.ts";

const HOY = "2026-09-26";
const fila = (i: number, origin = "centro", valid_until: string | null = "2026-12-01") => ({
  id: `m${i}`, text: `Memoria ${i}`, origin, created_at: `2026-09-${String(10 + (i % 15)).padStart(2, "0")}T00:00:00Z`, valid_until
});

test("normalizarMemoria: acentos, mayúsculas, espacios y punto final no cuentan", () => {
  assert.strictEqual(normalizarMemoria("  Prefiero  los GRAMOS.  "), normalizarMemoria("prefiero los gramos"));
  assert.strictEqual(normalizarMemoria("Cafeína"), "cafeina");
});

test("Guardar: fila con origin centro y caducidad a 90 días", () => {
  const r = planDeRecordar({ texto: "Prefiere gramos", ambito: "preference" }, [], HOY);
  assert.deepStrictEqual(r, { accion: "guardar", fila: { text: "Prefiere gramos", scope: "preference", origin: "centro", valid_until: "2026-12-25" }, borrar: [] });
});

test("Duplicado de una memoria de la persona (normalizado): se omite (Review Focus 3)", () => {
  const r = planDeRecordar({ texto: "prefiere  GRAMOS.", ambito: "preference" }, [{ id: "u1", text: "Prefiere gramos", origin: "user", created_at: "2026-01-01T00:00:00Z", valid_until: null }], HOY);
  assert.deepStrictEqual(r, { accion: "omitir", motivo: "ya la recuerdo" });
});

test("Una memoria caducada no cuenta como duplicado", () => {
  const r = planDeRecordar({ texto: "Prefiere gramos", ambito: "preference" }, [{ id: "c1", text: "Prefiere gramos", origin: "centro", created_at: "2026-01-01T00:00:00Z", valid_until: "2026-06-01" }], HOY);
  assert.strictEqual(r.accion, "guardar");
});

test("Tope: con 20 memorias del Centro vigentes se borra la más vieja del Centro, nunca las de la persona", () => {
  const existentes = [...Array.from({ length: MAX_MEMORIA_CENTRO }, (_, i) => fila(i)), fila(99, "user", null)];
  const r = planDeRecordar({ texto: "Nueva", ambito: "time" }, existentes, HOY);
  assert.ok(r.accion === "guardar");
  const masVieja = [...existentes].filter((m) => m.origin === "centro").sort((a, b) => a.created_at.localeCompare(b.created_at))[0]!;
  assert.deepStrictEqual(r.accion === "guardar" && r.borrar, [masVieja.id]);
});
```

Añadir al final de `tests/domain/insights-context.test.ts` (mira cómo construyen `buildContext` los tests existentes de ese archivo y usa la misma forma mínima de `facts`/`scope`; si hace falta un hecho, reutiliza el helper del archivo):

```ts
test("La memoria del Centro va aparte y rotulada; nunca como orden de la persona (Review Focus 4)", () => {
  const ctx = buildContext({
    scope: "global",
    facts: [],
    todayISO: "2026-09-26",
    memory: [
      { id: "u", scope: "preference", origin: "user", text: "No trabajo sábados", validUntil: null },
      { id: "c", scope: "preference", origin: "centro", text: "Prefiere gramos", validUntil: "2026-12-01" }
    ]
  });
  assert.deepStrictEqual(ctx.memory, ["No trabajo sábados"]);
  assert.deepStrictEqual(ctx.memoriaCentro, ["Prefiere gramos"]);
  const t = textoDelContexto(ctx);
  const respeta = t.slice(t.indexOf("Lo que el usuario te ha dicho"));
  assert.ok(!respeta.split("\n\n")[0]!.includes("Prefiere gramos"));
  assert.match(t, /Lo que el Centro ha notado \(puede equivocarse\):\n- Prefiere gramos/);
});
```
(Importa `buildContext` y `textoDelContexto` si el archivo aún no lo hace.)

- [ ] **Step 2: Run to verify they fail**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-recordar.test.ts tests/domain/insights-context.test.ts`
Expected: FAIL.

- [ ] **Step 3a: Migration + pgTAP**

```sql
-- supabase/migrations/0079_memoria_del_centro.sql
--
-- LA MEMORIA QUE ESCRIBE EL CENTRO SOLO (D-204).
--
-- Hasta aquí la memoria de IA solo entraba con un clic de la persona (D-089).
-- La persona decidió que el Centro aprenda solo, pero visible: sus deducciones
-- llevan su propio origen para que /intelligence/memory las marque y el
-- contexto del modelo las lea como «puede equivocarse», nunca como órdenes.
alter table public.memory_items drop constraint if exists memory_items_origin_check;
alter table public.memory_items add constraint memory_items_origin_check
  check (origin in ('user', 'ai', 'centro'));

comment on column public.memory_items.origin is
  'Quién redactó la memoria: `user` (la persona), `ai` (propuesta del chat que la persona confirmó, D-089) o `centro` (deducida por el Centro sin preguntar, caduca a los 90 días, D-204).';
```

```sql
-- supabase/tests/0049_memoria_del_centro.sql — pgTAP: migración 0079 (D-204).
begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f5555555-5555-4555-8555-555555555555', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memoria-a@test.local'),
  ('f6666666-6666-4666-8666-666666666666', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'memoria-b@test.local')
on conflict (id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'f5555555-5555-4555-8555-555555555555', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.memory_items (user_id, scope, text, origin, valid_until) values
  ('f5555555-5555-4555-8555-555555555555', 'preference', 'Prefiere gramos', 'centro', current_date + 90);
select is((select origin from public.memory_items where text = 'Prefiere gramos'), 'centro', 'El origen centro se admite (0079)');

insert into public.memory_items (user_id, scope, text, origin) values
  ('f5555555-5555-4555-8555-555555555555', 'preference', 'No trabajo sábados', 'user'),
  ('f5555555-5555-4555-8555-555555555555', 'goal', 'Correr un maratón', 'ai');
select is((select count(*)::int from public.memory_items where origin in ('user', 'ai', 'centro')), 3, 'user, ai y centro conviven');

select throws_ok(
  $$ insert into public.memory_items (user_id, scope, text, origin) values ('f5555555-5555-4555-8555-555555555555', 'preference', 'x', 'otro') $$,
  '23514', null, 'Un origen inventado se sigue rechazando'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f6666666-6666-4666-8666-666666666666', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.memory_items where origin = 'centro'), 0, 'La memoria del Centro es privada de su dueño');

select * from finish();
rollback;
```

Aplicar en local: `supabase migration up` (si propone otras migraciones distintas de la 0079 o avisa de deriva, PARA y repórtalo), luego `supabase test db`.

- [ ] **Step 3b: Domain + context**

`src/lib/domain/insights/memory.ts`: `export type MemoryOrigin = "user" | "ai" | "centro";`

`src/lib/domain/centro/agente/recordar.ts`:
```ts
// src/lib/domain/centro/agente/recordar.ts
// Cómo guarda el Centro lo que aprendió (D-204). Puro, probado en
// tests/domain/centro-agente-recordar.test.ts.
//
// SIN PREGUNTAR, PERO CON LÍMITES: caduca a los 90 días, no pasa de 20 activas
// (se va la más vieja DEL CENTRO; las de la persona no se tocan nunca) y no
// repite algo que ya está en la memoria, lo haya escrito quien lo haya escrito.
import { addDaysISO } from "../../datetime.ts";
import type { MemoryScope } from "../../insights/memory.ts";

export const MAX_MEMORIA_CENTRO = 20;
export const DIAS_MEMORIA_CENTRO = 90;

export function normalizarMemoria(t: string): string {
  return t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?¡¿;:,]+$/g, "")
    .trim();
}

interface Existente {
  id: string;
  text: string;
  origin: string;
  created_at: string;
  valid_until: string | null;
}

export function planDeRecordar(
  nuevo: { texto: string; ambito: MemoryScope },
  existentes: Existente[],
  hoy: string
):
  | { accion: "omitir"; motivo: string }
  | { accion: "guardar"; fila: { text: string; scope: MemoryScope; origin: "centro"; valid_until: string }; borrar: string[] } {
  const vigentes = existentes.filter((m) => m.valid_until === null || m.valid_until >= hoy);
  const clave = normalizarMemoria(nuevo.texto);
  if (vigentes.some((m) => normalizarMemoria(m.text) === clave)) return { accion: "omitir", motivo: "ya la recuerdo" };

  const delCentro = vigentes.filter((m) => m.origin === "centro").sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sobran = Math.max(0, delCentro.length + 1 - MAX_MEMORIA_CENTRO);
  return {
    accion: "guardar",
    fila: { text: nuevo.texto.trim(), scope: nuevo.ambito, origin: "centro", valid_until: addDaysISO(hoy, DIAS_MEMORIA_CENTRO) },
    borrar: delCentro.slice(0, sobran).map((m) => m.id)
  };
}
```

`src/lib/insights/context.ts`:
1. `InsightContext`: tras `memory: string[];`
```ts
  /**
   * Lo que el Centro dedujo solo (D-204, `origin = 'centro'`). Va APARTE de
   * `memory` —que es lo que la persona dijo y hay que respetar—: una
   * deducción nunca pesa como una orden. Ausente si no hay ninguna.
   */
  memoriaCentro?: string[];
```
2. En `buildContext`, sustituir la construcción de `memory` por:
```ts
  const vigentes = input.memory && input.todayISO ? activeMemory(input.memory, input.scope, input.todayISO) : [];
  const memory = vigentes.filter((m) => m.origin !== "centro").map((m) => m.text);
  const memoriaCentro = vigentes.filter((m) => m.origin === "centro").map((m) => m.text);
```
y en el objeto devuelto, junto a `memory,`, añadir `...(memoriaCentro.length ? { memoriaCentro } : {}),`.
3. En `textoDelContexto`, justo después del bloque de `context.memory`:
```ts
  if (context.memoriaCentro?.length) {
    partes.push(`Lo que el Centro ha notado (puede equivocarse):\n${context.memoriaCentro.map((m) => `- ${m}`).join("\n")}`);
  }
```

`src/app/(app)/intelligence/memory/page.tsx`: junto al chip de `origin === "ai"`:
```tsx
              {m.origin === "centro" && <Chip kind="purple">Lo notó el Centro</Chip>}
```

- [ ] **Step 4: Run tests**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-recordar.test.ts tests/domain/insights-context.test.ts`, `pnpm typecheck`, `pnpm test:unit`, `supabase test db`.
Expected: todo verde (0049 4/4).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0079_memoria_del_centro.sql supabase/tests/0049_memoria_del_centro.sql src/lib/domain/centro/agente/recordar.ts src/lib/domain/insights/memory.ts src/lib/insights/context.ts "src/app/(app)/intelligence/memory/page.tsx" tests/domain/centro-agente-recordar.test.ts tests/domain/insights-context.test.ts
git commit -m "D-204: la memoria del Centro, aparte y rotulada (0079)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: El resumen de resultados

**Files:**
- Create: `src/lib/domain/centro/agente/resultados.ts`, `src/lib/centro/agente/resultados.ts`
- Test: `tests/domain/centro-agente-resultados.test.ts`

**Interfaces:**
- Consumes: `ESCRITURA_POR_TABLA` (`src/lib/domain/centro/escritura/registro.ts`) para las etiquetas.
- Produces:
  - `interface EntradaResultados { propuestas: { tipo: string; status: "accepted" | "dismissed"; tabla?: string; operacion?: string }[]; correcciones: { tabla: string; campos: string[] }[]; entendimiento: { resultado: string; tabla?: string; operacion?: string }[] }`
  - `resumirResultados(e: EntradaResultados): string[]` (≤ 12 líneas, ordenadas por volumen)
  - `MAX_LINEAS_RESULTADOS = 12`, `DIAS_RESULTADOS = 30`
  - Servidor: `cargarResultados(supabase: Db, userId: string, hoy: string): Promise<string[]>`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-agente-resultados.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirResultados, MAX_LINEAS_RESULTADOS } from "../../src/lib/domain/centro/agente/resultados.ts";

test("Agrupa propuestas por tipo o por tabla+operación, con guardadas y descartadas", () => {
  const l = resumirResultados({
    propuestas: [
      { tipo: "cambio", status: "accepted", tabla: "food_entries", operacion: "crear" },
      { tipo: "cambio", status: "accepted", tabla: "food_entries", operacion: "crear" },
      { tipo: "cambio", status: "dismissed", tabla: "food_entries", operacion: "crear" },
      { tipo: "bloque", status: "dismissed" },
      { tipo: "bloque", status: "dismissed" }
    ],
    correcciones: [],
    entendimiento: []
  });
  assert.deepStrictEqual(l, [
    "Crear · Comida: guardaste 2, descartaste 1.",
    "Bloque de tiempo: guardaste 0, descartaste 2."
  ]);
});

test("Correcciones por campo con su etiqueta, y los malentendidos", () => {
  const l = resumirResultados({
    propuestas: [],
    correcciones: [{ tabla: "food_entries", campos: ["grams"] }, { tabla: "food_entries", campos: ["grams", "meal"] }],
    entendimiento: [
      { resultado: "malentendido", tabla: "tasks", operacion: "editar" },
      { resultado: "seguir" },
      { resultado: "seguir" },
      { resultado: "alternativa" }
    ]
  });
  // Orden por volumen: confirmaciones (3) > «Gramos» (2) > el resto (1), y a
  // igual volumen, en el orden en que se arman.
  assert.deepStrictEqual(l, [
    "Confirmaste que te entendí 2 veces; elegiste otra opción 1 vez.",
    "Corregiste «Gramos» (Comida) 2 veces antes de guardar.",
    "Corregiste «Comida» (Comida) 1 vez antes de guardar.",
    "Me dijiste «No es esto» 1 vez (Cambiar · Tarea)."
  ]);
});

test("Nunca más de 12 líneas; vacío si no hay nada", () => {
  const propuestas = Array.from({ length: 30 }, (_, i) => ({ tipo: `t${i}`, status: "accepted" as const }));
  assert.strictEqual(resumirResultados({ propuestas, correcciones: [], entendimiento: [] }).length, MAX_LINEAS_RESULTADOS);
  assert.deepStrictEqual(resumirResultados({ propuestas: [], correcciones: [], entendimiento: [] }), []);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-resultados.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/domain/centro/agente/resultados.ts
// Cómo le fue a la persona con lo que el Centro propuso (D-204). Puro, probado
// en tests/domain/centro-agente-resultados.test.ts.
//
// Es la señal de aprendizaje: el modelo la lee en cada turno y decide si hay
// una preferencia que recordar. Solo conteos y etiquetas: ninguna cifra ni
// texto de los datos de la persona.
import { ESCRITURA_POR_TABLA, type EntradaDeEscritura } from "../escritura/registro.ts";

export const MAX_LINEAS_RESULTADOS = 12;
export const DIAS_RESULTADOS = 30;

export interface EntradaResultados {
  propuestas: { tipo: string; status: "accepted" | "dismissed"; tabla?: string; operacion?: string }[];
  correcciones: { tabla: string; campos: string[] }[];
  entendimiento: { resultado: string; tabla?: string; operacion?: string }[];
}

const TIPO: Record<string, string> = { tarea: "Tarea", bloque: "Bloque de tiempo", foco: "Foco", nota: "Nota", rutina: "Rutina", meta: "Meta" };
const VERBO: Record<string, string> = { crear: "Crear", editar: "Cambiar", borrar: "Borrar" };

const registro = ESCRITURA_POR_TABLA as Record<string, EntradaDeEscritura>;
const etiquetaTabla = (t: string) => registro[t]?.etiqueta ?? t;
const etiquetaCampo = (t: string, c: string) => registro[t]?.campos[c]?.etiqueta ?? c;
const veces = (n: number) => (n === 1 ? "1 vez" : `${n} veces`);

export function resumirResultados(e: EntradaResultados): string[] {
  const lineas: { peso: number; texto: string }[] = [];

  const grupos = new Map<string, { ok: number; no: number }>();
  for (const p of e.propuestas) {
    const clave = p.tipo === "cambio" && p.tabla && p.operacion ? `${VERBO[p.operacion] ?? p.operacion} · ${etiquetaTabla(p.tabla)}` : (TIPO[p.tipo] ?? p.tipo);
    const g = grupos.get(clave) ?? { ok: 0, no: 0 };
    if (p.status === "accepted") g.ok += 1;
    else g.no += 1;
    grupos.set(clave, g);
  }
  for (const [clave, g] of grupos) lineas.push({ peso: g.ok + g.no, texto: `${clave}: guardaste ${g.ok}, descartaste ${g.no}.` });

  const campos = new Map<string, { tabla: string; campo: string; n: number }>();
  for (const c of e.correcciones) {
    for (const campo of c.campos) {
      const clave = `${c.tabla}.${campo}`;
      const v = campos.get(clave) ?? { tabla: c.tabla, campo, n: 0 };
      v.n += 1;
      campos.set(clave, v);
    }
  }
  for (const v of campos.values()) {
    lineas.push({ peso: v.n, texto: `Corregiste «${etiquetaCampo(v.tabla, v.campo)}» (${etiquetaTabla(v.tabla)}) ${veces(v.n)} antes de guardar.` });
  }

  const seguir = e.entendimiento.filter((x) => x.resultado === "seguir").length;
  const otra = e.entendimiento.filter((x) => x.resultado === "alternativa" || x.resultado === "otra").length;
  if (seguir + otra > 0) lineas.push({ peso: seguir + otra, texto: `Confirmaste que te entendí ${veces(seguir)}; elegiste otra opción ${veces(otra)}.` });

  const malos = new Map<string, number>();
  for (const x of e.entendimiento) {
    if (x.resultado !== "malentendido") continue;
    const clave = x.tabla && x.operacion ? `${VERBO[x.operacion] ?? x.operacion} · ${etiquetaTabla(x.tabla)}` : "sin detalle";
    malos.set(clave, (malos.get(clave) ?? 0) + 1);
  }
  for (const [clave, n] of malos) lineas.push({ peso: n, texto: `Me dijiste «No es esto» ${veces(n)} (${clave}).` });

  // Orden estable: por volumen, y a igual volumen en el orden en que se armaron.
  return lineas
    .map((l, i) => ({ ...l, i }))
    .sort((a, b) => b.peso - a.peso || a.i - b.i)
    .slice(0, MAX_LINEAS_RESULTADOS)
    .map((l) => l.texto);
}
```

```ts
// src/lib/centro/agente/resultados.ts
// Lee la señal de aprendizaje con la sesión (D-204). SERVIDOR.
import "server-only";
import type { Db } from "@/lib/insights/facts-loader";
import { addDaysISO } from "@/lib/domain/datetime.ts";
import { resumirResultados, DIAS_RESULTADOS, type EntradaResultados } from "@/lib/domain/centro/agente/resultados.ts";

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export async function cargarResultados(supabase: Db, userId: string, hoy: string): Promise<string[]> {
  const desde = addDaysISO(hoy, -DIAS_RESULTADOS);
  const [{ data: propuestas }, { data: eventos }] = await Promise.all([
    supabase
      .from("coach_proposals")
      .select("tipo, status, payload")
      .eq("user_id", userId)
      .eq("origen", "centro")
      .in("status", ["accepted", "dismissed"])
      .gte("created_at", desde)
      .limit(200),
    supabase
      .from("audit_log")
      .select("action, meta")
      .eq("user_id", userId)
      .in("action", ["ai.centro_escritura", "ai.centro_entendimiento"])
      .gte("created_at", desde)
      .limit(200)
  ]);

  const entrada: EntradaResultados = {
    propuestas: (propuestas ?? []).map((p) => {
      const pl = obj(p.payload);
      return { tipo: p.tipo, status: p.status as "accepted" | "dismissed", tabla: str(pl.tabla), operacion: str(pl.operacion) };
    }),
    correcciones: (eventos ?? [])
      .filter((e) => e.action === "ai.centro_escritura")
      .map((e) => {
        const m = obj(e.meta);
        const campos = Array.isArray(m.corregidos) ? m.corregidos.filter((c): c is string => typeof c === "string") : [];
        return { tabla: str(m.tabla) ?? "", campos };
      })
      .filter((c) => c.tabla && c.campos.length),
    entendimiento: (eventos ?? [])
      .filter((e) => e.action === "ai.centro_entendimiento")
      .map((e) => {
        const m = obj(e.meta);
        return { resultado: str(m.resultado) ?? "", tabla: str(m.tabla), operacion: str(m.operacion) };
      })
      .filter((x) => x.resultado)
  };
  return resumirResultados(entrada);
}
```

- [ ] **Step 4: Run tests**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-resultados.test.ts`, `pnpm typecheck`.
Expected: PASS. Si `tsc` se queja del tipo de `status` o `meta`, castea solo en esas líneas.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/agente/resultados.ts src/lib/centro/agente/resultados.ts tests/domain/centro-agente-resultados.test.ts
git commit -m "D-204: el resumen de cómo te fue con las propuestas del Centro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Chips de capacidades

**Files:**
- Create: `src/lib/domain/centro/agente/chips.ts`, `src/app/api/centro/chips/route.ts`
- Test: `tests/domain/centro-agente-chips.test.ts`

**Interfaces:**
- Consumes: `Domain` (`src/lib/domain/insights/types.ts`), `Franja` (`src/lib/domain/centro/franja.ts`).
- Produces:
  - `interface Chip { id: string; dominio: Domain | null; texto: string; franja?: Franja }`
  - `CAPACIDADES_VISIBLES: readonly Chip[]`, `IDS_DE_CHIPS: ReadonlySet<string>`
  - `elegirChips(e: { dominios: readonly Domain[]; franja: Franja; usos: Record<string, number> }): { id: string; texto: string }[]` (máx. 6)
  - `GET /api/centro/chips` → `{ ok: true, chips: { id: string; texto: string }[] }` (404 sin flag runtime, 401 sin sesión)

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-agente-chips.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CAPACIDADES_VISIBLES, elegirChips } from "../../src/lib/domain/centro/agente/chips.ts";

test("Cada chip tiene id único y texto corto", () => {
  const ids = CAPACIDADES_VISIBLES.map((c) => c.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const c of CAPACIDADES_VISIBLES) assert.ok(c.texto.length <= 60, c.id);
});

test("Nunca un chip de un dominio apagado (Review Focus 5)", () => {
  const chips = elegirChips({ dominios: ["execution"], franja: "manana", usos: {} });
  const porId = new Map(CAPACIDADES_VISIBLES.map((c) => [c.id, c]));
  for (const c of chips) {
    const d = porId.get(c.id)!.dominio;
    assert.ok(d === null || d === "execution", c.id);
  }
});

test("La franja filtra: de mañana no sale «Registra lo que cené»", () => {
  const ids = elegirChips({ dominios: ["nutrition", "execution", "money", "growth"], franja: "manana", usos: {} }).map((c) => c.id);
  assert.ok(!ids.includes("cena"));
});

test("Lo más usado va primero; como mucho seis", () => {
  const chips = elegirChips({ dominios: ["nutrition", "execution", "money", "growth"], franja: "tarde", usos: { inversiones: 5, macros: 2 } });
  assert.deepStrictEqual(chips.slice(0, 2).map((c) => c.id), ["inversiones", "macros"]);
  assert.ok(chips.length <= 6);
});

test("Sin dominios activos quedan solo los generales", () => {
  const chips = elegirChips({ dominios: [], franja: "manana", usos: {} });
  assert.ok(chips.length >= 1);
  const porId = new Map(CAPACIDADES_VISIBLES.map((c) => [c.id, c]));
  for (const c of chips) assert.strictEqual(porId.get(c.id)!.dominio, null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-chips.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/domain/centro/agente/chips.ts
// Lo que el Centro sabe hacer, en frases de ejemplo (D-204). Puro, probado en
// tests/domain/centro-agente-chips.test.ts.
//
// SOLO LO QUE YA SABE HACER. Un chip que el Centro no puede cumplir enseña
// una capacidad falsa. Cuando lleguen el resto de tablas (B) y el diario (C),
// sus chips entran aquí.
import type { Domain } from "../../insights/types.ts";
import type { Franja } from "../franja.ts";

export interface Chip {
  id: string;
  dominio: Domain | null;
  texto: string;
  franja?: Franja;
}

export const CAPACIDADES_VISIBLES: readonly Chip[] = [
  { id: "hoy", dominio: null, texto: "¿Qué hago hoy?", franja: "manana" },
  { id: "cierre", dominio: null, texto: "¿Cómo me fue hoy?", franja: "noche" },
  { id: "desayuno", dominio: "nutrition", texto: "Registra lo que desayuné", franja: "manana" },
  { id: "comida", dominio: "nutrition", texto: "Registra lo que comí", franja: "tarde" },
  { id: "cena", dominio: "nutrition", texto: "Registra lo que cené", franja: "noche" },
  { id: "macros", dominio: "nutrition", texto: "¿Cómo voy con mis macros hoy?" },
  { id: "tarea-nueva", dominio: "execution", texto: "Apunta una tarea en mi proyecto" },
  { id: "pendientes", dominio: "execution", texto: "¿Qué tareas tengo pendientes?" },
  { id: "nota", dominio: "execution", texto: "Guarda una nota en mi cuaderno" },
  { id: "inversiones", dominio: "money", texto: "¿Cómo van mis inversiones?" },
  { id: "aportacion", dominio: "money", texto: "Registra una aportación a mi inversión" },
  { id: "watchlist", dominio: "money", texto: "¿Cómo está mi watchlist?" },
  { id: "metas", dominio: "growth", texto: "¿Qué metas tengo activas?" }
];

export const IDS_DE_CHIPS: ReadonlySet<string> = new Set(CAPACIDADES_VISIBLES.map((c) => c.id));

const MAX_CHIPS = 6;

export function elegirChips(e: { dominios: readonly Domain[]; franja: Franja; usos: Record<string, number> }): { id: string; texto: string }[] {
  return CAPACIDADES_VISIBLES.map((c, i) => ({ c, i }))
    .filter(({ c }) => (c.dominio === null || e.dominios.includes(c.dominio)) && (!c.franja || c.franja === e.franja))
    .sort((a, b) => (e.usos[b.c.id] ?? 0) - (e.usos[a.c.id] ?? 0) || a.i - b.i)
    .slice(0, MAX_CHIPS)
    .map(({ c }) => ({ id: c.id, texto: c.texto }));
}
```

```ts
// src/app/api/centro/chips/route.ts
import { NextResponse } from "next/server";
import { flagsDelRuntime } from "@/config/env";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/data/session";
import { getUserTimeZone } from "@/lib/data/profile";
import { hourInTimeZone, addDaysISO } from "@/lib/domain/datetime.ts";
import { todayLocal } from "@/lib/data/dates";
import { franjaDeHoy } from "@/lib/domain/centro/franja.ts";
import { allowedDomains } from "@/lib/insights/context";
import { elegirChips } from "@/lib/domain/centro/agente/chips.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";

/**
 * Los chips de capacidades del Centro (D-204). Sin modelo: catálogo filtrado
 * por los dominios de la persona y la franja, ordenado por lo que más pulsa.
 * Un extra: si algo falla, `chips: []` y el Centro abre igual.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  if (!flagsDelRuntime().runtime) return NextResponse.json({ ok: false, reason: "No encontrado." }, { status: 404 });
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, reason: "Sin sesión." }, { status: 401 });
  try {
    const supabase = await createClient();
    const zona = await getUserTimeZone();
    const hoy = todayLocal(zona);
    const [{ data: perfil }, { data: clics }] = await Promise.all([
      supabase.from("profiles").select("ai_domains").eq("user_id", user.id).single(),
      supabase
        .from("audit_log")
        .select("meta")
        .eq("user_id", user.id)
        .eq("action", "ai.centro_chip")
        .gte("created_at", addDaysISO(hoy, -30))
        .limit(500)
    ]);
    const activos = (perfil?.ai_domains ?? []) as Domain[];
    const dominios = allowedDomains("global").filter((d) => activos.includes(d));
    const usos: Record<string, number> = {};
    for (const c of clics ?? []) {
      const id = (c.meta as { id?: unknown } | null)?.id;
      if (typeof id === "string") usos[id] = (usos[id] ?? 0) + 1;
    }
    return NextResponse.json({ ok: true, chips: elegirChips({ dominios, franja: franjaDeHoy(hourInTimeZone(zona)), usos }) });
  } catch (e) {
    console.warn("[centro-agente] chips:", e);
    return NextResponse.json({ ok: true, chips: [] });
  }
}
```
(Si `todayLocal` o `addDaysISO` viven en otro módulo, usa los que ya importa `src/lib/ai-chat/cerebro.ts` / `src/app/api/centro/route.ts`.)

- [ ] **Step 4: Run tests**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-chips.test.ts`, `pnpm typecheck`, `pnpm lint`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/agente/chips.ts src/app/api/centro/chips/route.ts tests/domain/centro-agente-chips.test.ts
git commit -m "D-204: los chips de capacidades del Centro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: El prompt y el turno (confirmación, recordar, resultados)

**Files:**
- Modify: `src/lib/domain/centro/agente/prompt.ts`, `tests/domain/centro-agente-prompt.test.ts`
- Modify: `src/lib/centro/agente/pensar.ts`

**Interfaces:**
- Consumes: Task 1 (bloques), Task 2 (`seccionDeConfirmacion`), Task 3 (`planDeRecordar`), Task 4 (`cargarResultados`).
- Produces: `promptDelTurno(e: { contexto: string; historial: …; texto: string; resultados?: string[] })`.

- [ ] **Step 1: Write the failing test** — añadir a `tests/domain/centro-agente-prompt.test.ts`:

```ts
test("El system pide respuestas más largas, explica la confirmación y recordar", () => {
  assert.ok(!SYSTEM_AGENTE.includes("1–3 frases"));
  assert.match(SYSTEM_AGENTE, /hasta cuatro párrafos/);
  for (const k of ["confirmar_entendimiento", "recordar"]) assert.ok(SYSTEM_AGENTE.includes(`«${k}»`), k);
  assert.match(SYSTEM_AGENTE, /no propongas cambios en ese turno/i);
  assert.match(SYSTEM_AGENTE, /Lo tendré en cuenta/);
});

test("El prompt lleva los resultados recientes cuando los hay", () => {
  const p = promptDelTurno({ contexto: "CTX", historial: [], texto: "hola", resultados: ["Crear · Comida: guardaste 2, descartaste 1."] });
  assert.match(p, /Cómo te fue con mis propuestas \(últimos 30 días\):\n- Crear · Comida/);
  assert.ok(p.indexOf("Cómo te fue") < p.indexOf("Persona: hola"));
  assert.ok(!promptDelTurno({ contexto: "CTX", historial: [], texto: "hola" }).includes("Cómo te fue"));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-prompt.test.ts`
Expected: FAIL.

- [ ] **Step 3a: Prompt** (`src/lib/domain/centro/agente/prompt.ts`):

1. Segunda línea de `SYSTEM_AGENTE`, sustituir:
`Cada turno devuelves "texto" (1–3 frases, cálidas y concretas, en español) y hasta ${MAX_BLOQUES} "bloques".`
por
`Cada turno devuelves "texto" (en español, cálido y concreto: lo que haga falta, hasta cuatro párrafos cortos; breve si basta) y hasta ${MAX_BLOQUES} "bloques".`
2. Después del párrafo «ANTES DE DIBUJAR, LEE…», añadir un párrafo nuevo:
```
¿ENTENDISTE BIEN? Si la petición es ambigua, implica más de un cambio, incluye un borrado, o vas a interpretar algo que la persona no dijo, primero devuelve «confirmar_entendimiento» y no propongas cambios en ese turno. Si es clara, propón directamente. En "alternativas" ofrece otras posibilidades útiles que la persona quizá no pensó.
```
3. En «Bloques de acción», añadir tras la línea de «propuesta_cambio»:
```
- «confirmar_entendimiento»: { "entendi": lo que entendiste en una frase, "seguir": texto del botón para seguir (p. ej. "Sí, hazlo"), "alternativas": [{ "etiqueta", "texto": lo que se enviaría | null para "otra cosa" }] (0–3) }.
- «recordar»: { "texto": una preferencia que dedujiste (sin cifras de dinero ni porcentajes), "ambito": "preference"|"time"|"habit"|"health"|"goal"|"project"|"finance"|"decision" }. Solo cuando "Cómo te fue con mis propuestas" o la conversación muestran un patrón claro; uno por turno como mucho. Se guarda sin preguntar, así que dilo en "texto": «Lo tendré en cuenta: …».
```
4. `promptDelTurno`: añadir `resultados?: string[]` a la entrada y, entre el contexto y el hilo:
```ts
  const aprendido = e.resultados?.length ? `\nCómo te fue con mis propuestas (últimos 30 días):\n${e.resultados.map((l) => `- ${l}`).join("\n")}` : "";
  return [e.contexto, aprendido, hilo ? `\nConversación hasta ahora:\n${hilo}` : "", `\nPersona: ${e.texto}`].join("\n");
```

- [ ] **Step 3b: El turno** (`src/lib/centro/agente/pensar.ts`):

1. Imports:
```ts
import { cargarResultados } from "./resultados";
import { seccionDeConfirmacion } from "@/lib/domain/centro/agente/entendimiento.ts";
import { planDeRecordar } from "@/lib/domain/centro/agente/recordar.ts";
```
2. `CENTRO_AGENTE_BUDGET`: `maxOutputTokens: 6000`.
3. En `pensarTurno`, tras `if (!cerebro) return …`:
```ts
    const resultados = await cargarResultados(cerebro.supabase, cerebro.user.id, cerebro.today).catch((e: unknown) => {
      console.warn("[centro-agente] resultados:", e);
      return [] as string[];
    });
```
y pasar `resultados` a `promptDelTurno({ …, resultados })`.
4. En el `switch` de `resolverSinCapacidad`, antes de `default`:
```ts
    case "confirmar_entendimiento":
      return [seccionDeConfirmacion(b, id)];
    case "recordar":
      await recordar(b, cerebro);
      return [];
```
5. Función nueva al final del archivo:
```ts
/**
 * Guarda lo que el Centro aprendió (D-204), SIN preguntar por decisión de la
 * persona, con los límites de `planDeRecordar`. Nunca rompe el turno: un
 * fallo aquí es una línea en el log.
 */
async function recordar(b: { texto: string; ambito: MemoryScope }, cerebro: Cerebro) {
  try {
    const { data: existentes, error } = await cerebro.supabase
      .from("memory_items")
      .select("id, text, origin, created_at, valid_until")
      .eq("user_id", cerebro.user.id);
    if (error) throw error;
    const plan = planDeRecordar(b, existentes ?? [], cerebro.today);
    if (plan.accion === "omitir") {
      console.warn("[centro-agente] recordar:", plan.motivo);
      return;
    }
    if (plan.borrar.length) {
      await cerebro.supabase.from("memory_items").delete().in("id", plan.borrar).eq("user_id", cerebro.user.id).eq("origin", "centro");
    }
    const { error: e2 } = await cerebro.supabase.from("memory_items").insert({ ...plan.fila, user_id: cerebro.user.id });
    if (e2) throw e2;
  } catch (e) {
    console.warn("[centro-agente] recordar:", e);
  }
}
```
(con `import type { MemoryScope } from "@/lib/domain/insights/memory.ts";`).

- [ ] **Step 4: Run tests**

Run: `node --experimental-strip-types --test tests/domain/centro-agente-prompt.test.ts`, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/agente/prompt.ts tests/domain/centro-agente-prompt.test.ts src/lib/centro/agente/pensar.ts
git commit -m "D-204: el turno confirma, recuerda y lee cómo te fue

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: La interfaz (confirmación, «No es esto», chips y registros)

**Files:**
- Create: `src/lib/centro/agente/eventos.ts`, `src/components/centro-runtime/secciones/ConfirmarEntendimiento.tsx`
- Modify: `src/components/centro-runtime/contexto.tsx`, `src/components/centro-runtime/index.ts`, `src/components/centro-runtime/secciones/PropuestaCambio.tsx`, `src/components/centro-agente/CentroAgente.tsx`, `src/lib/centro/escritura/confirmar.ts` (`descartarCambio`), `src/app/globals.css`

**Interfaces:**
- Consumes: sección `confirmarEntendimiento` (Task 2), `GET /api/centro/chips` (Task 5), `IDS_DE_CHIPS` (Task 5).
- Produces:
  - `registrarEntendimiento(resultado: "seguir" | "alternativa" | "otra"): Promise<void>` y `registrarChip(id: string): Promise<void>` (server actions; nunca lanzan).
  - `descartarCambio(propuestaId: string, motivo?: "malentendido"): Promise<ActionResult>`.
  - `ContextoDelAgente` = `{ workspaceId: string | null; enviar?: (texto: string) => void; enfocar?: () => void }`.

- [ ] **Step 1: Server actions**

```ts
// src/lib/centro/agente/eventos.ts
// Lo que la persona hace en el Centro y le sirve para aprender (D-204).
// Registros en audit_log con la sesión; nunca lanzan ni frenan el turno.
"use server";

import { z } from "zod";
import { requireUser } from "@/lib/data/session";
import { IDS_DE_CHIPS } from "@/lib/domain/centro/agente/chips.ts";

const Resultado = z.enum(["seguir", "alternativa", "otra"]);

export async function registrarEntendimiento(resultado: "seguir" | "alternativa" | "otra"): Promise<void> {
  try {
    const r = Resultado.safeParse(resultado);
    if (!r.success) return;
    const { supabase, user } = await requireUser();
    await supabase.from("audit_log").insert({ user_id: user.id, action: "ai.centro_entendimiento", object: "centro", meta: { resultado: r.data } });
  } catch (e) {
    console.warn("[centro-agente] registrarEntendimiento:", e);
  }
}

export async function registrarChip(id: string): Promise<void> {
  try {
    if (typeof id !== "string" || !IDS_DE_CHIPS.has(id)) return;
    const { supabase, user } = await requireUser();
    await supabase.from("audit_log").insert({ user_id: user.id, action: "ai.centro_chip", object: "centro", meta: { id } });
  } catch (e) {
    console.warn("[centro-agente] registrarChip:", e);
  }
}
```

`src/lib/centro/escritura/confirmar.ts`, `descartarCambio`: firma `descartarCambio(propuestaId: string, motivo?: "malentendido")`. Cambiar el `update` para que devuelva la fila (`.select("payload").maybeSingle()`), y si `motivo === "malentendido"` y hubo fila:
```ts
    const pl = (fila?.payload ?? {}) as { tabla?: unknown; operacion?: unknown };
    await supabase.from("audit_log").insert({
      user_id: user.id,
      action: "ai.centro_entendimiento",
      object: id.data,
      meta: { resultado: "malentendido", propuestaId: id.data, tabla: typeof pl.tabla === "string" ? pl.tabla : null, operacion: typeof pl.operacion === "string" ? pl.operacion : null }
    });
```
(un error de ese insert se ignora; el descarte ya ocurrió).

- [ ] **Step 2: Contexto y componente de confirmación**

`src/components/centro-runtime/contexto.tsx`:
```tsx
export const ContextoDelAgente = createContext<{
  workspaceId: string | null;
  /** D-204: una sección puede mandar un turno nuevo (confirmación, «No es esto»). */
  enviar?: (texto: string) => void;
  /** D-204: lleva el foco al compositor («Otra cosa»). */
  enfocar?: () => void;
}>({ workspaceId: null });
```

```tsx
// src/components/centro-runtime/secciones/ConfirmarEntendimiento.tsx
"use client";

import { useContext, useState } from "react";
import { registrarEntendimiento } from "@/lib/centro/agente/eventos";
import { ContextoDelAgente } from "../contexto";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/**
 * «¿Entendí bien?» (D-204). Un clic manda el turno siguiente y deja un
 * registro para que el Centro aprenda; la tarjeta queda contestada.
 */
export default function SeccionConfirmarEntendimiento({ data }: PropsDeSeccion<"confirmarEntendimiento">) {
  const { enviar, enfocar } = useContext(ContextoDelAgente);
  const [usada, setUsada] = useState(false);

  function elegir(resultado: "seguir" | "alternativa" | "otra", texto: string | null) {
    if (usada) return;
    setUsada(true);
    void registrarEntendimiento(resultado);
    if (texto) enviar?.(texto);
    else enfocar?.();
  }

  return (
    <div className="ag-card">
      <p>
        <span className="ag-muted">Entendí: </span>
        {data.entendi}
      </p>
      <p className="ag-acciones">
        <button type="button" className="ag-boton-chico" disabled={usada} onClick={() => elegir("seguir", "Sí, sigue")}>
          {data.seguir}
        </button>
        {data.alternativas.map((a) => (
          <button
            key={a.etiqueta}
            type="button"
            className="ag-boton-chico"
            disabled={usada}
            onClick={() => elegir(a.texto ? "alternativa" : "otra", a.texto)}>
            {a.etiqueta}
          </button>
        ))}
      </p>
    </div>
  );
}

registrarSeccion("confirmarEntendimiento", SeccionConfirmarEntendimiento);
```

`src/components/centro-runtime/index.ts`: `import "./secciones/ConfirmarEntendimiento";` tras la línea de `PropuestaCambio`.

- [ ] **Step 3: «No es esto»** en `PropuestaCambio.tsx`:
- `const { enviar } = useContext(ContextoDelAgente);` (import `useContext` y `ContextoDelAgente` de `../contexto`).
- Función:
```tsx
  function noEsEsto(it: ItemDeCambio) {
    startTransition(async () => {
      await descartarCambio(it.propuestaId, "malentendido").catch(() => null);
      setEstados((e) => ({ ...e, [it.propuestaId]: "descartado" }));
      enviar?.("No era eso");
    });
  }
```
- Botón junto a Descartar (en la rama pendiente): `<button type="button" className="ag-boton-chico" disabled={pending} onClick={() => noEsEsto(it)}>No es esto</button>`.

- [ ] **Step 4: CentroAgente — contexto con enviar/enfocar y chips**

En `src/components/centro-agente/CentroAgente.tsx`:
1. Import: `import { registrarChip } from "@/lib/centro/agente/eventos";`
2. Estado: `const [chips, setChips] = useState<{ id: string; texto: string }[]>([]);`
3. Efecto al montar (junto al de «Hoy»):
```tsx
  useEffect(() => {
    let vivo = true;
    void fetch("/api/centro/chips")
      .then((r) => (r.ok ? (r.json() as Promise<{ chips?: { id: string; texto: string }[] }>) : null))
      .catch(() => null)
      .then((r) => {
        if (vivo) setChips(r?.chips ?? []);
      });
    return () => {
      vivo = false;
    };
  }, []);
```
4. Función: `function enfocar() { shellRef.current?.querySelector<HTMLTextAreaElement>(".ag-campo")?.focus(); }`
5. Provider: `value={{ workspaceId, enviar, enfocar }}` (`enviar` es la función que ya existe).
6. Dentro de `<main className="ag-hilo">`, justo antes de `{pensando && …}`:
```tsx
          {chips.length > 0 && !hilo.some((t) => t.rol === "persona") && !pensando && (
            <div className="ag-chips" aria-label="Cosas que puedo hacer">
              {chips.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="ag-chip"
                  onClick={() => {
                    void registrarChip(c.id);
                    void enviar(c.texto);
                  }}>
                  {c.texto}
                </button>
              ))}
            </div>
          )}
```
7. `src/app/globals.css`, tras `.ag-turno { … }`:
```css
/* D-204: lo que el Centro sabe hacer, como frases que se pueden pulsar. */
.ag-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.ag-chip {
  border: 1px solid var(--ag-soft);
  background: var(--ag-surface);
  color: var(--ag-text);
  border-radius: 999px;
  padding: 8px 14px;
  font-size: 14px;
  cursor: pointer;
}
.ag-chip:hover { background: var(--ag-soft); }
```

- [ ] **Step 5: Gates and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build`
Expected: verde.

```bash
git add src/lib/centro/agente/eventos.ts src/components/centro-runtime/secciones/ConfirmarEntendimiento.tsx src/components/centro-runtime/contexto.tsx src/components/centro-runtime/index.ts src/components/centro-runtime/secciones/PropuestaCambio.tsx src/components/centro-agente/CentroAgente.tsx src/lib/centro/escritura/confirmar.ts src/app/globals.css
git commit -m "D-204: confirmación, «No es esto» y chips en la interfaz del Centro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: D-204 y prueba en navegador

**Files:**
- Modify: `docs/DECISIONS.md`

- [ ] **Step 1: D-204** — añadir al final de `docs/DECISIONS.md`:

```markdown
- **D-204 · El Centro conversa: confirma si duda, enseña lo que sabe y aprende
  solo, a la vista.** Respuestas de hasta 2000 caracteres y 6 bloques (6000
  tokens de salida). Bloque «confirmar_entendimiento» cuando la petición es
  ambigua, toca varias cosas, borra o interpreta: en ese turno no salen
  propuestas (regla pura en `parsearRespuesta`). «No es esto» en las tarjetas
  de cambio. Aprende en la conversación: cada turno lee un resumen de los
  últimos 30 días (propuestas guardadas y descartadas, campos corregidos,
  confirmaciones y malentendidos, de `coach_proposals` y `audit_log`) y puede
  escribir UNA preferencia con «recordar». **Rompe D-089 por decisión de la
  persona:** esa memoria entra sin clic, con `origin = 'centro'` (0079), caduca
  a los 90 días, no pasa de 20 (se va la más vieja del Centro), no duplica, se
  marca «Lo notó el Centro» en /intelligence/memory y entra al contexto como
  «Lo que el Centro ha notado (puede equivocarse)», nunca junto a lo que la
  persona dijo. Solo el Centro la escribe. Chips de capacidades al abrir, sin
  modelo: catálogo filtrado por dominios y franja, ordenado por uso
  (`ai.centro_chip`).
```

- [ ] **Step 2: Browser check (Chromium local)**

Con la base local (0079 aplicada con `supabase migration up`, nunca `db reset`) y `pnpm build && pnpm start`:
1. Abrir el Centro con el hilo vacío → aparecen 4–6 chips de dominios activos; pulsar uno → se envía como pregunta y `audit_log` tiene `ai.centro_chip`.
2. Sin `GEMINI_API_KEY` el modelo no contesta: para la tarjeta de confirmación y «No es esto», usa un harness TEMPORAL no commiteado (una página que pinte `SeccionConfirmarEntendimiento` y `SeccionPropuestaCambio` con datos fijos dentro de `ContextoDelAgente.Provider` con un `enviar` que registre lo enviado). Comprobar: el botón «Sí, hazlo» envía «Sí, sigue» y deja `ai.centro_entendimiento {resultado:"seguir"}`; «Otra cosa» enfoca el campo; «No es esto» descarta la propuesta y deja `{resultado:"malentendido"}`.
3. Insertar a mano una `memory_items` con `origin = 'centro'` para el usuario de prueba → `/intelligence/memory` la marca «Lo notó el Centro».
4. Borrar el harness y las filas de prueba; `git status` limpio salvo lo commiteado.
5. Anotar en el PR que **el modelo real no se probó**.

- [ ] **Step 3: Commit**

```bash
git add docs/DECISIONS.md
git commit -m "D-204: el Centro conversa, confirma y aprende

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Después de este plan

- Siguiente subproyecto: **C · Journal** (su propio spec y plan).
- Despliegue: la 0079 solo amplía un `check`; el código viejo funciona con ella. Aplicarla antes o junto con el código (si el código va primero, `recordar` falla en silencio: una línea en el log).
- Antes de encender el flag: medir un turno real con respuestas largas contra `maxDuration = 60`.
