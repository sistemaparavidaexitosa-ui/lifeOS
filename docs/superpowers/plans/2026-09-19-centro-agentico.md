# Centro agéntico — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el centro proponga —«sigue con el proyecto X», «abre Dinero», «pon esto en tu día»— a partir de la actividad real, y que la persona acepte de un toque.

**Architecture:** Un tipo de propuesta nuevo, `foco`, que no escribe nada, dentro de la cola que ya existe (`coach_proposals`). Se genera una vez por franja del día desde `GET /api/centro`, con guarda en la tabla nueva `centro_runs` y ahorro por huella de hechos. El saneado y la aceptación son los de siempre.

**Tech Stack:** Next.js 15, React 19, Supabase (RLS, pgTAP), Gemini vía `generateJson`, `node --test` con `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-09-19-centro-agentico-design.md`

## Global Constraints

- **D-153:** lo que la IA crea entra por una sola puerta (`acceptProposal`). `foco` no escribe nada.
- **D-151:** una sola cola de propuestas. No se crea otra tabla de propuestas.
- **El modelo no calcula:** las cifras salen de los hechos; lo que cite y no exista se descarta.
- **`ai_domains` es la puerta.** Con la IA apagada, el centro queda como hoy.
- **NO-MOCK:** sin actividad, sin propuestas. Ninguna es mejor que una inventada.
- **Nunca lanzar:** `generateJson` ya cumple ese contrato; la orquestación también.
- Franjas: `manana` si `h < 12`, `tarde` si `12 ≤ h < 19`, `noche` si `h ≥ 19`.
- Tope: **3 llamadas al modelo por persona y día**; cero si la huella no cambió.
- Migración `0070`, pgTAP `0043`, decisión **D-167**. La watchlist pasa a D-168/0071.
- Textos de interfaz en español; contrato `ActionResult` en las acciones.

---

### Task 1: Migración 0070 — el tipo `foco` y la guarda por franja

**Files:**
- Create: `supabase/migrations/0070_centro_agentico.sql`
- Create: `supabase/tests/0043_centro_agentico.sql`
- Modify: `src/types/database.types.ts` (regenerado)

**Interfaces:**
- Produces: `coach_proposals.tipo` admite `'foco'`; `coach_proposals.message_id` pasa a **nullable**; tabla `centro_runs (user_id, local_date, franja, facts_hash, outcome, created_at)` con PK `(user_id, local_date, franja)` y RLS de dueño.

**Por qué `message_id` nullable.** Hoy es obligatorio y apunta al turno del chat
que motivó la propuesta, con `on delete cascade` — «una propuesta sin la
observación que la motivó es un botón sin contexto» (0053). Las sugerencias del
centro no nacen de ningún turno: nacen de los hechos, y su contexto viaja en
`payload.motivo`, que se pinta debajo del título. Las alternativas eran peores:
inventar un mensaje de sistema ensucia el historial del chat de la persona, y una
segunda tabla rompe D-151. Consecuencia que hay que aceptar por escrito: borrar
el historial de chat ya no se lleva por delante las sugerencias del centro,
porque no salieron de él.

- [ ] **Step 1: Escribir el pgTAP (falla: `foco` se rechaza y la tabla no existe)**

```sql
begin;
select plan(8);
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','centro-a@test.local'),
  ('e2222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','centro-b@test.local')
on conflict (id) do nothing;
select has_table('public','centro_runs','centro_runs existe (0070)');
select set_config('request.jwt.claims', json_build_object('sub','e1111111-1111-4111-8111-111111111111','role','authenticated')::text, true);
set local role authenticated;
insert into public.ai_chat_messages (id, user_id, role, content) values
  ('e3333333-3333-4333-8333-333333333333','e1111111-1111-4111-8111-111111111111','assistant','x');
insert into public.coach_proposals (user_id, message_id, tipo, titulo, payload) values
  ('e1111111-1111-4111-8111-111111111111','e3333333-3333-4333-8333-333333333333','foco','Sigue con Rediseño','{"href":"/execution","motivo":"12 movimientos"}');
select is((select tipo from public.coach_proposals limit 1), 'foco', 'El tipo foco se admite (0070)');
insert into public.coach_proposals (user_id, message_id, tipo, titulo, payload) values
  ('e1111111-1111-4111-8111-111111111111', null, 'foco','Abre Dinero','{"href":"/money","motivo":"4 días de quincena"}');
select is((select count(*)::int from public.coach_proposals where message_id is null), 1, 'Una sugerencia del centro vive sin turno de chat');
select throws_ok($$ insert into public.coach_proposals (user_id, message_id, tipo, titulo) values ('e1111111-1111-4111-8111-111111111111','e3333333-3333-4333-8333-333333333333','inventado','x') $$, '23514', null, 'Un tipo inventado se sigue rechazando');
insert into public.centro_runs (user_id, local_date, franja, facts_hash) values ('e1111111-1111-4111-8111-111111111111','2026-09-19','tarde','abc');
select throws_ok($$ insert into public.centro_runs (user_id, local_date, franja, facts_hash) values ('e1111111-1111-4111-8111-111111111111','2026-09-19','tarde','otro') $$, '23505', null, 'Una sola generación por persona, día y franja');
select throws_ok($$ insert into public.centro_runs (user_id, local_date, franja) values ('e1111111-1111-4111-8111-111111111111','2026-09-19','madrugada') $$, '23514', null, 'Una franja inventada se rechaza');
select set_config('request.jwt.claims', json_build_object('sub','e2222222-2222-4222-8222-222222222222','role','authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.centro_runs), 0, 'Nadie ve las generaciones de otra persona');
select is((select count(*)::int from public.coach_proposals), 0, 'Ni sus propuestas');
select * from finish();
rollback;
```

- [ ] **Step 2: Correr `npx supabase test db` y verlo fallar.**
- [ ] **Step 3: Escribir la migración**

```sql
-- Las sugerencias del centro no salen de un turno del chat: su contexto es el
-- `motivo` del payload. Ver el porqué en el plan y en D-167.
alter table public.coach_proposals alter column message_id drop not null;

alter table public.coach_proposals drop constraint if exists coach_proposals_tipo_check;
alter table public.coach_proposals add constraint coach_proposals_tipo_check
  check (tipo in ('tarea', 'bloque', 'rutina', 'estructura', 'meta', 'foco'));

create table if not exists public.centro_runs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  franja     text not null check (franja in ('manana', 'tarde', 'noche')),
  facts_hash text not null default '',
  outcome    text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, local_date, franja)
);
alter table public.centro_runs enable row level security;
create policy centro_runs_own on public.centro_runs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update on public.centro_runs to authenticated;
grant all privileges on public.centro_runs to service_role;
revoke all on public.centro_runs from anon;
```

- [ ] **Step 4: Aplicar en local, `npx supabase test db` verde, `pnpm gen:types:local`.**
- [ ] **Step 5: Commit** `Migración 0070: el tipo foco y la guarda por franja`.

### Task 2: Dominio — franja, destino y saneado (TDD)

**Files:**
- Create: `src/lib/domain/centro/franja.ts`, `src/lib/domain/centro/sugerencias.ts`
- Modify: `src/lib/domain/coach/proposals.ts` (añadir `"foco"` a `TIPOS` y su `case`)
- Test: `tests/domain/centro-franja.test.ts`, `tests/domain/centro-sugerencias.test.ts`

**Interfaces:**
- Produces:
  - `type Franja = "manana" | "tarde" | "noche"`; `FRANJAS`; `franjaDeHoy(hourLocal: number): Franja`
  - `destinoValido(href: string, proyectos: { id: string }[]): boolean`
  - `sanearSugerencias(crudas: PropuestaCruda[], ctx: { proyectos: { id: string }[]; yaPropuestas: string[] }): PropuestaSaneada[]`
- Consumes: `sanearPropuesta`, `PropuestaCruda`, `PropuestaSaneada` (`src/lib/domain/coach/proposals.ts`); `NAV_ITEMS`.

- [ ] **Step 1: Tests de franja** — `franjaDeHoy(0|11) === "manana"`, `(12|18) === "tarde"`, `(19|23) === "noche"`; una hora imposible (`-1`, `99`, `NaN`) cae a `"manana"` sin lanzar.
- [ ] **Step 2: Tests de destino**

```ts
const proyectos = [{ id: "11111111-1111-4111-8111-111111111111" }];
test("Una ruta del menú vale", () => assert.equal(destinoValido("/money", proyectos), true));
test("Una ruta inventada no", () => assert.equal(destinoValido("/inventado", proyectos), false));
test("Una ruta oculta del menú tampoco", () => assert.equal(destinoValido("/activity", proyectos), false));
test("Un proyecto propio vale", () =>
  assert.equal(destinoValido(`/execution?project=${proyectos[0].id}`, proyectos), true));
test("Un proyecto ajeno no", () =>
  assert.equal(destinoValido("/execution?project=99999999-9999-4999-8999-999999999999", proyectos), false));
test("Una dirección externa nunca", () => assert.equal(destinoValido("https://evil.example", proyectos), false));
```

- [ ] **Step 3: Tests de saneado** — corta a tres; descarta un `foco` con destino inválido; descarta una cuyo título repita uno de `yaPropuestas`; conserva los tipos que ya existían; una lista vacía devuelve `[]`.
- [ ] **Step 4: Correr los dos tests y verlos fallar.**
- [ ] **Step 5: Implementar**

```ts
// franja.ts
export const FRANJAS = ["manana", "tarde", "noche"] as const;
export type Franja = (typeof FRANJAS)[number];
export function franjaDeHoy(horaLocal: number): Franja {
  if (!Number.isInteger(horaLocal) || horaLocal < 0 || horaLocal > 23) return "manana";
  if (horaLocal < 12) return "manana";
  return horaLocal < 19 ? "tarde" : "noche";
}

// sugerencias.ts
import { NAV_ITEMS } from "@/components/nav-items";
import { sanearPropuesta, type PropuestaCruda, type PropuestaSaneada } from "../coach/proposals.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_SUGERENCIAS = 3;

export function destinoValido(href: string, proyectos: { id: string }[]): boolean {
  if (!href.startsWith("/")) return false;                 // nada externo
  const [ruta, query] = href.split("?");
  const item = NAV_ITEMS.find((n) => n.href === ruta);
  if (!item || item.hidden) return false;
  if (!query) return true;
  const id = new URLSearchParams(query).get("project");
  if (!id) return false;
  return UUID.test(id) && proyectos.some((p) => p.id === id);
}

export function sanearSugerencias(
  crudas: PropuestaCruda[],
  ctx: { proyectos: { id: string }[]; yaPropuestas: string[] }
): PropuestaSaneada[] {
  const vistos = new Set(ctx.yaPropuestas.map((t) => t.toLowerCase()));
  const salida: PropuestaSaneada[] = [];
  for (const cruda of crudas) {
    if (salida.length >= MAX_SUGERENCIAS) break;
    const sana = sanearPropuesta(cruda);
    if (!sana) continue;
    if (sana.tipo === "foco" && !destinoValido(sana.payload.href ?? "", ctx.proyectos)) continue;
    const clave = sana.titulo.toLowerCase();
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push(sana);
  }
  return salida;
}
```

En `proposals.ts`: añadir `"foco"` a `TIPOS`, crear `export const TIPOS_DEL_CENTRO: readonly Tipo[] = ["foco", "tarea", "bloque"]` y añadir el `case`:

```ts
case "foco": {
  const href = texto(datos.href, 120);
  const motivo = texto(datos.motivo, MAX_DETALLE);
  // Sin destino no hay propuesta: un «foco» que no lleva a ningún sitio es un
  // botón muerto. La validación SEMÁNTICA del destino vive en el dominio del
  // centro, que sí conoce los proyectos de la persona.
  if (!href.startsWith("/")) return null;
  return { tipo, titulo, detalle, payload: { href, motivo } };
}
```

- [ ] **Step 6: Correr los tests (verdes) y `pnpm test:unit` completo.**
- [ ] **Step 7: Commit** `El dominio del centro agéntico: franja, destino y saneado`.

### Task 3: Generación y orquestación

**Files:**
- Create: `src/lib/centro/generar.ts`, `src/lib/centro/sugerencias.ts`
- Modify: `src/lib/ai/gemini-provider.ts` (`CENTRO_BUDGET`), `src/app/api/centro/route.ts`

**Interfaces:**
- Produces: `generarSugerencias({ context, franja, today, proyectos })` → `{ ok: true; crudas: PropuestaCruda[] } | { ok: false; reason: string }`; `sugerenciasDelCentro()` → `SugerenciaView[]` (`{ id, tipo, titulo, detalle, href, motivo }`).
- Consumes: `generateJson`, `buildContext`/`loadFacts` de `src/lib/insights/context.ts`, `huellaDeHechos` (`src/lib/insights/generar-recomendaciones.ts`), `debeAnalizar` (`src/lib/domain/insights/nightly.ts`), `sanearSugerencias`, `franjaDeHoy`.

- [ ] **Step 1:** `CENTRO_BUDGET: Budget = { maxOutputTokens: 1500, thinkingBudget: 512 }` — el más pequeño del repo: son tres frases.
- [ ] **Step 2:** `generar.ts` con `system` que prohíbe inventar cifras y destinos, esquema Gemini de `{ sugerencias: [{ tipo, titulo, detalle, datos }] }`, validación zod y `generateJson`. Nunca lanza.
- [ ] **Step 3:** `sugerencias.ts` orquesta, en este orden y sin lanzar nunca:
  1. sesión, `todayForUser()`, `hourInTimeZone` → `franjaDeHoy`;
  2. `select` de `centro_runs` para hoy: si ya existe la franja, **devolver lo pendiente** y salir;
  3. `buildContext` (respeta `ai_domains`); si no hay hechos, escribir `outcome = 'sin-hechos'` y salir;
  4. `huellaDeHechos` + `debeAnalizar` contra la huella de la franja anterior de hoy: `sin-cambios` → devolver lo pendiente;
  5. `insert` en `centro_runs` **antes** de llamar al modelo (la PK es la guarda);
  6. `generarSugerencias` → `sanearSugerencias` con los proyectos reales y los títulos ya propuestos hoy;
  7. `insert` en `coach_proposals` con `message_id: null`, `audit_log` con `ai.centro_sugerencias`, `outcome = 'hecho'`.
- [ ] **Step 4:** `/api/centro` devuelve `{ contenido, sugerencias }`. **Las sugerencias no bloquean**: si su promesa falla, se devuelve `sugerencias: []`.
- [ ] **Step 5:** `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 6: Commit** `El centro piensa una vez por franja, y solo si algo cambió`.

### Task 4: El bloque «Lo siguiente»

**Files:**
- Create: `src/components/ritual/Sugerencias.tsx`
- Modify: `src/components/ritual/CentroPremium.tsx`, `src/app/globals.css`

- [ ] **Step 1:** `Sugerencias.tsx`: lista de hasta tres; cada una con título, motivo en gris y dos botones — «Ir» o «Añadir» según el tipo, y «No». `foco` → `router.push(href)` y `acceptProposal`; los demás → `acceptProposal`; «No» → `dismissProposal` y desaparece de la lista.
- [ ] **Step 2:** En `CentroPremium`, el bloque va **encima de «A dónde vas»** y solo si hay alguna.
- [ ] **Step 3:** Estilos `.rit-sug-*` reutilizando los tokens `.rit-*`.
- [ ] **Step 4:** `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- [ ] **Step 5: Commit** `El bloque «Lo siguiente» en el centro`.

### Task 5: Navegador, documentación y verificación

- [ ] **Step 1:** Ampliar el guion de Playwright: con propuestas sembradas por SQL (una `foco` y una `tarea`), el bloque aparece con las dos; «Ir» navega y deja la propuesta `accepted`; «No» la quita y **no vuelve al recargar**; con `ai_domains` sin `execution` el centro no muestra bloque.
- [ ] **Step 2:** Correrlo contra `pnpm build && pnpm start` hasta verlo en verde.
- [ ] **Step 3:** `pnpm verify` completo.
- [ ] **Step 4:** D-167 en `docs/DECISIONS.md`; `CHECKS.md` con lo que se ejecutó de verdad —incluido si se llamó o no al modelo real—; `TRACEABILITY.md`; `DEPLOY.md` (sin variables nuevas; la 0070 es aditiva y no cambia nada visible hasta que haya propuestas).
- [ ] **Step 5: Commit** `D-167, CHECKS y trazabilidad del centro agéntico`.
