# Centro escribe — Entrega 1 (núcleo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El Centro propone crear, editar y borrar filas de `tasks`, `notes` y `food_entries`; la persona las confirma con Guardar y se escriben por las server actions existentes.

**Architecture:** Un registro puro (`ESCRITURA_POR_TABLA`) define qué tablas/campos/operaciones son escribibles. El modelo devuelve un bloque `propuesta_cambio`; el turno valida cada cambio contra el registro, `ai_domains` y las filas leídas, lo guarda en `coach_proposals` (`tipo: "cambio"`) y pinta la sección `propuestaCambio`. Una sola server action, `confirmarCambio`, re-valida lo guardado y llama al adaptador de esa tabla×operación, que a su vez llama a la server action real de la sección.

**Tech Stack:** Next.js 15 (server actions), TypeScript, zod 3, Supabase (RLS, pgTAP), `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-09-25-centro-escritura-universal-design.md` (esta es la entrega 1 de 4; las entregas 2–4 tendrán su propio plan).

## Global Constraints

- Todo se guarda con el cliente de SESIÓN (RLS). `createAdminClient()` no se importa en ningún archivo de este plan.
- Nunca se escribe sin que la persona pulse Guardar. El turno solo inserta en `coach_proposals`.
- Editar/borrar solo sobre filas entregadas por las herramientas en ESE turno (`filasEntregadas()`).
- `ai_domains` manda también en escritura, al proponer Y al confirmar.
- `profiles` y el resto de `TABLAS_PROHIBIDAS` jamás entran en el registro (lo vigila un test).
- Topes: 1–5 cambios por bloque, 10 cambios por turno, 4 bloques por turno (ya existe `MAX_BLOQUES`).
- Rondas de herramientas del Centro: 6 (el resto del código sigue en 4). `maxOutputTokens` del Centro: 4000.
- Archivos de dominio: imports relativos con extensión `.ts` (el runner de node los carga sin Next). Código de servidor: alias `@/`.
- Textos visibles en español, mismo tono que el resto del Centro.
- Migración: `supabase/migrations/0078_centro_escritura.sql`. pgTAP: `supabase/tests/0048_centro_escritura.sql`. Decisión: D-203.
- Comandos: `pnpm test:unit`, `pnpm typecheck`, `pnpm lint`. NO correr `pnpm verify` sin avisar: termina en `supabase db reset` y borra la base local.
- Commits terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Números como texto:** el modelo manda `"grams": "80"`. Se espera que pase como 80 (no rechazo). → test en Task 2.
2. **Marcado en un campo** (`body: "<div>hola</div>"` en una nota): el validador de secciones tumba cualquier texto con marcado; la tarjeta NO debe desaparecer en silencio con la propuesta ya guardada. Se espera que la tarjeta enseñe el texto neutralizado y que se guarde el valor original. → test en Task 3.
3. **Corrección vacía en un campo obligatorio** (la persona borra el nombre del alimento y pulsa Guardar): se espera un motivo legible, no una fila sin nombre. → test en Task 2.
4. **Dominio apagado entre proponer y guardar:** se espera «Dominio no autorizado», no una escritura. → test en Task 2 (`revalidarGuardado`).
5. **Título larguísimo** (una nota de 5 000 caracteres sin título): `coach_proposals.titulo` y la tarjeta deben recortar, no romper. → test en Task 3.

---

## File Structure

**Crear (dominio, puro):**
- `src/lib/domain/centro/escritura/registro.ts` — tipos, `ESCRITURA_POR_TABLA`, `TABLAS_PROHIBIDAS`, `entradaDe`.
- `src/lib/domain/centro/escritura/cambio.ts` — `validarCambio`, `aplicarCorrecciones`, `revalidarGuardado`.
- `src/lib/domain/centro/escritura/tarjeta.ts` — `seccionDeCambios`, `tituloDeCambio`.
- `src/lib/domain/centro/escritura/esquema.ts` — `esquemaParaModelo`, `indiceDeEscritura`, `conEscritura`.

**Crear (servidor):**
- `src/lib/centro/escritura/adaptadores.ts` — `ADAPTADORES`.
- `src/lib/centro/escritura/proponer.ts` — `proponerCambios`.
- `src/lib/centro/escritura/confirmar.ts` — `confirmarCambio`, `descartarCambio` (server actions).
- `src/components/centro-runtime/secciones/PropuestaCambio.tsx`.
- `supabase/migrations/0078_centro_escritura.sql`, `supabase/tests/0048_centro_escritura.sql`.

**Tests nuevos:** `tests/domain/centro-escritura-registro.test.ts`, `…-cambio.test.ts`, `…-tarjeta.test.ts`, `…-esquema.test.ts`.

**Modificar:**
- `src/lib/domain/centro/runtime/secciones.ts` (kind `propuestaCambio` + tipos), `src/lib/domain/centro/runtime/validador.ts` (zod del kind).
- `src/lib/domain/centro/agente/contrato.ts` (bloque `propuesta_cambio`), `src/lib/domain/centro/agente/prompt.ts`.
- `src/lib/ai/gemini-provider.ts` (`maxToolRounds`), `src/lib/ai-chat/cerebro.ts` (`dominios`), `src/lib/centro/agente/pensar.ts`.
- `src/lib/coach/actions.ts` (`loadPendingProposals` excluye `cambio`).
- `src/components/centro-runtime/index.ts`, `tests/domain/centro-agente-catalogo.test.ts` (32 → 33), `tests/domain/centro-agente-contrato.test.ts`, `tests/domain/centro-agente-prompt.test.ts`, `docs/DECISIONS.md`.

**Desvío del spec, a propósito:** el spec decía que las propuestas no guardadas «siguen como pendientes del coach». La barra del chat (`useAiChat`) solo sabe pintar y aceptar los tipos de `sanearPropuesta`; un `cambio` ahí sería un botón que falla. En esta entrega `loadPendingProposals` los excluye: quedan en la base como `pending` y se pueden recuperar cuando exista dónde pintarlos. Se anota en D-203.

---

### Task 1: El registro de escritura

**Files:**
- Create: `src/lib/domain/centro/escritura/registro.ts`
- Test: `tests/domain/centro-escritura-registro.test.ts`

**Interfaces:**
- Consumes: `Domain` de `src/lib/domain/insights/types.ts`; `TABLAS_CONSULTABLES`, `dominioDeTabla` de `src/lib/insights/context.ts`.
- Produces:
  - `type Operacion = "crear" | "editar" | "borrar"`, `const OPERACIONES`
  - `type TipoCampo = "texto" | "numero" | "entero" | "fecha" | "opcion" | "ref"`
  - `interface CampoDeEscritura { etiqueta: string; tipo: TipoCampo; obligatorio?: boolean; min?: number; max?: number; opciones?: readonly string[]; refTabla?: string; soloCrear?: boolean; soloEditar?: boolean }`
  - `interface EntradaDeEscritura { dominio: Domain; etiqueta: string; descripcion: string; operaciones: readonly Operacion[]; titulo: string; campos: Record<string, CampoDeEscritura> }`
  - `const ESCRITURA_POR_TABLA` (tasks, notes, food_entries), `type TablaEscribible`
  - `const TABLAS_PROHIBIDAS: readonly string[]`
  - `function entradaDe(tabla: string, autorizados: readonly Domain[]): (EntradaDeEscritura & { tabla: TablaEscribible }) | null`
  - `function camposDe(entrada: EntradaDeEscritura, operacion: "crear" | "editar"): [string, CampoDeEscritura][]`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-escritura-registro.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESCRITURA_POR_TABLA,
  TABLAS_PROHIBIDAS,
  entradaDe,
  camposDe,
  type EntradaDeEscritura
} from "../../src/lib/domain/centro/escritura/registro.ts";
import { TABLAS_CONSULTABLES, dominioDeTabla } from "../../src/lib/insights/context.ts";

const tablas = Object.keys(ESCRITURA_POR_TABLA);
// Sin `as const`: iterar la unión de literales no compila al leer campos opcionales.
const REGISTRO = ESCRITURA_POR_TABLA as Record<string, EntradaDeEscritura>;

test("Ninguna tabla prohibida está en el registro (profiles, sobre todo)", () => {
  assert.ok(TABLAS_PROHIBIDAS.includes("profiles"));
  for (const t of TABLAS_PROHIBIDAS) assert.ok(!tablas.includes(t), t);
});

test("Entrega 1: tasks, notes y food_entries", () => {
  assert.deepStrictEqual(tablas.sort(), ["food_entries", "notes", "tasks"]);
});

test("El dominio de cada tabla es el de la lista blanca de lectura", () => {
  for (const [t, e] of Object.entries(REGISTRO)) {
    assert.strictEqual(e.dominio, dominioDeTabla(t), t);
  }
});

test("El título de la tarjeta es un campo del registro, y cada ref apunta a una tabla legible", () => {
  for (const [t, e] of Object.entries(REGISTRO)) {
    assert.ok(e.titulo in e.campos, `${t}.titulo`);
    for (const [n, c] of Object.entries(e.campos)) {
      if (c.tipo === "ref") assert.ok(c.refTabla && c.refTabla in TABLAS_CONSULTABLES, `${t}.${n}`);
      if (c.tipo === "opcion") assert.ok(c.opciones && c.opciones.length > 0, `${t}.${n}`);
    }
  }
});

test("Ningún campo de identidad o autoría es escribible", () => {
  for (const [t, e] of Object.entries(REGISTRO)) {
    for (const prohibido of ["id", "user_id", "workspace_id", "created_by", "updated_by", "version", "created_at"]) {
      assert.ok(!(prohibido in e.campos), `${t}.${prohibido}`);
    }
  }
});

test("entradaDe: un dominio apagado y una tabla inexistente dan lo mismo", () => {
  assert.strictEqual(entradaDe("tasks", ["nutrition"]), null);
  assert.strictEqual(entradaDe("profiles", ["execution", "nutrition"]), null);
  assert.strictEqual(entradaDe("tasks", ["execution"])?.tabla, "tasks");
});

test("camposDe: soloCrear no se edita; soloEditar no se crea", () => {
  const e = ESCRITURA_POR_TABLA.tasks;
  const crear = camposDe(e, "crear").map(([n]) => n);
  const editar = camposDe(e, "editar").map(([n]) => n);
  assert.ok(crear.includes("project_id") && !editar.includes("project_id"));
  assert.ok(editar.includes("status") && !crear.includes("status"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-escritura-registro.test.ts`
Expected: FAIL — `Cannot find module …/escritura/registro.ts`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/domain/centro/escritura/registro.ts
// Lo que el Centro puede ESCRIBIR (D-203). Puro, probado en
// tests/domain/centro-escritura-registro.test.ts.
//
// ES LA LISTA BLANCA DE ESCRITURA, como `TABLAS_CONSULTABLES` lo es de
// lectura: un solo archivo que auditar. Una tabla que no está aquí no se
// propone; un campo que no está aquí se ignora. Añadir una tabla = una entrada
// aquí + su adaptador en `src/lib/centro/escritura/adaptadores.ts` (el tipo
// de ADAPTADORES rompe `tsc` si falta alguno).
//
// NUNCA ENTRAN las de TABLAS_PROHIBIDAS. `profiles` la primera: ahí vive
// `ai_domains`, y un agente que pudiera escribirla ampliaría sus propios
// permisos.

import type { Domain } from "../../insights/types.ts";

export const OPERACIONES = ["crear", "editar", "borrar"] as const;
export type Operacion = (typeof OPERACIONES)[number];

export type TipoCampo = "texto" | "numero" | "entero" | "fecha" | "opcion" | "ref";

export interface CampoDeEscritura {
  etiqueta: string;
  tipo: TipoCampo;
  /** Obligatorio AL CREAR. Al editar nada es obligatorio: viaja lo que cambia. */
  obligatorio?: boolean;
  /** Texto: longitud. Número: rango. */
  min?: number;
  max?: number;
  opciones?: readonly string[];
  /** `ref`: la fila tiene que ser de esta tabla y leída en el turno. */
  refTabla?: string;
  soloCrear?: boolean;
  soloEditar?: boolean;
}

export interface EntradaDeEscritura {
  dominio: Domain;
  /** Cómo se llama una fila en la tarjeta: «Tarea». */
  etiqueta: string;
  /** Una línea para el índice del prompt. */
  descripcion: string;
  operaciones: readonly Operacion[];
  /** El campo que titula la tarjeta. */
  titulo: string;
  campos: Record<string, CampoDeEscritura>;
}

const ESTADOS_DE_TAREA = ["Pending", "InProgress", "Blocked", "Rescheduled", "Completed", "Cancelled"] as const;
const PRIORIDADES = ["High", "Medium", "Low"] as const;
const COMIDAS = ["Desayuno", "Almuerzo", "Cena", "Snack"] as const;

export const ESCRITURA_POR_TABLA = {
  tasks: {
    dominio: "execution",
    etiqueta: "Tarea",
    descripcion: "tareas de un proyecto (crear en un proyecto leído, cambiar estado/prioridad/fecha, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    titulo: "title",
    campos: {
      project_id: { etiqueta: "Proyecto", tipo: "ref", refTabla: "projects", obligatorio: true, soloCrear: true },
      title: { etiqueta: "Título", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      status: { etiqueta: "Estado", tipo: "opcion", opciones: ESTADOS_DE_TAREA, soloEditar: true },
      priority: { etiqueta: "Prioridad", tipo: "opcion", opciones: PRIORIDADES },
      due: { etiqueta: "Vence", tipo: "fecha" },
      est: { etiqueta: "Minutos estimados", tipo: "entero", min: 0, max: 1440, soloCrear: true }
    }
  },
  notes: {
    dominio: "execution",
    etiqueta: "Nota",
    descripcion: "notas de un cuaderno (crear en un cuaderno leído, reescribir título o cuerpo, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    titulo: "title",
    campos: {
      notebook_id: { etiqueta: "Cuaderno", tipo: "ref", refTabla: "notebooks", obligatorio: true, soloCrear: true },
      title: { etiqueta: "Título", tipo: "texto", min: 0, max: 300 },
      body: { etiqueta: "Texto", tipo: "texto", obligatorio: true, min: 1, max: 20000 }
    }
  },
  food_entries: {
    dominio: "nutrition",
    etiqueta: "Comida",
    descripcion: "lo que comió la persona (registrar con macros por 100 g, corregir comida/nombre/gramos, borrar)",
    operaciones: ["crear", "editar", "borrar"],
    titulo: "name",
    campos: {
      local_date: { etiqueta: "Día", tipo: "fecha", soloCrear: true },
      meal: { etiqueta: "Comida", tipo: "opcion", opciones: COMIDAS, obligatorio: true },
      name: { etiqueta: "Alimento", tipo: "texto", obligatorio: true, min: 1, max: 200 },
      grams: { etiqueta: "Gramos", tipo: "numero", obligatorio: true, min: 0.1, max: 5000 },
      kcal100: { etiqueta: "kcal por 100 g", tipo: "numero", obligatorio: true, min: 0, max: 900, soloCrear: true },
      protein100: { etiqueta: "Proteína por 100 g", tipo: "numero", min: 0, max: 100, soloCrear: true },
      carbs100: { etiqueta: "Carbohidratos por 100 g", tipo: "numero", min: 0, max: 100, soloCrear: true },
      fat100: { etiqueta: "Grasa por 100 g", tipo: "numero", min: 0, max: 100, soloCrear: true }
    }
  }
} as const satisfies Record<string, EntradaDeEscritura>;

export type TablaEscribible = keyof typeof ESCRITURA_POR_TABLA;

/**
 * Lo que el Centro no escribe NUNCA. No es la lista de «lo que falta»: es la
 * de lo que no debe llegar. Sistema, derivadas, colas y todo lo que decide
 * quién ve qué.
 */
export const TABLAS_PROHIBIDAS: readonly string[] = [
  "profiles",
  "workspaces",
  "memberships",
  "invitations",
  "project_shares",
  "audit_log",
  "consents",
  "graph_edges",
  "graph_nodes",
  "graph_edge_rules",
  "graph_layouts",
  "graph_node_types",
  "graph_rel_types",
  "graph_sources",
  "identity_scores",
  "identity_briefs",
  "identity_revisions",
  "identity_brief_style",
  "net_worth_snapshots",
  "task_history",
  "workspace_activity",
  "ai_chat_messages",
  "ai_job_runs",
  "automation_runs",
  "routine_runs",
  "ritual_runs",
  "centro_runs",
  "coach_proposals",
  "recommendations",
  "notifications",
  "push_subscriptions",
  "nav_visitas",
  "comment_reads",
  "template_catalog",
  "ritual_policy",
  "ritual_prefs",
  "notification_prefs",
  "automations",
  "task_files"
];

/**
 * La entrada de una tabla si se puede escribir con estos dominios, o `null`.
 * Como `tablaConsultable`: «no existe» y «no autorizada» no se distinguen.
 */
export function entradaDe(
  tabla: string,
  autorizados: readonly Domain[]
): (EntradaDeEscritura & { tabla: TablaEscribible }) | null {
  const e = (ESCRITURA_POR_TABLA as Record<string, EntradaDeEscritura | undefined>)[tabla];
  if (!e || !autorizados.includes(e.dominio)) return null;
  return { ...e, tabla: tabla as TablaEscribible };
}

/** Los campos que una operación puede tocar. */
export function camposDe(entrada: EntradaDeEscritura, operacion: "crear" | "editar"): [string, CampoDeEscritura][] {
  return Object.entries(entrada.campos).filter(([, c]) => (operacion === "crear" ? !c.soloEditar : !c.soloCrear));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-escritura-registro.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/escritura/registro.ts tests/domain/centro-escritura-registro.test.ts
git commit -m "D-203: el registro de lo que el Centro puede escribir

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Validar un cambio (turno, correcciones y guardado)

**Files:**
- Create: `src/lib/domain/centro/escritura/cambio.ts`
- Test: `tests/domain/centro-escritura-cambio.test.ts`

**Interfaces:**
- Consumes: Task 1 (`entradaDe`, `camposDe`, `ESCRITURA_POR_TABLA`, `Operacion`, `TablaEscribible`, `CampoDeEscritura`).
- Produces:
  - `type Valor = string | number | null`
  - `interface CambioValidado { operacion: Operacion; tabla: TablaEscribible; id: string | null; campos: Record<string, Valor>; antes: Record<string, unknown> | null; ignorados: string[] }`
  - `interface CambioGuardado { operacion: Operacion; tabla: TablaEscribible; id: string | null; campos: Record<string, Valor>; antes: Record<string, unknown> | null }` (lo que va en `coach_proposals.payload`)
  - `interface ContextoDeCambio { filas: ReadonlyMap<string, Record<string, unknown>>; autorizados: readonly Domain[] }`
  - `function validarCambio(crudo: unknown, ctx: ContextoDeCambio): { ok: true; cambio: CambioValidado } | { ok: false; reason: string }`
  - `function aGuardar(c: CambioValidado): CambioGuardado`
  - `function revalidarGuardado(payload: unknown, autorizados: readonly Domain[]): { ok: true; cambio: CambioGuardado } | { ok: false; reason: string }`
  - `function aplicarCorrecciones(c: CambioGuardado, correcciones: Record<string, string>): { ok: true; cambio: CambioGuardado } | { ok: false; reason: string }`

Reglas:
- Campo desconocido o de la operación equivocada → se ignora y se anota en `ignorados` (no tumba el cambio).
- `ref` en el turno: tiene que ser `fila:<refTabla>:<uuid>` y estar en `ctx.filas`; se guarda el uuid solo. En `revalidarGuardado` una ref es un uuid.
- `numero`/`entero`: acepta número o texto numérico (`"80"`).
- `fecha`: `AAAA-MM-DD` que exista.
- Crear sin un obligatorio → rechazo. Editar sin ningún campo que cambie de verdad → rechazo.
- Editar/borrar: la fila tiene que estar en `ctx.filas`; la tabla sale de la fila.

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-escritura-cambio.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validarCambio,
  aGuardar,
  revalidarGuardado,
  aplicarCorrecciones
} from "../../src/lib/domain/centro/escritura/cambio.ts";

const P = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const N = "33333333-3333-4333-8333-333333333333";
const filas = new Map<string, Record<string, unknown>>([
  [`fila:projects:${P}`, { id: P, title: "Tesis" }],
  [`fila:tasks:${T}`, { id: T, title: "Leer capítulo 2", status: "Pending", priority: "Medium", due: null }],
  [`fila:notebooks:${N}`, { id: N, title: "Ideas" }]
]);
const ctx = { filas, autorizados: ["execution", "nutrition"] as const };

test("Crear: una tarea en un proyecto leído; la ref se guarda como uuid", () => {
  const r = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${P}`, title: "Escribir intro", priority: "High" } }, ctx);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.cambio, {
    operacion: "crear",
    tabla: "tasks",
    id: null,
    campos: { project_id: P, title: "Escribir intro", priority: "High" },
    antes: null,
    ignorados: []
  });
});

test("Crear: user_id, id y campos inventados se ignoran, no tumban el cambio", () => {
  const r = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${P}`, title: "X", user_id: "otro", id: T, color: "rojo", status: "Completed" } }, ctx);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.cambio.campos, { project_id: P, title: "X" });
  assert.deepStrictEqual(r.ok && r.cambio.ignorados.sort(), ["color", "id", "status", "user_id"]);
});

test("Crear: sin un obligatorio, fuera", () => {
  const r = validarCambio({ operacion: "crear", tabla: "tasks", campos: { title: "Sin proyecto" } }, ctx);
  assert.deepStrictEqual(r, { ok: false, reason: "tasks: falta «project_id»." });
});

test("Crear: una ref que no se leyó en el turno, fuera", () => {
  const otro = "44444444-4444-4444-8444-444444444444";
  const r = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${otro}`, title: "X" } }, ctx);
  assert.strictEqual(r.ok, false);
});

test("Crear: una ref a una fila de OTRA tabla, fuera", () => {
  const r = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:notebooks:${N}`, title: "X" } }, ctx);
  assert.strictEqual(r.ok, false);
});

test("Crear: números como texto pasan como número (Review Focus 1)", () => {
  const r = validarCambio(
    { operacion: "crear", tabla: "food_entries", campos: { meal: "Desayuno", name: "Avena", grams: "80", kcal100: "389", protein100: 17 } },
    ctx
  );
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && r.cambio.campos, { meal: "Desayuno", name: "Avena", grams: 80, kcal100: 389, protein100: 17 });
});

test("Crear: opción fuera de la lista, fecha que no existe, número fuera de rango: fuera", () => {
  for (const campos of [
    { meal: "Merienda", name: "Pan", grams: 50, kcal100: 250 },
    { meal: "Cena", name: "Pan", grams: 50, kcal100: 250, local_date: "2026-02-30" },
    { meal: "Cena", name: "Pan", grams: 0, kcal100: 250 },
    { meal: "Cena", name: "Pan", grams: 50, kcal100: 2000 }
  ]) {
    assert.strictEqual(validarCambio({ operacion: "crear", tabla: "food_entries", campos }, ctx).ok, false, JSON.stringify(campos));
  }
});

test("Tabla fuera del registro o de un dominio apagado: fuera, con el mismo motivo", () => {
  const a = validarCambio({ operacion: "crear", tabla: "profiles", campos: { ai_domains: ["money"] } }, ctx);
  const b = validarCambio({ operacion: "crear", tabla: "food_entries", campos: { meal: "Cena", name: "Pan", grams: 1, kcal100: 1 } }, { ...ctx, autorizados: ["execution"] });
  assert.deepStrictEqual(a, { ok: false, reason: "«profiles» no se puede escribir." });
  assert.deepStrictEqual(b, { ok: false, reason: "«food_entries» no se puede escribir." });
});

test("Editar: sobre una fila leída; el antes sale de la fila, no del modelo", () => {
  const r = validarCambio({ operacion: "editar", fila: `fila:tasks:${T}`, campos: { status: "Completed" } }, ctx);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && { id: r.cambio.id, tabla: r.cambio.tabla, campos: r.cambio.campos, antes: r.cambio.antes }, {
    id: T,
    tabla: "tasks",
    campos: { status: "Completed" },
    antes: { id: T, title: "Leer capítulo 2", status: "Pending", priority: "Medium", due: null }
  });
});

test("Editar: fila no leída, fuera", () => {
  const r = validarCambio({ operacion: "editar", fila: "fila:tasks:55555555-5555-4555-8555-555555555555", campos: { status: "Completed" } }, ctx);
  assert.deepStrictEqual(r, { ok: false, reason: "fila:tasks:55555555-5555-4555-8555-555555555555 no se leyó en este turno." });
});

test("Editar: nada cambia de verdad (mismo valor o solo campos soloCrear), fuera", () => {
  assert.strictEqual(validarCambio({ operacion: "editar", fila: `fila:tasks:${T}`, campos: { status: "Pending" } }, ctx).ok, false);
  assert.strictEqual(validarCambio({ operacion: "editar", fila: `fila:tasks:${T}`, campos: { project_id: `fila:projects:${P}` } }, ctx).ok, false);
});

test("Borrar: sobre una fila leída, sin campos", () => {
  const r = validarCambio({ operacion: "borrar", fila: `fila:tasks:${T}` }, ctx);
  assert.ok(r.ok);
  assert.deepStrictEqual(r.ok && { op: r.cambio.operacion, id: r.cambio.id, campos: r.cambio.campos }, { op: "borrar", id: T, campos: {} });
});

test("Borrar: de una tabla que se lee pero no se escribe (projects), fuera", () => {
  assert.strictEqual(validarCambio({ operacion: "borrar", fila: `fila:projects:${P}` }, ctx).ok, false);
});

test("Operación desconocida, fuera", () => {
  assert.strictEqual(validarCambio({ operacion: "truncar", tabla: "tasks" }, ctx).ok, false);
});

const guardado = () => {
  const r = validarCambio({ operacion: "crear", tabla: "food_entries", campos: { meal: "Cena", name: "Pan", grams: 50, kcal100: 250 } }, ctx);
  assert.ok(r.ok);
  return aGuardar(r.cambio);
};

test("revalidarGuardado: lo guardado vuelve a pasar", () => {
  const g = guardado();
  assert.deepStrictEqual(revalidarGuardado(JSON.parse(JSON.stringify(g)), ["nutrition"]), { ok: true, cambio: g });
});

test("revalidarGuardado: dominio apagado después de proponer (Review Focus 4)", () => {
  assert.deepStrictEqual(revalidarGuardado(guardado(), ["execution"]), { ok: false, reason: "Dominio no autorizado." });
});

test("revalidarGuardado: payload manipulado (tabla prohibida, campo de más, ref no uuid)", () => {
  assert.strictEqual(revalidarGuardado({ ...guardado(), tabla: "profiles" }, ["nutrition"]).ok, false);
  assert.strictEqual(revalidarGuardado({ ...guardado(), campos: { ...guardado().campos, user_id: "x" } }, ["nutrition"]).ok, false);
  const t = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${P}`, title: "X" } }, ctx);
  assert.ok(t.ok);
  const g = aGuardar(t.cambio);
  assert.strictEqual(revalidarGuardado({ ...g, campos: { ...g.campos, project_id: "no-uuid" } }, ["execution"]).ok, false);
});

test("aplicarCorrecciones: la persona corrige los gramos antes de guardar", () => {
  const r = aplicarCorrecciones(guardado(), { grams: "20" });
  assert.ok(r.ok);
  assert.strictEqual(r.ok && r.cambio.campos.grams, 20);
});

test("aplicarCorrecciones: vaciar un obligatorio, tocar una ref o un campo ajeno: motivo legible (Review Focus 3)", () => {
  assert.deepStrictEqual(aplicarCorrecciones(guardado(), { name: "  " }), { ok: false, reason: "«Alimento» no puede quedar vacío." });
  assert.strictEqual(aplicarCorrecciones(guardado(), { user_id: "x" }).ok, false);
  const t = validarCambio({ operacion: "crear", tabla: "tasks", campos: { project_id: `fila:projects:${P}`, title: "X" } }, ctx);
  assert.ok(t.ok);
  assert.strictEqual(aplicarCorrecciones(aGuardar(t.cambio), { project_id: P }).ok, false);
});

test("aplicarCorrecciones: un borrado no se corrige", () => {
  const b = validarCambio({ operacion: "borrar", fila: `fila:tasks:${T}` }, ctx);
  assert.ok(b.ok);
  assert.strictEqual(aplicarCorrecciones(aGuardar(b.cambio), { title: "x" }).ok, false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-escritura-cambio.test.ts`
Expected: FAIL — `Cannot find module …/escritura/cambio.ts`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/domain/centro/escritura/cambio.ts
// De lo que el modelo propone a lo que la persona confirma (D-203). Puro,
// probado en tests/domain/centro-escritura-cambio.test.ts.
//
// TRES MOMENTOS, TRES FUNCIONES:
//  - `validarCambio`: en el turno. Contra el registro, `ai_domains` y las
//    filas que las herramientas entregaron. Las refs llegan como
//    `fila:<tabla>:<uuid>` y salen como uuid.
//  - `aplicarCorrecciones`: la persona corrigió un campo en la tarjeta.
//  - `revalidarGuardado`: al pulsar Guardar, sobre lo que quedó en
//    `coach_proposals.payload`. No se confía ni en el navegador ni en que la
//    base no se haya tocado: se vuelve a pasar por el registro.
//
// LOS CAMPOS SON VALORES DEL MODELO. Es la excepción explícita a la regla de
// oro (como el `monto` de D-202), y por eso nada de esto escribe: solo decide
// qué se le enseña a la persona para que ella decida.

import type { Domain } from "../../insights/types.ts";
import {
  ESCRITURA_POR_TABLA,
  OPERACIONES,
  camposDe,
  entradaDe,
  type CampoDeEscritura,
  type EntradaDeEscritura,
  type Operacion,
  type TablaEscribible
} from "./registro.ts";

export type Valor = string | number | null;

export interface CambioGuardado {
  operacion: Operacion;
  tabla: TablaEscribible;
  id: string | null;
  campos: Record<string, Valor>;
  antes: Record<string, unknown> | null;
}

export interface CambioValidado extends CambioGuardado {
  /** Campos que el modelo mandó y no se pueden escribir. Van al log. */
  ignorados: string[];
}

export interface ContextoDeCambio {
  filas: ReadonlyMap<string, Record<string, unknown>>;
  autorizados: readonly Domain[];
}

type R<T> = { ok: true } & T | { ok: false; reason: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILA = /^fila:([a-z_]+):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function esFecha(v: string): boolean {
  if (!ISO.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/**
 * Un valor de campo, saneado. `modo: "turno"` = la ref es `fila:…` y tiene que
 * estar en las filas leídas; `modo: "guardado"` = la ref ya es un uuid.
 */
function valorDe(
  nombre: string,
  c: CampoDeEscritura,
  crudo: unknown,
  modo: "turno" | "guardado",
  filas: ReadonlyMap<string, Record<string, unknown>>
): R<{ valor: Valor }> {
  const mal = (por: string): { ok: false; reason: string } => ({ ok: false, reason: `«${nombre}» ${por}.` });
  if (crudo === null || crudo === undefined || crudo === "") {
    if (c.obligatorio) return { ok: false, reason: `«${c.etiqueta}» no puede quedar vacío.` };
    return { ok: true, valor: null };
  }
  switch (c.tipo) {
    case "texto": {
      if (typeof crudo !== "string") return mal("no es texto");
      const t = crudo.trim();
      if (c.obligatorio && !t) return { ok: false, reason: `«${c.etiqueta}» no puede quedar vacío.` };
      if (c.max !== undefined && t.length > c.max) return mal(`pasa de ${c.max} caracteres`);
      return { ok: true, valor: t };
    }
    case "numero":
    case "entero": {
      const n = typeof crudo === "number" ? crudo : typeof crudo === "string" && crudo.trim() !== "" ? Number(crudo) : Number.NaN;
      if (!Number.isFinite(n)) return mal("no es un número");
      if (c.tipo === "entero" && !Number.isInteger(n)) return mal("no es un entero");
      if (c.min !== undefined && n < c.min) return mal(`es menor que ${c.min}`);
      if (c.max !== undefined && n > c.max) return mal(`es mayor que ${c.max}`);
      return { ok: true, valor: n };
    }
    case "fecha":
      return typeof crudo === "string" && esFecha(crudo) ? { ok: true, valor: crudo } : mal("no es una fecha AAAA-MM-DD");
    case "opcion":
      return typeof crudo === "string" && (c.opciones ?? []).includes(crudo) ? { ok: true, valor: crudo } : mal("no es una opción válida");
    case "ref": {
      if (typeof crudo !== "string") return mal("no es una fila");
      if (modo === "guardado") return UUID.test(crudo) ? { ok: true, valor: crudo } : mal("no es un id");
      const m = FILA.exec(crudo);
      if (!m || m[1] !== c.refTabla) return mal(`tiene que ser una fila de ${c.refTabla}`);
      if (!filas.has(crudo)) return { ok: false, reason: `${crudo} no se leyó en este turno.` };
      return { ok: true, valor: m[2]! };
    }
  }
}

function objeto(v: unknown): Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Pasa los campos de una operación por el registro. Los desconocidos, a `ignorados`. */
function sanearCampos(
  entrada: EntradaDeEscritura & { tabla: TablaEscribible },
  operacion: "crear" | "editar",
  crudos: Record<string, unknown>,
  modo: "turno" | "guardado",
  filas: ReadonlyMap<string, Record<string, unknown>>
): R<{ campos: Record<string, Valor>; ignorados: string[] }> {
  const permitidos = new Map(camposDe(entrada, operacion));
  const campos: Record<string, Valor> = {};
  const ignorados: string[] = [];
  for (const [nombre, crudo] of Object.entries(crudos)) {
    const c = permitidos.get(nombre);
    if (!c) {
      ignorados.push(nombre);
      continue;
    }
    // Al editar nada es obligatorio: viaja lo que cambia. Pero vaciar un
    // obligatorio tampoco se puede.
    const v = valorDe(nombre, c, crudo, modo, filas);
    if (!v.ok) return v;
    campos[nombre] = v.valor;
  }
  if (operacion === "crear") {
    for (const [nombre, c] of permitidos) {
      if (c.obligatorio && (campos[nombre] === undefined || campos[nombre] === null)) {
        return { ok: false, reason: `${entrada.tabla}: falta «${nombre}».` };
      }
    }
  }
  return { ok: true, campos, ignorados };
}

export function validarCambio(crudo: unknown, ctx: ContextoDeCambio): R<{ cambio: CambioValidado }> {
  const c = objeto(crudo);
  const operacion = OPERACIONES.find((o) => o === c.operacion);
  if (!operacion) return { ok: false, reason: `operación «${String(c.operacion)}» desconocida.` };

  if (operacion === "crear") {
    const tabla = typeof c.tabla === "string" ? c.tabla : "";
    const entrada = entradaDe(tabla, ctx.autorizados);
    if (!entrada || !entrada.operaciones.includes("crear")) return { ok: false, reason: `«${tabla}» no se puede escribir.` };
    const s = sanearCampos(entrada, "crear", objeto(c.campos), "turno", ctx.filas);
    if (!s.ok) return s;
    return { ok: true, cambio: { operacion, tabla: entrada.tabla, id: null, campos: s.campos, antes: null, ignorados: s.ignorados } };
  }

  const fila = typeof c.fila === "string" ? c.fila : "";
  const m = FILA.exec(fila);
  if (!m) return { ok: false, reason: `«${fila}» no es una fila.` };
  const antes = ctx.filas.get(fila);
  if (!antes) return { ok: false, reason: `${fila} no se leyó en este turno.` };
  const entrada = entradaDe(m[1]!, ctx.autorizados);
  if (!entrada || !entrada.operaciones.includes(operacion)) return { ok: false, reason: `«${m[1]}» no se puede escribir.` };

  if (operacion === "borrar") {
    return { ok: true, cambio: { operacion, tabla: entrada.tabla, id: m[2]!, campos: {}, antes, ignorados: [] } };
  }

  const s = sanearCampos(entrada, "editar", objeto(c.campos), "turno", ctx.filas);
  if (!s.ok) return s;
  // Solo lo que cambia de verdad. Un «edita» que deja todo igual no es un cambio.
  const campos = Object.fromEntries(Object.entries(s.campos).filter(([k, v]) => (antes[k] ?? null) !== v));
  if (!Object.keys(campos).length) return { ok: false, reason: `${fila}: la edición no cambia nada.` };
  return { ok: true, cambio: { operacion, tabla: entrada.tabla, id: m[2]!, campos, antes, ignorados: s.ignorados } };
}

export function aGuardar(c: CambioValidado): CambioGuardado {
  return { operacion: c.operacion, tabla: c.tabla, id: c.id, campos: c.campos, antes: c.antes };
}

export function revalidarGuardado(payload: unknown, autorizados: readonly Domain[]): R<{ cambio: CambioGuardado }> {
  const p = objeto(payload);
  const operacion = OPERACIONES.find((o) => o === p.operacion);
  const tabla = typeof p.tabla === "string" ? p.tabla : "";
  if (!operacion || !(tabla in ESCRITURA_POR_TABLA)) return { ok: false, reason: "Esta propuesta no se puede guardar." };
  const entrada = entradaDe(tabla, autorizados);
  if (!entrada) return { ok: false, reason: "Dominio no autorizado." };
  if (!entrada.operaciones.includes(operacion)) return { ok: false, reason: "Esta propuesta no se puede guardar." };

  const id = p.id === null || p.id === undefined ? null : String(p.id);
  if (operacion === "crear" ? id !== null : !id || !UUID.test(id)) return { ok: false, reason: "Esta propuesta no se puede guardar." };
  const antes = operacion === "crear" ? null : objeto(p.antes);

  if (operacion === "borrar") return { ok: true, cambio: { operacion, tabla: entrada.tabla, id, campos: {}, antes } };

  const s = sanearCampos(entrada, operacion, objeto(p.campos), "guardado", new Map());
  if (!s.ok) return { ok: false, reason: s.reason };
  // Guardado = ya pasó por el registro una vez. Un campo de más solo puede
  // venir de alguien que tocó el payload.
  if (s.ignorados.length) return { ok: false, reason: "Esta propuesta no se puede guardar." };
  if (operacion === "editar" && !Object.keys(s.campos).length) return { ok: false, reason: "Esta propuesta no se puede guardar." };
  return { ok: true, cambio: { operacion, tabla: entrada.tabla, id, campos: s.campos, antes } };
}

/**
 * Lo que la persona corrigió en la tarjeta. Solo campos que la operación puede
 * tocar, nunca refs (el proyecto o el cuaderno no se cambian desde aquí), y
 * con el mismo saneado que el turno.
 */
export function aplicarCorrecciones(c: CambioGuardado, correcciones: Record<string, string>): R<{ cambio: CambioGuardado }> {
  if (!Object.keys(correcciones).length) return { ok: true, cambio: c };
  if (c.operacion === "borrar") return { ok: false, reason: "Un borrado no se corrige." };
  const entrada = ESCRITURA_POR_TABLA[c.tabla] as EntradaDeEscritura;
  const permitidos = new Map(camposDe(entrada, c.operacion));
  const campos = { ...c.campos };
  for (const [nombre, crudo] of Object.entries(correcciones)) {
    const def = permitidos.get(nombre);
    if (!def || def.tipo === "ref") return { ok: false, reason: `«${nombre}» no se puede corregir aquí.` };
    const v = valorDe(nombre, def, crudo, "guardado", new Map());
    if (!v.ok) return v;
    campos[nombre] = v.valor;
  }
  return { ok: true, cambio: { ...c, campos } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test tests/domain/centro-escritura-cambio.test.ts`
Expected: PASS (21 tests). Si «Editar: el antes sale de la fila» falla por orden de claves, compara con `deepStrictEqual` — el orden de claves no importa en objetos.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/escritura/cambio.ts tests/domain/centro-escritura-cambio.test.ts
git commit -m "D-203: validar un cambio en el turno, al corregir y al guardar

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: La sección `propuestaCambio` (catálogo, validador y armado)

**Files:**
- Create: `src/lib/domain/centro/escritura/tarjeta.ts`
- Modify: `src/lib/domain/centro/runtime/secciones.ts` (añadir kind + tipos + entrada en `DatosPorKind`)
- Modify: `src/lib/domain/centro/runtime/validador.ts` (zod del kind en el objeto de esquemas donde está `propuestaMovimiento`)
- Modify: `tests/domain/centro-agente-catalogo.test.ts` (`32` → `33`)
- Test: `tests/domain/centro-escritura-tarjeta.test.ts`

**Interfaces:**
- Consumes: Task 1, Task 2 (`CambioGuardado`, `Valor`), `validarPorSeccion`, `recortar` de `runtime/secciones.ts`.
- Produces:
  - `interface CampoDeTarjeta { campo: string; etiqueta: string; tipo: TipoCampo; antes: string | null; despues: string | null; editable: boolean; opciones: string[] | null }`
  - `interface ItemDeCambio { propuestaId: string; operacion: Operacion; etiquetaTabla: string; titulo: string; campos: CampoDeTarjeta[] }`
  - `interface DatosPropuestaCambio { items: ItemDeCambio[] }` (en `secciones.ts`, kind `"propuestaCambio"`)
  - `function tituloDeCambio(c: CambioGuardado): string` (≤ 90 caracteres)
  - `function seccionDeCambios(id: string, items: { propuestaId: string; cambio: CambioGuardado }[], filas: ReadonlyMap<string, Record<string, unknown>>): AnySection | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/domain/centro-escritura-tarjeta.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { seccionDeCambios, tituloDeCambio } from "../../src/lib/domain/centro/escritura/tarjeta.ts";
import { validarPorSeccion } from "../../src/lib/domain/centro/runtime/validador.ts";
import type { CambioGuardado } from "../../src/lib/domain/centro/escritura/cambio.ts";

const PID = "99999999-9999-4999-8999-999999999999";
const P = "11111111-1111-4111-8111-111111111111";
const T = "22222222-2222-4222-8222-222222222222";
const filas = new Map<string, Record<string, unknown>>([[`fila:projects:${P}`, { id: P, title: "Tesis" }]]);

const crear: CambioGuardado = { operacion: "crear", tabla: "tasks", id: null, campos: { project_id: P, title: "Escribir intro", priority: "High" }, antes: null };
const editar: CambioGuardado = { operacion: "editar", tabla: "tasks", id: T, campos: { status: "Completed" }, antes: { id: T, title: "Leer", status: "Pending" } };
const borrar: CambioGuardado = { operacion: "borrar", tabla: "tasks", id: T, campos: {}, antes: { id: T, title: "Leer", status: "Pending", priority: "Low", due: null } };

test("Crear: campos con su etiqueta; la ref enseña el nombre de la fila y no se edita", () => {
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: crear }], filas);
  assert.ok(s && s.kind === "propuestaCambio");
  const item = s.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.strictEqual(item?.titulo, "Escribir intro");
  assert.strictEqual(item?.etiquetaTabla, "Tarea");
  assert.deepStrictEqual(item?.campos.find((c) => c.campo === "project_id"), {
    campo: "project_id", etiqueta: "Proyecto", tipo: "ref", antes: null, despues: "Tesis", editable: false, opciones: null
  });
  assert.deepStrictEqual(item?.campos.find((c) => c.campo === "priority"), {
    campo: "priority", etiqueta: "Prioridad", tipo: "opcion", antes: null, despues: "High", editable: true, opciones: ["High", "Medium", "Low"]
  });
});

test("Editar: antes → después; el título sale de la fila leída", () => {
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: editar }], filas);
  const item = s?.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.strictEqual(item?.titulo, "Leer");
  assert.deepStrictEqual(item?.campos, [
    { campo: "status", etiqueta: "Estado", tipo: "opcion", antes: "Pending", despues: "Completed", editable: true, opciones: ["Pending", "InProgress", "Blocked", "Rescheduled", "Completed", "Cancelled"] }
  ]);
});

test("Borrar: la fila entera (campos del registro presentes), nada editable", () => {
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: borrar }], filas);
  const item = s?.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.deepStrictEqual(item?.campos.map((c) => [c.campo, c.antes, c.despues, c.editable]), [
    ["title", "Leer", null, false],
    ["status", "Pending", null, false],
    ["priority", "Low", null, false]
  ]);
});

test("La sección pasa el validador del runtime", () => {
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: crear }, { propuestaId: PID.replace(/9/g, "8"), cambio: editar }], filas);
  assert.ok(s);
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
});

test("Marcado en un campo: la tarjeta lo neutraliza y sigue pasando el validador (Review Focus 2)", () => {
  const nota: CambioGuardado = { operacion: "crear", tabla: "notes", id: null, campos: { notebook_id: P, title: "<b>Hola</b>", body: "<div>texto</div>" }, antes: null };
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: nota }], new Map([[`fila:notebooks:${P}`, { id: P, title: "Ideas" }]]));
  assert.ok(s);
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
  const item = s.kind === "propuestaCambio" ? s.data.items[0]! : null;
  assert.ok(!item?.titulo.includes("<b>"));
});

test("Título larguísimo: recortado a 90; sin título, la primera línea del cuerpo (Review Focus 5)", () => {
  const largo: CambioGuardado = { operacion: "crear", tabla: "notes", id: null, campos: { notebook_id: P, title: null, body: "x".repeat(5000) }, antes: null };
  const t = tituloDeCambio(largo);
  assert.ok(t.length <= 90, String(t.length));
  assert.ok(t.startsWith("xxx"));
  const s = seccionDeCambios("b0", [{ propuestaId: PID, cambio: largo }], filas);
  assert.ok(s);
  assert.strictEqual(validarPorSeccion([s], [], "test").length, 1);
});

test("Sin items, no hay sección", () => {
  assert.strictEqual(seccionDeCambios("b0", [], filas), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test tests/domain/centro-escritura-tarjeta.test.ts`
Expected: FAIL — `Cannot find module …/escritura/tarjeta.ts`

- [ ] **Step 3a: Add the kind to the catalog**

En `src/lib/domain/centro/runtime/secciones.ts`:

1. Import al principio (junto al de `TipoDeMovimiento`):
```ts
import type { Operacion, TipoCampo } from "../escritura/registro.ts";
```
2. En `SECTION_KINDS`, después de `"propuestaMovimiento"`:
```ts
  "propuestaMovimiento",
  // D-203: cambios en cualquier tabla del registro, que la persona guarda.
  "propuestaCambio"
] as const;
```
3. Después de `DatosPropuestaMovimiento`:
```ts
export interface CampoDeTarjeta {
  campo: string;
  etiqueta: string;
  tipo: TipoCampo;
  antes: string | null;
  despues: string | null;
  editable: boolean;
  opciones: string[] | null;
}

export interface ItemDeCambio {
  propuestaId: string;
  operacion: Operacion;
  etiquetaTabla: string;
  titulo: string;
  campos: CampoDeTarjeta[];
}

export interface DatosPropuestaCambio {
  items: ItemDeCambio[];
}
```
4. En `DatosPorKind`, después de `propuestaMovimiento: DatosPropuestaMovimiento;`:
```ts
  propuestaCambio: DatosPropuestaCambio;
```

- [ ] **Step 3b: Add the validator schema**

En `src/lib/domain/centro/runtime/validador.ts`, en el objeto de esquemas, justo después de la entrada `propuestaMovimiento: z.object({...}).strict(),`:
```ts
  propuestaCambio: z
    .object({
      items: z
        .array(
          z
            .object({
              propuestaId: z.string().uuid(),
              operacion: z.enum(["crear", "editar", "borrar"]),
              etiquetaTabla: texto(40),
              titulo: texto(90),
              campos: z
                .array(
                  z
                    .object({
                      campo: z.string().regex(/^[a-z][a-z0-9_]{0,62}$/),
                      etiqueta: texto(60),
                      tipo: z.enum(["texto", "numero", "entero", "fecha", "opcion", "ref"]),
                      antes: texto(400).nullable(),
                      despues: texto(400).nullable(),
                      editable: z.boolean(),
                      opciones: z.array(texto(40)).max(12).nullable()
                    })
                    .strict()
                )
                .max(12)
            })
            .strict()
        )
        .min(1)
        .max(10)
    })
    .strict(),
```

- [ ] **Step 3c: Write `tarjeta.ts`**

```ts
// src/lib/domain/centro/escritura/tarjeta.ts
// De un cambio guardado a lo que la tarjeta enseña (D-203). Puro, probado en
// tests/domain/centro-escritura-tarjeta.test.ts.
//
// LO QUE SE ENSEÑA NO ES LO QUE SE GUARDA. La tarjeta lleva textos para leer
// —recortados y sin marcado, porque el validador del runtime tumba la sección
// entera ante un `<div>`— y `confirmarCambio` guarda el payload de
// `coach_proposals`, intacto. Neutralizar aquí no cambia lo que se escribe.

import type { AnySection } from "../runtime/types.ts";
import type { CampoDeTarjeta, ItemDeCambio } from "../runtime/secciones.ts";
import { ESCRITURA_POR_TABLA, camposDe, type CampoDeEscritura, type EntradaDeEscritura } from "./registro.ts";
import type { CambioGuardado } from "./cambio.ts";

const MAX_TITULO = 90;
const MAX_VALOR = 400;

/** Sin `<` ni `>`: el validador ve «‹div›» como texto, no como etiqueta. */
function paraLeer(v: string, max: number): string {
  const limpio = v.replace(/</g, "‹").replace(/>/g, "›").replace(/\s+/g, " ").trim();
  return limpio.length > max ? `${limpio.slice(0, max - 1)}…` : limpio;
}

function comoTexto(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") return paraLeer(v, MAX_VALOR);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return null;
}

/** El nombre de la fila a la que apunta una ref, leído en el turno. */
function nombreDeRef(c: CampoDeEscritura, uuid: unknown, filas: ReadonlyMap<string, Record<string, unknown>>): string | null {
  if (typeof uuid !== "string") return null;
  const f = filas.get(`fila:${c.refTabla}:${uuid}`);
  const n = f?.title ?? f?.name;
  return typeof n === "string" && n.trim() ? paraLeer(n, MAX_VALOR) : null;
}

export function tituloDeCambio(c: CambioGuardado): string {
  const e = ESCRITURA_POR_TABLA[c.tabla] as EntradaDeEscritura;
  const fuente = c.operacion === "crear" ? c.campos : { ...(c.antes ?? {}), ...c.campos };
  const principal = fuente[e.titulo];
  // Una nota sin título se titula con su primera línea, como en /notebooks.
  const alterno = c.tabla === "notes" ? fuente.body : null;
  const crudo = typeof principal === "string" && principal.trim() ? principal : typeof alterno === "string" ? alterno.split("\n")[0] ?? "" : "";
  return paraLeer(crudo, MAX_TITULO) || e.etiqueta;
}

function camposDeTarjeta(c: CambioGuardado, filas: ReadonlyMap<string, Record<string, unknown>>): CampoDeTarjeta[] {
  const e = ESCRITURA_POR_TABLA[c.tabla] as EntradaDeEscritura;
  const base = (nombre: string, def: CampoDeEscritura) => ({
    campo: nombre,
    etiqueta: def.etiqueta,
    tipo: def.tipo,
    opciones: def.opciones ? [...def.opciones] : null
  });

  if (c.operacion === "borrar") {
    return Object.entries(e.campos)
      .filter(([n]) => c.antes && c.antes[n] !== undefined && c.antes[n] !== null)
      .map(([n, def]) => ({ ...base(n, def), antes: comoTexto(c.antes![n]), despues: null, editable: false }));
  }

  const permitidos = new Map(camposDe(e, c.operacion));
  return Object.entries(c.campos)
    .filter(([n]) => permitidos.has(n))
    .map(([n, v]) => {
      const def = permitidos.get(n)!;
      const despues = def.tipo === "ref" ? nombreDeRef(def, v, filas) : comoTexto(v);
      const antes = c.operacion === "editar" ? comoTexto(c.antes?.[n]) : null;
      return { ...base(n, def), antes, despues, editable: def.tipo !== "ref" };
    });
}

export function seccionDeCambios(
  id: string,
  items: { propuestaId: string; cambio: CambioGuardado }[],
  filas: ReadonlyMap<string, Record<string, unknown>>
): AnySection | null {
  if (!items.length) return null;
  const datos: ItemDeCambio[] = items.map(({ propuestaId, cambio }) => ({
    propuestaId,
    operacion: cambio.operacion,
    etiquetaTabla: (ESCRITURA_POR_TABLA[cambio.tabla] as EntradaDeEscritura).etiqueta,
    titulo: tituloDeCambio(cambio),
    campos: camposDeTarjeta(cambio, filas)
  }));
  return { id, kind: "propuestaCambio", data: { items: datos } };
}
```

- [ ] **Step 3d: Update the catalog count**

En `tests/domain/centro-agente-catalogo.test.ts`, cambiar `assert.strictEqual(SECTION_KINDS.length, 32);` por `assert.strictEqual(SECTION_KINDS.length, 33);`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/domain/centro-escritura-tarjeta.test.ts tests/domain/centro-agente-catalogo.test.ts tests/domain/centro-runtime-catalogo.test.ts tests/domain/centro-runtime-validador.test.ts`
Expected: PASS. Si `centro-runtime-catalogo.test.ts` también cuenta kinds o exige un esquema por kind con componente, ajusta su número igual que en 3d (no el comportamiento).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/escritura/tarjeta.ts src/lib/domain/centro/runtime/secciones.ts src/lib/domain/centro/runtime/validador.ts tests/domain/centro-escritura-tarjeta.test.ts tests/domain/centro-agente-catalogo.test.ts
git commit -m "D-203: la sección propuestaCambio y cómo se arma

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `esquema_de_tabla`, el índice del prompt y el bloque del contrato

**Files:**
- Create: `src/lib/domain/centro/escritura/esquema.ts`
- Modify: `src/lib/domain/centro/agente/contrato.ts`
- Modify: `src/lib/domain/centro/agente/prompt.ts`
- Test: `tests/domain/centro-escritura-esquema.test.ts`, modify `tests/domain/centro-agente-contrato.test.ts`, `tests/domain/centro-agente-prompt.test.ts`

**Interfaces:**
- Consumes: Task 1; `CajaDeHerramientas`, `FunctionDeclaration` de `src/lib/domain/ai/tools.ts`.
- Produces:
  - `function esquemaParaModelo(tabla: string, autorizados: readonly Domain[]): unknown` (objeto para el modelo, o `{ error: "Esa tabla no está disponible." }`)
  - `function indiceDeEscritura(): string`
  - `function conEscritura(caja: CajaDeHerramientas, autorizados: readonly Domain[]): CajaDeHerramientas`
  - `const MAX_CAMBIOS_POR_BLOQUE = 5`, `const MAX_CAMBIOS_POR_TURNO = 10` (en `contrato.ts`)
  - Variante nueva de `BloqueDelAgente`: `{ kind: "propuesta_cambio"; cambios: { operacion: "crear" | "editar" | "borrar"; tabla?: string | null; fila?: string | null; campos?: Record<string, unknown> | null }[] }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/domain/centro-escritura-esquema.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { esquemaParaModelo, indiceDeEscritura, conEscritura } from "../../src/lib/domain/centro/escritura/esquema.ts";
import type { CajaDeHerramientas } from "../../src/lib/domain/ai/tools.ts";

test("esquema_de_tabla: campos, tipos, obligatorios y opciones de una tabla autorizada", () => {
  const e = esquemaParaModelo("food_entries", ["nutrition"]) as { tabla: string; operaciones: string[]; campos: { nombre: string; obligatorioAlCrear: boolean; opciones?: string[] }[] };
  assert.strictEqual(e.tabla, "food_entries");
  assert.deepStrictEqual(e.operaciones, ["crear", "editar", "borrar"]);
  const meal = e.campos.find((c) => c.nombre === "meal");
  assert.deepStrictEqual(meal?.opciones, ["Desayuno", "Almuerzo", "Cena", "Snack"]);
  assert.strictEqual(meal?.obligatorioAlCrear, true);
});

test("esquema_de_tabla: no autorizada e inexistente responden igual", () => {
  assert.deepStrictEqual(esquemaParaModelo("food_entries", ["execution"]), esquemaParaModelo("profiles", ["execution"]));
});

test("El índice nombra cada tabla escribible", () => {
  const i = indiceDeEscritura();
  for (const t of ["tasks", "notes", "food_entries"]) assert.match(i, new RegExp(`\\b${t}\\b`));
});

function cajaFalsa(): CajaDeHerramientas & { llamadas: string[] } {
  const llamadas: string[] = [];
  return {
    llamadas,
    declaraciones: [{ name: "consultar", description: "x", parameters: { type: "OBJECT", properties: {} } }],
    ejecutar: async (name) => {
      llamadas.push(name);
      return { ok: name };
    },
    entregados: () => new Set(),
    filasEntregadas: () => new Map(),
    busquedas: () => []
  };
}

test("conEscritura: añade esquema_de_tabla y delega el resto", async () => {
  const base = cajaFalsa();
  const caja = conEscritura(base, ["execution"]);
  assert.deepStrictEqual(caja.declaraciones.map((d) => d.name), ["consultar", "esquema_de_tabla"]);
  const e = (await caja.ejecutar("esquema_de_tabla", { tabla: "tasks" })) as { tabla: string };
  assert.strictEqual(e.tabla, "tasks");
  assert.deepStrictEqual(await caja.ejecutar("consultar", {}), { ok: "consultar" });
  assert.deepStrictEqual(base.llamadas, ["consultar"]);
});
```

Añadir al final de `tests/domain/centro-agente-contrato.test.ts`:
```ts
test("propuesta_cambio: 1–5 cambios; la forma fina se valida después, contra las filas", () => {
  const b = (datos: unknown) => ({ kind: "propuesta_cambio", datos: JSON.stringify(datos) });
  const uno = parsearRespuesta({ texto: "¿Lo guardo?", bloques: [b({ cambios: [{ operacion: "crear", tabla: "tasks", campos: { title: "X" } }] })] });
  assert.ok(uno.ok);
  assert.deepStrictEqual(uno.ok && uno.value.bloques[0], { kind: "propuesta_cambio", cambios: [{ operacion: "crear", tabla: "tasks", campos: { title: "X" } }] });
  const seis = parsearRespuesta({ texto: "x", bloques: [b({ cambios: Array.from({ length: 6 }, () => ({ operacion: "borrar", fila: "fila:tasks:1" })) })] });
  assert.strictEqual(seis.ok && seis.value.bloques.length, 0);
  const mala = parsearRespuesta({ texto: "x", bloques: [b({ cambios: [{ operacion: "truncar" }] })] });
  assert.strictEqual(mala.ok && mala.value.bloques.length, 0);
});
```
(Si `parsearRespuesta` no está importado en ese archivo, añade `import { parsearRespuesta } from "../../src/lib/domain/centro/agente/contrato.ts";`.)

Añadir al final de `tests/domain/centro-agente-prompt.test.ts`:
```ts
test("El system explica propuesta_cambio, esquema_de_tabla y trae el índice de tablas", () => {
  assert.ok(SYSTEM_AGENTE.includes("«propuesta_cambio»"));
  assert.match(SYSTEM_AGENTE, /esquema_de_tabla/);
  for (const t of ["tasks", "notes", "food_entries"]) assert.ok(SYSTEM_AGENTE.includes(t), t);
  assert.match(SYSTEM_AGENTE, /Nunca digas que ya quedó (guardado|registrado)/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-strip-types --test tests/domain/centro-escritura-esquema.test.ts tests/domain/centro-agente-contrato.test.ts tests/domain/centro-agente-prompt.test.ts`
Expected: FAIL — módulo `esquema.ts` inexistente; el bloque `propuesta_cambio` se descarta; el prompt no lo nombra.

- [ ] **Step 3a: Write `esquema.ts`**

```ts
// src/lib/domain/centro/escritura/esquema.ts
// Cómo sabe el modelo qué puede escribir sin que el prompt cargue 49 esquemas
// (D-203). Puro, probado en tests/domain/centro-escritura-esquema.test.ts.
//
// El prompt lleva un ÍNDICE corto (tabla + para qué + operaciones). Los campos
// se piden con la herramienta `esquema_de_tabla` justo antes de proponer. Los
// dos salen del registro: no pueden desincronizarse.

import type { Domain } from "../../insights/types.ts";
import type { CajaDeHerramientas, FunctionDeclaration } from "../../ai/tools.ts";
import { ESCRITURA_POR_TABLA, entradaDe, type EntradaDeEscritura } from "./registro.ts";

const NO_DISPONIBLE = { error: "Esa tabla no está disponible." };

export function esquemaParaModelo(tabla: string, autorizados: readonly Domain[]): unknown {
  const e = entradaDe(tabla, autorizados);
  if (!e) return NO_DISPONIBLE;
  return {
    tabla: e.tabla,
    operaciones: [...e.operaciones],
    campos: Object.entries(e.campos).map(([nombre, c]) => ({
      nombre,
      etiqueta: c.etiqueta,
      tipo: c.tipo,
      obligatorioAlCrear: Boolean(c.obligatorio) && !c.soloEditar,
      soloAlCrear: Boolean(c.soloCrear),
      soloAlEditar: Boolean(c.soloEditar),
      ...(c.opciones ? { opciones: [...c.opciones] } : {}),
      ...(c.min !== undefined ? { min: c.min } : {}),
      ...(c.max !== undefined ? { max: c.max } : {}),
      ...(c.refTabla ? { refTabla: c.refTabla, nota: `"fila:${c.refTabla}:<uuid>" de una fila que leíste` } : {})
    })),
    nota: "Para editar o borrar, lee primero la fila (buscar o consultar) y usa su id. Al editar manda solo los campos que cambian."
  };
}

export function indiceDeEscritura(): string {
  return Object.entries(ESCRITURA_POR_TABLA as Record<string, EntradaDeEscritura>)
    .map(([t, e]) => `- ${t} (${e.etiqueta}): ${e.descripcion}. [${e.operaciones.join("/")}]`)
    .join("\n");
}

const DECLARACION: FunctionDeclaration = {
  name: "esquema_de_tabla",
  description:
    "Devuelve los campos que puedes escribir en una tabla (tipo, obligatorios, valores permitidos) y qué operaciones admite. Llámala SIEMPRE antes de proponer un cambio en esa tabla.",
  parameters: {
    type: "OBJECT",
    properties: {
      tabla: { type: "STRING", description: "La tabla.", enum: Object.keys(ESCRITURA_POR_TABLA), format: "enum" }
    },
    required: ["tabla"],
    propertyOrdering: ["tabla"]
  }
};

/** La caja del Centro: la de siempre más `esquema_de_tabla`. El resto se delega tal cual. */
export function conEscritura(caja: CajaDeHerramientas, autorizados: readonly Domain[]): CajaDeHerramientas {
  return {
    ...caja,
    declaraciones: [...caja.declaraciones, DECLARACION],
    async ejecutar(name, args) {
      if (name === DECLARACION.name) return esquemaParaModelo(String(args.tabla ?? ""), autorizados);
      return caja.ejecutar(name, args);
    }
  };
}
```

- [ ] **Step 3b: Add the block to the contract**

En `src/lib/domain/centro/agente/contrato.ts`:

1. Debajo de `export const MAX_BLOQUES = 4;`:
```ts
export const MAX_CAMBIOS_POR_BLOQUE = 5;
export const MAX_CAMBIOS_POR_TURNO = 10;
```
2. `KINDS_DEL_AGENTE`: añadir `"propuesta_cambio"` después de `"propuesta_movimiento"`.
3. Después de `ESQUEMA_PROPUESTA_MOVIMIENTO`:
```ts
/**
 * Cambios en cualquier tabla del registro de escritura (D-203). Aquí solo la
 * FORMA gruesa: qué tabla, qué campos y si la fila se leyó se comprueba en
 * `validarCambio`, que necesita las filas del turno.
 */
const ESQUEMA_PROPUESTA_CAMBIO = z
  .object({
    cambios: z
      .array(
        z
          .object({
            operacion: z.enum(["crear", "editar", "borrar"]),
            tabla: z.string().max(64).nullable().optional(),
            fila: z.string().max(120).nullable().optional(),
            campos: z.record(z.unknown()).nullable().optional()
          })
          .strict()
      )
      .min(1)
      .max(MAX_CAMBIOS_POR_BLOQUE)
  })
  .strict();
```
4. En `BloqueDelAgente`, añadir:
```ts
  | ({ kind: "propuesta_cambio" } & z.infer<typeof ESQUEMA_PROPUESTA_CAMBIO>)
```
5. En `parsearBloque`, en la cadena de ternarios, antes de `: null;`:
```ts
              : kind === "propuesta_cambio"
                ? ESQUEMA_PROPUESTA_CAMBIO
```
(queda `: kind === "propuesta_movimiento" ? ESQUEMA_PROPUESTA_MOVIMIENTO : kind === "propuesta_cambio" ? ESQUEMA_PROPUESTA_CAMBIO : null;`).

- [ ] **Step 3c: Teach the prompt**

En `src/lib/domain/centro/agente/prompt.ts`:

1. Imports:
```ts
import { MAX_BLOQUES, MAX_CAMBIOS_POR_BLOQUE } from "./contrato.ts";
import { indiceDeEscritura } from "../escritura/esquema.ts";
```
2. En `SYSTEM_AGENTE`, en «Bloques de acción», después de la línea de «propuesta_movimiento», añadir:
```
- «propuesta_cambio»: { "cambios": [ { "operacion": "crear", "tabla", "campos": {…} } | { "operacion": "editar", "fila": "fila:<tabla>:<uuid>", "campos": {solo lo que cambia} } | { "operacion": "borrar", "fila": "fila:<tabla>:<uuid>" } ] } (1–${MAX_CAMBIOS_POR_BLOQUE}). Cuando la persona pide registrar, apuntar, cambiar, marcar o borrar algo. ANTES llama a esquema_de_tabla para saber los campos; para editar o borrar, lee primero la fila (buscar o consultar) y usa su "fila". En "campos" SÍ van valores: los que la persona dijo o los que se deducen sin inventar (si falta un dato obligatorio, pregúntalo en "texto" y no propongas). Un "ref" (proyecto, cuaderno) es el id de una fila que leíste. NO se guarda solo: la persona pulsa Guardar en cada cambio. Nunca digas que ya quedó guardado.
```
3. Antes del párrafo final «Elige los bloques…», añadir:
```
Tablas en las que puedes proponer cambios:
${indiceDeEscritura()}
```
4. Cambiar en la REGLA DE ORO la frase de la excepción por: `La única excepción son el "monto" de «propuesta_movimiento» y los "campos" de «propuesta_cambio»: valores que la persona dictó y confirma antes de guardar.`

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-strip-types --test tests/domain/centro-escritura-esquema.test.ts tests/domain/centro-agente-contrato.test.ts tests/domain/centro-agente-prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/centro/escritura/esquema.ts src/lib/domain/centro/agente/contrato.ts src/lib/domain/centro/agente/prompt.ts tests/domain/centro-escritura-esquema.test.ts tests/domain/centro-agente-contrato.test.ts tests/domain/centro-agente-prompt.test.ts
git commit -m "D-203: esquema_de_tabla, el índice del prompt y el bloque propuesta_cambio

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Migración 0078 (`tipo = 'cambio'`) con su pgTAP

**Files:**
- Create: `supabase/migrations/0078_centro_escritura.sql`
- Create: `supabase/tests/0048_centro_escritura.sql`

**Interfaces:**
- Produces: `coach_proposals.tipo` admite `'cambio'`.

- [ ] **Step 1: Write the failing pgTAP test**

```sql
-- supabase/tests/0048_centro_escritura.sql — pgTAP: migración 0078 (D-203).
begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'escritura-a@test.local'),
  ('f4444444-4444-4444-8444-444444444444', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'escritura-b@test.local')
on conflict (id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'f3333333-3333-4333-8333-333333333333', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo, payload) values
  ('f3333333-3333-4333-8333-333333333333', null, 'centro', 'cambio', 'Avena',
   '{"operacion":"crear","tabla":"food_entries","id":null,"campos":{"name":"Avena"},"antes":null}');

select is((select tipo from public.coach_proposals where titulo = 'Avena'), 'cambio', 'El tipo cambio se admite (0078)');

-- La lista es acumulativa (ver 0071): los anteriores siguen vivos.
insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo, payload) values
  ('f3333333-3333-4333-8333-333333333333', null, 'centro', 'nota', 'Idea', '{}'),
  ('f3333333-3333-4333-8333-333333333333', null, 'centro', 'foco', 'Sigue', '{"href":"/money"}');
select is((select count(*)::int from public.coach_proposals where tipo in ('nota', 'foco', 'cambio')), 3, 'nota, foco y cambio conviven');

select throws_ok(
  $$ insert into public.coach_proposals (user_id, message_id, origen, tipo, titulo)
     values ('f3333333-3333-4333-8333-333333333333', null, 'centro', 'inventado', 'x') $$,
  '23514', null, 'Un tipo inventado se sigue rechazando'
);

-- La RLS no cambia: otra persona no ve el cambio propuesto.
select set_config('request.jwt.claims', json_build_object('sub', 'f4444444-4444-4444-8444-444444444444', 'role', 'authenticated')::text, true);
select is((select count(*)::int from public.coach_proposals where tipo = 'cambio'), 0, 'Un cambio propuesto es privado de quien lo recibió');

select * from finish();
rollback;
```

- [ ] **Step 2: Run to verify it fails**

Run: `supabase test db` (requiere `supabase start`; NO hace `db reset`).
Expected: FAIL en 0048 — `new row … violates check constraint "coach_proposals_tipo_check"`.

- [ ] **Step 3: Write the migration**

```sql
-- 0078_centro_escritura.sql
--
-- EL CENTRO PROPONE CAMBIOS EN CUALQUIER TABLA DEL REGISTRO (D-203).
--
-- Un cambio que el modelo propone se guarda aquí como `tipo = 'cambio'` antes
-- de enseñarse, igual que las recomendaciones del Centro (D-194): la tarjeta
-- solo lleva el id, y `confirmarCambio` relee el payload, lo vuelve a validar
-- contra el registro y lo escribe por la server action de la sección.
--
-- LA LISTA DE TIPOS ES ACUMULATIVA (ver 0071). Esta es la de 0071 + 'cambio'.
alter table public.coach_proposals drop constraint if exists coach_proposals_tipo_check;
alter table public.coach_proposals add constraint coach_proposals_tipo_check
  check (tipo in ('tarea', 'bloque', 'rutina', 'estructura', 'meta', 'arista', 'foco', 'nota', 'cambio'));

comment on column public.coach_proposals.tipo is
  'Qué propone. `foco` (D-167) no crea nada: lleva a una pantalla. `nota` (D-168) acaba en un cuaderno. `cambio` (D-203) es crear/editar/borrar una fila de una tabla del registro de escritura del Centro; su payload lleva {operacion, tabla, id, campos, antes}. Todos se aplican por la Server Action real.';
```

- [ ] **Step 4: Apply and run**

Run: `supabase migration up && supabase test db`
Expected: PASS (0048: 4/4) y el resto de pgTAP en verde.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0078_centro_escritura.sql supabase/tests/0048_centro_escritura.sql
git commit -m "D-203: coach_proposals admite el tipo cambio (0078)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Adaptadores y `confirmarCambio`

**Files:**
- Create: `src/lib/centro/escritura/adaptadores.ts`
- Create: `src/lib/centro/escritura/confirmar.ts`
- Modify: `src/lib/coach/actions.ts` (`loadPendingProposals`)

**Interfaces:**
- Consumes: Task 1 (`ESCRITURA_POR_TABLA`, `TablaEscribible`), Task 2 (`CambioGuardado`, `revalidarGuardado`, `aplicarCorrecciones`); server actions `createTask`, `renameTask`, `setTaskStatus`, `updateTaskDates`, `deleteTask` (`@/app/(app)/execution/actions`), `setTaskPriority` (`@/app/(app)/execution/board-actions`), `createNote`, `saveNote`, `deleteNote` (`@/app/(app)/notebooks/actions`), `logFoodEntry`, `updateFoodEntry`, `deleteFoodEntry` (`@/app/(app)/development/nutrition/actions`); `requireUser` (`@/lib/data/session`); `allowedDomains` (`@/lib/insights/context`); `ActionResult`, `actionFailed` (`@/lib/supabase/errors`).
- Produces:
  - `type Adaptador = (c: CambioGuardado) => Promise<ActionResult>`
  - `const ADAPTADORES` tipado para que falte uno = error de `tsc`
  - `confirmarCambio(propuestaId: string, correcciones?: Record<string, string>): Promise<ActionResult & { yaGuardado?: boolean }>`
  - `descartarCambio(propuestaId: string): Promise<ActionResult>`

Este task no tiene test de unidad (todo es `server-only` y toca Supabase); lo cubren `tsc` (cobertura de adaptadores) y la prueba en navegador de Task 8.

- [ ] **Step 1: Write `adaptadores.ts`**

```ts
// src/lib/centro/escritura/adaptadores.ts
// Cada tabla×operación del registro, por la server action que ya usa su
// sección (D-203). SERVIDOR.
//
// NUNCA UN INSERT SUELTO. Las acciones de cada sección llevan sus zod, sus
// triggers, su `task_history`, su `revalidatePath`. Escribir por otro camino
// saltaría todo eso sin que fallara nada. Si una tabla no tiene acción
// adecuada, se escribe en su `actions.ts`, no aquí.
//
// EL TIPO ES EL TEST DE COBERTURA: una operación declarada en el registro sin
// adaptador rompe `tsc`.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/supabase/errors";
import type { CambioGuardado } from "@/lib/domain/centro/escritura/cambio.ts";
import type { ESCRITURA_POR_TABLA, TablaEscribible } from "@/lib/domain/centro/escritura/registro.ts";
import { createTask, renameTask, setTaskStatus, updateTaskDates, deleteTask } from "@/app/(app)/execution/actions";
import { setTaskPriority } from "@/app/(app)/execution/board-actions";
import { createNote, saveNote, deleteNote } from "@/app/(app)/notebooks/actions";
import { logFoodEntry, updateFoodEntry, deleteFoodEntry } from "@/app/(app)/development/nutrition/actions";
import type { TaskStatus, Priority } from "@/lib/domain/types";

export type Adaptador = (c: CambioGuardado) => Promise<ActionResult>;

type Cobertura = {
  [T in TablaEscribible]: { [O in (typeof ESCRITURA_POR_TABLA)[T]["operaciones"][number]]: Adaptador };
};

/**
 * Las acciones del repo devuelven de tres formas: `ActionResult`, `void` o
 * lanzan (`createTask`, `setTaskStatus`). Aquí se vuelven todas `ActionResult`.
 */
async function seguro(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "ok" in r && (r as ActionResult).ok === false) return r as ActionResult;
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const ADAPTADORES: Cobertura = {
  tasks: {
    crear: (c) =>
      seguro(() =>
        createTask(
          formulario({
            projectId: s(c.campos.project_id),
            title: s(c.campos.title),
            priority: s(c.campos.priority) || "Medium",
            due: s(c.campos.due),
            est: s(c.campos.est) || "30"
          })
        )
      ),
    editar: (c) =>
      seguro(async () => {
        const id = c.id!;
        // Una acción por campo: cada una tiene su regla (la máquina de estados
        // de `setTaskStatus`, el `urgent` de `setTaskPriority`).
        if (typeof c.campos.title === "string") await renameTask(id, c.campos.title);
        if (typeof c.campos.priority === "string") {
          const supabase = await createClient();
          const { data } = await supabase.from("tasks").select("urgent").eq("id", id).single();
          await setTaskPriority(id, c.campos.priority as Priority, data?.urgent ?? false);
        }
        if ("due" in c.campos) {
          const supabase = await createClient();
          const { data } = await supabase.from("tasks").select("start_date").eq("id", id).single();
          await updateTaskDates(id, data?.start_date ?? null, (c.campos.due as string | null) ?? null);
        }
        if (typeof c.campos.status === "string") await setTaskStatus(id, c.campos.status as TaskStatus);
      }),
    borrar: (c) => seguro(() => deleteTask(c.id!))
  },
  notes: {
    crear: (c) =>
      seguro(async () => {
        const creada = await createNote(s(c.campos.notebook_id));
        if (!creada.ok || !creada.id) return creada;
        // Una nota nace vacía con version 1 (0032); el texto va en su primer guardado.
        return saveNote(creada.id, s(c.campos.title), s(c.campos.body), 1);
      }),
    editar: (c) =>
      seguro(async () => {
        const supabase = await createClient();
        const { data: actual } = await supabase.from("notes").select("title, body, version").eq("id", c.id!).single();
        if (!actual) return { ok: false, reason: "Esta nota ya no existe." };
        return saveNote(
          c.id!,
          typeof c.campos.title === "string" ? c.campos.title : actual.title,
          typeof c.campos.body === "string" ? c.campos.body : actual.body,
          actual.version
        );
      }),
    borrar: (c) => seguro(() => deleteNote(c.id!))
  },
  food_entries: {
    crear: (c) =>
      seguro(() =>
        logFoodEntry(
          s(c.campos.local_date),
          formulario({
            meal: s(c.campos.meal),
            name: s(c.campos.name),
            brand: "",
            grams: s(c.campos.grams),
            kcal100: s(c.campos.kcal100),
            protein100: s(c.campos.protein100) || "0",
            carbs100: s(c.campos.carbs100) || "0",
            fat100: s(c.campos.fat100) || "0"
          })
        )
      ),
    editar: (c) =>
      seguro(async () => {
        // `updateFoodEntry` pide la fila entera y recalcula los macros desde
        // «por 100 g». Se derivan de lo guardado: cambiar los gramos escala.
        const supabase = await createClient();
        const { data: f } = await supabase
          .from("food_entries")
          .select("meal, name, brand, grams, kcal, protein_g, carbs_g, fat_g, food_id")
          .eq("id", c.id!)
          .single();
        if (!f) return { ok: false, reason: "Esta comida ya no existe." };
        const por100 = (x: number) => (f.grams > 0 ? r2((x / f.grams) * 100) : 0);
        return updateFoodEntry(
          c.id!,
          formulario({
            meal: s(c.campos.meal ?? f.meal),
            name: s(c.campos.name ?? f.name),
            brand: s(f.brand),
            grams: s(c.campos.grams ?? f.grams),
            foodId: s(f.food_id),
            kcal100: String(por100(f.kcal)),
            protein100: String(por100(f.protein_g)),
            carbs100: String(por100(f.carbs_g)),
            fat100: String(por100(f.fat_g))
          })
        );
      }),
    borrar: (c) => seguro(() => deleteFoodEntry(c.id!))
  }
};
```

- [ ] **Step 2: Write `confirmar.ts`**

```ts
// src/lib/centro/escritura/confirmar.ts
// Guardar o descartar lo que el Centro propuso (D-203).
//
// EL NAVEGADOR SOLO MANDA UN ID (y, si la persona corrigió algo, esos campos).
// Lo que se escribe sale de `coach_proposals.payload`, que se vuelve a pasar
// por el registro y por `ai_domains` AHORA, no cuando se propuso.
//
// Reclamo `pending → aplicando` como `acceptProposal`: dos clics a la vez no
// escriben dos veces.
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/data/session";
import { allowedDomains } from "@/lib/insights/context";
import { actionFailed, type ActionResult } from "@/lib/supabase/errors";
import { revalidarGuardado, aplicarCorrecciones } from "@/lib/domain/centro/escritura/cambio.ts";
import type { Domain } from "@/lib/domain/insights/types.ts";
import { ADAPTADORES, type Adaptador } from "./adaptadores";

const correccionesSchema = z.record(z.string().max(20000)).default({});

export async function confirmarCambio(
  propuestaId: string,
  correcciones: Record<string, string> = {}
): Promise<ActionResult & { yaGuardado?: boolean }> {
  const id = z.string().uuid().safeParse(propuestaId);
  const corr = correccionesSchema.safeParse(correcciones);
  if (!id.success || !corr.success) return { ok: false, reason: "Esta propuesta no existe." };

  const { supabase, user } = await requireUser();

  const [{ data: fila }, { data: perfil }] = await Promise.all([
    supabase.from("coach_proposals").select("id, tipo, payload, status").eq("id", id.data).eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("ai_domains").eq("user_id", user.id).single()
  ]);
  if (!fila || fila.tipo !== "cambio") return { ok: false, reason: "Esta propuesta ya no está." };
  if (fila.status === "accepted") return { ok: false, yaGuardado: true, reason: "Ya guardado." };
  if (fila.status !== "pending") return { ok: false, reason: "Esta propuesta ya se resolvió." };

  // Los mismos dominios que el cerebro: el opt-in de la persona ∩ lo global.
  const activos = (perfil?.ai_domains ?? []) as Domain[];
  const autorizados = allowedDomains("global").filter((d) => activos.includes(d));

  const valido = revalidarGuardado(fila.payload, autorizados);
  if (!valido.ok) return valido;
  const corregido = aplicarCorrecciones(valido.cambio, corr.data);
  if (!corregido.ok) return corregido;
  const cambio = corregido.cambio;

  if (cambio.operacion !== "crear") {
    const { data: existe } = await supabase.from(cambio.tabla).select("id").eq("id", cambio.id!).maybeSingle();
    if (!existe) {
      await supabase
        .from("coach_proposals")
        .update({ status: "dismissed", resolved_at: new Date().toISOString() })
        .eq("id", id.data)
        .eq("status", "pending");
      return { ok: false, reason: "Esta fila ya no existe o cambió; vuelve a pedírselo al Centro." };
    }
  }

  const { data: reclamada } = await supabase
    .from("coach_proposals")
    .update({ status: "aplicando" })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!reclamada) return { ok: false, yaGuardado: true, reason: "Ya guardado." };

  const adaptador = (ADAPTADORES[cambio.tabla] as Record<string, Adaptador>)[cambio.operacion]!;
  const resultado = await adaptador(cambio);

  if (!resultado.ok) {
    await supabase.from("coach_proposals").update({ status: "pending" }).eq("id", id.data).eq("status", "aplicando");
    return resultado;
  }

  const { error } = await supabase
    .from("coach_proposals")
    .update({ status: "accepted", resolved_at: new Date().toISOString(), payload: cambio as unknown as Record<string, never> })
    .eq("id", id.data)
    .eq("status", "aplicando");
  if (error) return actionFailed(error);

  await supabase.from("audit_log").insert({
    user_id: user.id,
    action: "ai.centro_escritura",
    object: cambio.id ?? cambio.tabla,
    meta: { tabla: cambio.tabla, operacion: cambio.operacion, propuestaId: id.data, corregidos: Object.keys(corr.data) }
  });
  revalidatePath("/home");
  return { ok: true };
}

export async function descartarCambio(propuestaId: string): Promise<ActionResult> {
  const id = z.string().uuid().safeParse(propuestaId);
  if (!id.success) return { ok: false, reason: "Esta propuesta no existe." };
  const { supabase, user } = await requireUser();
  const { error } = await supabase
    .from("coach_proposals")
    .update({ status: "dismissed", resolved_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("user_id", user.id)
    .eq("tipo", "cambio")
    .eq("status", "pending");
  return error ? actionFailed(error) : { ok: true };
}
```

- [ ] **Step 3: Keep `cambio` out of the chat rail**

En `src/lib/coach/actions.ts`, en `loadPendingProposals`, añadir `.neq("tipo", "cambio")` después de `.eq("status", "pending")`, con este comentario encima de la consulta:
```ts
  // `cambio` (D-203) se pinta en el Centro con su tarjeta de diff; la barra
  // del chat no sabe aceptarlo y sería un botón que falla.
```

- [ ] **Step 4: Typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: sin errores. Si `tsc` se queja del `.from(cambio.tabla)` con una unión, usa `supabase.from(cambio.tabla as "tasks")` SOLO en la línea del `select("id")` (todas tienen `id`), con un comentario que lo diga. Si se queja de `payload`, usa el tipo `Json` de `@/types/database.types` en vez de `Record<string, never>`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/centro/escritura/adaptadores.ts src/lib/centro/escritura/confirmar.ts src/lib/coach/actions.ts
git commit -m "D-203: confirmarCambio escribe por la server action de cada sección

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: El turno propone cambios (proponer + pensar + cerebro + rondas)

**Files:**
- Create: `src/lib/centro/escritura/proponer.ts`
- Modify: `src/lib/ai/gemini-provider.ts` (opción `maxToolRounds`)
- Modify: `src/lib/ai-chat/cerebro.ts` (campo `dominios`)
- Modify: `src/lib/centro/agente/pensar.ts`

**Interfaces:**
- Consumes: Task 2 (`validarCambio`, `aGuardar`), Task 3 (`seccionDeCambios`, `tituloDeCambio`), Task 4 (`conEscritura`, `MAX_CAMBIOS_POR_TURNO`, variante `propuesta_cambio` de `BloqueDelAgente`), `Cerebro`.
- Produces:
  - `Cerebro.dominios: Domain[]`
  - `GenerateJsonInput.maxToolRounds?: number`
  - `proponerCambios(b: { cambios: unknown[] }, id: string, cerebro: Cerebro, filas: ReadonlyMap<string, Record<string, unknown>>, cupo: { restantes: number }): Promise<AnySection[]>`

- [ ] **Step 1: `maxToolRounds` in the provider**

En `src/lib/ai/gemini-provider.ts`:
1. En `GenerateJsonInput<T>` (tras `executeTool`):
```ts
  /**
   * Tope de rondas de herramientas para ESTA llamada. Por defecto
   * `MAX_RONDAS_HERRAMIENTAS`. El Centro pide más (D-203): buscar → esquema →
   * leer la fila → proponer ya son cuatro.
   */
  maxToolRounds?: number;
```
2. En `conversarConModelo`, al principio del cuerpo:
```ts
  const tope = input.maxToolRounds ?? MAX_RONDAS_HERRAMIENTAS;
```
y sustituir las dos apariciones de `MAX_RONDAS_HERRAMIENTAS` dentro del `for` por `tope`.

- [ ] **Step 2: `dominios` in the cerebro**

En `src/lib/ai-chat/cerebro.ts`: añadir `dominios: Domain[];` a `interface Cerebro` (con el comentario `/** Los dominios ya intersecados con el opt-in: los que puede leer Y escribir. */`) y `dominios: permitidos,` en el objeto que devuelve `prepararCerebro`.

- [ ] **Step 3: Write `proponer.ts`**

```ts
// src/lib/centro/escritura/proponer.ts
// Del bloque `propuesta_cambio` a la tarjeta (D-203). SERVIDOR.
//
// Cada cambio válido se guarda como propuesta pendiente ANTES de enseñarse: la
// tarjeta solo lleva ids, y lo que se escribe al pulsar Guardar es lo que
// quedó aquí, no lo que diga el navegador.
import "server-only";
import type { Cerebro } from "@/lib/ai-chat/cerebro";
import type { AnySection } from "@/lib/domain/centro/runtime/types.ts";
import { validarCambio, aGuardar, type CambioGuardado } from "@/lib/domain/centro/escritura/cambio.ts";
import { seccionDeCambios, tituloDeCambio } from "@/lib/domain/centro/escritura/tarjeta.ts";
import { ESCRITURA_POR_TABLA } from "@/lib/domain/centro/escritura/registro.ts";

const VERBO = { crear: "Crear", editar: "Cambiar", borrar: "Borrar" } as const;

export async function proponerCambios(
  b: { cambios: unknown[] },
  id: string,
  cerebro: Cerebro,
  filas: ReadonlyMap<string, Record<string, unknown>>,
  cupo: { restantes: number }
): Promise<AnySection[]> {
  // Validar y reservar cupo ANTES del primer await: los bloques se resuelven
  // en paralelo y el tope de 10 por turno es de todos juntos.
  const validos: CambioGuardado[] = [];
  for (const crudo of b.cambios) {
    const r = validarCambio(crudo, { filas, autorizados: cerebro.dominios });
    if (!r.ok) {
      console.warn("[centro-agente] cambio descartado:", r.reason);
      continue;
    }
    if (r.cambio.ignorados.length) console.warn("[centro-agente] campos ignorados:", r.cambio.tabla, r.cambio.ignorados);
    if (cupo.restantes <= 0) {
      console.warn("[centro-agente] cambio descartado: más de 10 cambios en el turno.");
      continue;
    }
    cupo.restantes -= 1;
    validos.push(aGuardar(r.cambio));
  }

  const items: { propuestaId: string; cambio: CambioGuardado }[] = [];
  for (const cambio of validos) {
    const { data, error } = await cerebro.supabase
      .from("coach_proposals")
      .insert({
        user_id: cerebro.user.id,
        message_id: null,
        origen: "centro",
        tipo: "cambio",
        titulo: tituloDeCambio(cambio),
        detalle: `${VERBO[cambio.operacion]} · ${ESCRITURA_POR_TABLA[cambio.tabla].etiqueta}`,
        payload: cambio as unknown as Record<string, never>
      })
      .select("id")
      .single();
    if (data) items.push({ propuestaId: data.id, cambio });
    else console.warn("[centro-agente] no se pudo guardar el cambio propuesto:", error);
  }

  const s = seccionDeCambios(id, items, filas);
  return s ? [s] : [];
}
```

- [ ] **Step 4: Wire it into `pensar.ts`**

En `src/lib/centro/agente/pensar.ts`:
1. Imports:
```ts
import { conEscritura } from "@/lib/domain/centro/escritura/esquema.ts";
import { MAX_CAMBIOS_POR_TURNO } from "@/lib/domain/centro/agente/contrato.ts";
import { proponerCambios } from "@/lib/centro/escritura/proponer";
```
2. `CENTRO_AGENTE_BUDGET`: `maxOutputTokens: 4000` (thinkingBudget sigue 256). Debajo: `const CENTRO_RONDAS = 6;`
3. En `pensarTurno`, después de `if (!cerebro) return …`:
```ts
    const caja = cerebro.herramientas ? conEscritura(cerebro.herramientas, cerebro.dominios) : null;
    const cupo = { restantes: MAX_CAMBIOS_POR_TURNO };
```
4. En la llamada a `generateJson`: añadir `maxToolRounds: CENTRO_RONDAS,` y sustituir el spread de herramientas por:
```ts
      ...(caja ? { tools: caja.declaraciones, executeTool: caja.ejecutar } : {})
```
5. Pasar `cupo` a `resolverUno` y de ahí a `resolverSinCapacidad` (añadir el parámetro `cupo: { restantes: number }` a ambas firmas y en la llamada `resolverUno(b, \`b${i}\`, ctx, proyectos, cerebro, cupo)`).
6. En el `switch` de `resolverSinCapacidad`, antes de `default`:
```ts
    case "propuesta_cambio":
      return proponerCambios(b, id, cerebro, ctx.filas, cupo);
```

- [ ] **Step 5: Typecheck, lint, unit tests**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit`
Expected: todo verde. Cualquier test existente que construya un `Cerebro` a mano necesitará `dominios: []`; añádelo ahí, sin cambiar lo que prueba.

- [ ] **Step 6: Commit**

```bash
git add src/lib/centro/escritura/proponer.ts src/lib/ai/gemini-provider.ts src/lib/ai-chat/cerebro.ts src/lib/centro/agente/pensar.ts
git commit -m "D-203: el turno del Centro propone cambios y los guarda como pendientes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: La tarjeta `PropuestaCambio`, D-203 y prueba en navegador

**Files:**
- Create: `src/components/centro-runtime/secciones/PropuestaCambio.tsx`
- Modify: `src/components/centro-runtime/index.ts`
- Modify: `docs/DECISIONS.md`

**Interfaces:**
- Consumes: `PropsDeSeccion<"propuestaCambio">`, `registrarSeccion` (`../registro`), `confirmarCambio`, `descartarCambio` (`@/lib/centro/escritura/confirmar`), `ItemDeCambio`, `CampoDeTarjeta` (tipos de `secciones.ts`).

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmarCambio, descartarCambio } from "@/lib/centro/escritura/confirmar";
import type { CampoDeTarjeta, ItemDeCambio } from "@/lib/domain/centro/runtime/secciones.ts";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

type Estado = "pendiente" | "guardado" | "descartado";

/**
 * Cambios que el Centro propone (D-203). Nada existe hasta que la persona
 * pulsa Guardar; lo que se escribe es lo que el servidor validó al proponer,
 * más lo que la persona corrija aquí (que el servidor vuelve a validar).
 */
export default function SeccionPropuestaCambio({ data }: PropsDeSeccion<"propuestaCambio">) {
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [correcciones, setCorrecciones] = useState<Record<string, Record<string, string>>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const pendientes = data.items.filter((it) => (estados[it.propuestaId] ?? "pendiente") === "pendiente");

  async function guardarUno(it: ItemDeCambio) {
    try {
      const r = await confirmarCambio(it.propuestaId, correcciones[it.propuestaId] ?? {});
      if (r.ok || r.yaGuardado) {
        setEstados((e) => ({ ...e, [it.propuestaId]: "guardado" }));
        setErrores((e) => ({ ...e, [it.propuestaId]: "" }));
      } else setErrores((e) => ({ ...e, [it.propuestaId]: r.reason ?? "No se pudo guardar." }));
    } catch {
      setErrores((e) => ({ ...e, [it.propuestaId]: "No se pudo guardar. Inténtalo de nuevo." }));
    }
  }

  function guardar(items: ItemDeCambio[]) {
    startTransition(async () => {
      // Uno a uno: no es transaccional entre tablas, y cada tarjeta dice lo suyo.
      for (const it of items) await guardarUno(it);
      router.refresh();
    });
  }

  function descartar(it: ItemDeCambio) {
    startTransition(async () => {
      await descartarCambio(it.propuestaId).catch(() => null);
      setEstados((e) => ({ ...e, [it.propuestaId]: "descartado" }));
    });
  }

  function corregir(it: ItemDeCambio, campo: string, valor: string) {
    setCorrecciones((c) => ({ ...c, [it.propuestaId]: { ...(c[it.propuestaId] ?? {}), [campo]: valor } }));
  }

  if (!pendientes.length && data.items.every((it) => estados[it.propuestaId] === "descartado")) return null;

  return (
    <div className="ag-card">
      {data.items.map((it) => {
        const estado = estados[it.propuestaId] ?? "pendiente";
        if (estado === "descartado") return null;
        const borrar = it.operacion === "borrar";
        return (
          <div key={it.propuestaId} className="ag-cambio">
            <h3 className="ag-card-titulo">
              {borrar ? "Borrar" : it.operacion === "crear" ? "Nueva" : "Cambiar"} · {it.etiquetaTabla}: {it.titulo}
            </h3>
            <dl>
              {it.campos.map((c) => (
                <Campo
                  key={c.campo}
                  c={c}
                  borrar={borrar}
                  editable={estado === "pendiente" && c.editable}
                  valor={correcciones[it.propuestaId]?.[c.campo]}
                  onChange={(v) => corregir(it, c.campo, v)}
                />
              ))}
            </dl>
            {errores[it.propuestaId] && <p className="ag-tono-bad">{errores[it.propuestaId]}</p>}
            {estado === "guardado" ? (
              <p className="ag-acciones">
                <span className="ag-tono-ok">{borrar ? "Borrado ✓" : "Guardado ✓"}</span>
              </p>
            ) : (
              <p className="ag-acciones">
                <button type="button" className={borrar ? "ag-boton-chico ag-tono-bad" : "ag-boton-chico"} disabled={pending} onClick={() => guardar([it])}>
                  {pending ? "…" : borrar ? "Borrar" : "Guardar"}
                </button>
                <button type="button" className="ag-boton-chico" disabled={pending} onClick={() => descartar(it)}>
                  Descartar
                </button>
              </p>
            )}
          </div>
        );
      })}
      {pendientes.filter((it) => it.operacion !== "borrar").length > 1 && (
        <p className="ag-acciones">
          <button type="button" className="ag-boton-chico" disabled={pending} onClick={() => guardar(pendientes.filter((it) => it.operacion !== "borrar"))}>
            Guardar todo
          </button>
        </p>
      )}
    </div>
  );
}

function Campo(p: { c: CampoDeTarjeta; borrar: boolean; editable: boolean; valor: string | undefined; onChange: (v: string) => void }) {
  const { c } = p;
  const actual = p.valor ?? c.despues ?? "";
  return (
    <>
      <dt className="ag-muted">{c.etiqueta}</dt>
      <dd>
        {c.antes !== null && !p.borrar && <s className="ag-muted">{c.antes}</s>}
        {c.antes !== null && !p.borrar && " → "}
        {p.borrar ? (
          <span className="ag-tono-bad">{c.antes}</span>
        ) : !p.editable ? (
          <b>{c.despues ?? "—"}</b>
        ) : c.tipo === "opcion" && c.opciones ? (
          <select value={actual} onChange={(e) => p.onChange(e.target.value)}>
            {c.opciones.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : c.tipo === "texto" && actual.length > 80 ? (
          <textarea value={actual} rows={4} onChange={(e) => p.onChange(e.target.value)} />
        ) : (
          <input
            type={c.tipo === "fecha" ? "date" : c.tipo === "numero" || c.tipo === "entero" ? "number" : "text"}
            value={actual}
            onChange={(e) => p.onChange(e.target.value)}
          />
        )}
      </dd>
    </>
  );
}

registrarSeccion("propuestaCambio", SeccionPropuestaCambio);
```

**Ojo:** el `despues` de un texto largo llega recortado a 400 caracteres y neutralizado (Task 3). Si la persona NO toca ese campo, no se manda corrección y se guarda el payload original, completo. Solo lo que la persona edita viaja como corrección.

- [ ] **Step 2: Register it**

En `src/components/centro-runtime/index.ts`, después de `import "./secciones/PropuestaMovimiento";`:
```ts
import "./secciones/PropuestaCambio";
```

- [ ] **Step 3: Typecheck, lint, tests, build**

Run: `pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build`
Expected: todo verde. Si `centro-runtime-registro.test.ts` exige un componente por cada kind con esquema, pasa porque ahora existe.

- [ ] **Step 4: Browser check (Chromium local)**

Con la base local levantada y datos demo:
1. `pnpm build && pnpm start` (no `pnpm dev`: la CSP bloquea la hidratación en dev).
2. Sin `GEMINI_API_KEY` en local, el modelo no contesta. Para ver la tarjeta, crea a mano una propuesta y pinta la sección con el script de Playwright de pruebas anteriores (ver memoria «WebKit/Chromium local sin sudo»), o inserta con el SQL Editor local una fila `coach_proposals` `tipo='cambio'` y llama a `confirmarCambio` desde un botón de prueba temporal que NO se commitea.
3. Comprueba: crear una comida → Guardar → aparece en `/development/nutrition`; corregir gramos antes de Guardar → se guarda el corregido; pulsar Guardar dos veces → «Guardado ✓» una sola fila; borrar una tarea → botón rojo → desaparece de `/execution`; apagar `nutrition` en Configuración → IA con una propuesta pendiente → «Dominio no autorizado».
4. Anota en el PR qué se vio y que **el modelo real no se probó** (sin `GEMINI_API_KEY` local).

- [ ] **Step 5: D-203 in DECISIONS**

Añadir al final de `docs/DECISIONS.md`:
```markdown
- **D-203 · El Centro escribe en toda la app, siempre con Guardar.** Un
  registro puro (`domain/centro/escritura/registro.ts`) dice qué tablas,
  campos y operaciones son escribibles; es la lista blanca de escritura, como
  `TABLAS_CONSULTABLES` lo es de lectura. El modelo propone con el bloque
  «propuesta_cambio» (1–5 cambios, 10 por turno) tras pedir `esquema_de_tabla`;
  editar y borrar solo sobre filas leídas en el turno; `ai_domains` manda al
  proponer y al confirmar. Cada cambio válido se guarda en `coach_proposals`
  (`tipo = 'cambio'`, 0078) y la tarjeta solo lleva ids. `confirmarCambio`
  re-valida lo guardado, aplica las correcciones de la persona y escribe por la
  server action de la sección (adaptadores; su tipo rompe `tsc` si falta uno).
  `profiles` y el resto de TABLAS_PROHIBIDAS no entran nunca (test). Entrega 1:
  `tasks`, `notes`, `food_entries`. Desvío del spec: los cambios pendientes NO
  salen en la barra del chat (no sabe aceptarlos); quedan `pending` en la base.
  Rondas de herramientas del Centro: 6; salida: 4000 tokens.
```

- [ ] **Step 6: Commit**

```bash
git add src/components/centro-runtime/secciones/PropuestaCambio.tsx src/components/centro-runtime/index.ts docs/DECISIONS.md
git commit -m "D-203: la tarjeta de cambios propuestos y la decisión

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Después de esta entrega

- Planes siguientes (cada uno se escribe cuando esta esté fusionada): **2** resto de tablas del registro; **3** recomendaciones (lectura de `recommendations`/`coach_proposals`/`identity_briefs`/`memory_items`, bloque `acciones_recomendacion`, recomendación → cambio); **4** internet (`web:<n>` citables, bloque `fuentes`, `leer_pagina`, interruptor «Permitir internet»).
- Despliegue: la 0078 es compatible con el código viejo (solo amplía un `check`), así que puede aplicarse antes o junto al deploy.
