# Navegación premium — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir la capa del arranque guiado en el sistema de navegación premium: un centro editorial que abre las pantallas de siempre, omitible hacia la navegación habitual y reactivable desde Home.

**Architecture:** El modo (`premium` | `habitual`) vive en `ritual_prefs.nav_mode` y viaja en la RPC barata `ritual_gate`. `RitualHost` orquesta ritual → centro → botón. El contenido del centro se pide solo al abrirlo con `GET /api/centro`. La lógica de decisión vive en `src/lib/domain/centro/**`, pura y probada.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase (RLS, pgTAP), `node --test` con `--experimental-strip-types`, jsdom, Playwright-core 1.49 fuera del repo.

**Spec:** `docs/superpowers/specs/2026-09-19-navegacion-premium-design.md`

## Global Constraints

- Ninguna ruta cambia y ningún módulo se rediseña; la barra lateral y el Topbar quedan idénticos.
- Siempre omitible: Escape y «Ahora no» cierran el centro; «Navegación habitual» persiste `nav_mode = 'habitual'`.
- Sin fila en `ritual_prefs` → `premium`.
- El centro se abre solo si: modo `premium` ∧ inicio de visita (`sessionStorage`) ∧ ruta `/home` o `/`.
- NO-MOCK: cada bloque existe solo si tiene datos.
- Una sola lista de destinos: `NAV_ITEMS`.
- El contenido del centro se pide por `fetch` (Route Handler), nunca como Server Action.
- «Hoy» con `todayForUser()`; hora con `hourInTimeZone`/`timeInTimeZone` del perfil.
- Todo el texto de interfaz en español; contrato `ActionResult` en las acciones.
- Migración `0069`, pgTAP `0042`, decisión **D-166**. La watchlist pasa a D-167/0070.

---

### Task 1: Migración 0069 — `nav_mode` y `ritual_gate` que lo devuelve

**Files:**
- Create: `supabase/migrations/0069_navegacion_premium.sql`
- Create: `supabase/tests/0042_navegacion_premium.sql`
- Modify: `src/types/database.types.ts` (regenerado)

**Interfaces:**
- Produces: columna `ritual_prefs.nav_mode text not null default 'premium'`; `ritual_gate(p_date)` con una columna más, `pref_nav_mode text` (`coalesce(f.nav_mode, 'premium')`).

- [ ] **Step 1: Escribir el pgTAP (falla: la columna no existe)**

```sql
begin;
select plan(6);
insert into auth.users (id, instance_id, aud, role, email) values
  ('d1111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nav-a@test.local'),
  ('d2222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','nav-b@test.local')
on conflict (id) do nothing;
select has_column('public','ritual_prefs','nav_mode','ritual_prefs.nav_mode existe (0069)');
select set_config('request.jwt.claims', json_build_object('sub','d1111111-1111-4111-8111-111111111111','role','authenticated')::text, true);
set local role authenticated;
select is((select pref_nav_mode from public.ritual_gate('2026-09-19')), 'premium', 'Sin fila, el modo es premium');
insert into public.ritual_prefs (user_id, nav_mode) values ('d1111111-1111-4111-8111-111111111111','habitual');
select is((select pref_nav_mode from public.ritual_gate('2026-09-19')), 'habitual', 'ritual_gate devuelve el modo guardado');
select throws_ok($$ update public.ritual_prefs set nav_mode = 'otro' $$, '23514', null, 'Un modo fuera del vocabulario se rechaza');
select set_config('request.jwt.claims', json_build_object('sub','d2222222-2222-4222-8222-222222222222','role','authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from public.ritual_prefs), 0, 'Nadie ve el modo de otra persona');
select is((select pref_nav_mode from public.ritual_gate('2026-09-19')), 'premium', 'Y el suyo sigue siendo premium por defecto');
select * from finish();
rollback;
```

- [ ] **Step 2: Correr `npx supabase test db` y verlo fallar** (esperado: `has_column` falla y `pref_nav_mode` no existe).

- [ ] **Step 3: Escribir la migración**

```sql
alter table public.ritual_prefs
  add column if not exists nav_mode text not null default 'premium'
  check (nav_mode in ('premium', 'habitual'));

-- Cambiar las columnas de salida exige DROP: `create or replace` no puede.
drop function if exists public.ritual_gate(date);
create function public.ritual_gate(p_date date)
returns table (policy_enabled boolean, steps text[], window_start smallint, window_end smallint,
  frequency text, ai_enabled boolean, blocking boolean, max_routine_steps smallint,
  pref_enabled boolean, pref_steps_off text[], pref_ai boolean, run_exists boolean, pref_nav_mode text)
language sql stable security invoker set search_path = public as $$
  select p.enabled, p.steps, p.window_start, p.window_end, p.frequency, p.ai_enabled, p.blocking,
         p.max_routine_steps, coalesce(f.enabled, true), coalesce(f.steps_off, '{}'::text[]),
         coalesce(f.ai_enabled, true),
         exists (select 1 from public.ritual_runs r where r.user_id = auth.uid() and r.local_date = p_date),
         coalesce(f.nav_mode, 'premium')
    from public.ritual_policy p
    left join public.ritual_prefs f on f.user_id = auth.uid();
$$;
grant execute on function public.ritual_gate(date) to authenticated;
```

- [ ] **Step 4: Aplicar en local, correr `npx supabase test db` (43 archivos en verde) y `pnpm gen:types:local`.**
- [ ] **Step 5: Commit** `Migración 0069: el modo de navegación de cada persona`.

### Task 2: Dominio del centro (TDD)

**Files:**
- Create: `src/lib/domain/centro/apertura.ts`, `src/lib/domain/centro/destinos.ts`, `src/lib/domain/centro/componer.ts`
- Test: `tests/domain/centro-apertura.test.ts`, `tests/domain/centro-destinos.test.ts`, `tests/domain/centro-componer.test.ts`

**Interfaces:**
- Produces:
  - `type ModoNavegacion = "premium" | "habitual"`; `esModoNavegacion(v: unknown): v is ModoNavegacion`
  - `debeAbrirseElCentro(e: { modo: ModoNavegacion; inicioDeVisita: boolean; ruta: string }): boolean`
  - `destinosDelCentro(items: { href: string; label: string; group: string; hidden?: boolean }[]): { grupo: string; destinos: { href: string; label: string }[] }[]` — excluye ocultos, `/home` y `/settings`; conserva el orden de aparición.
  - `type BloqueCentro = { kind: "ahora"; paso: Extract<PasoRitual, { kind: "routineStep" }> } | { kind: "dia"; hechos: HechoRitual[] } | { kind: "mueve"; oneThing: string }`
  - `componerCentro(e: EntradaSecuencia): BloqueCentro[]` — reutiliza `construirSecuencia` con `steps: ["routineStep","context","planToday"]` y `maxRoutineSteps: 1`, así hereda la regla de la hora de D-165.
- Consumes: `construirSecuencia`, `EntradaSecuencia` (`src/lib/domain/ritual/secuencia.ts`); `PasoRitual`, `HechoRitual` (`src/lib/domain/ritual/types.ts`).

- [ ] **Step 1: Tests de apertura**

```ts
test("Premium, principio de visita, en Home → se abre", () => {
  assert.equal(debeAbrirseElCentro({ modo: "premium", inicioDeVisita: true, ruta: "/home" }), true);
});
test("La raíz también cuenta como entrar por Home", () => {
  assert.equal(debeAbrirseElCentro({ modo: "premium", inicioDeVisita: true, ruta: "/" }), true);
});
test("Un enlace directo no se tapa", () => {
  assert.equal(debeAbrirseElCentro({ modo: "premium", inicioDeVisita: true, ruta: "/execution" }), false);
});
test("A mitad de visita no se abre solo", () => {
  assert.equal(debeAbrirseElCentro({ modo: "premium", inicioDeVisita: false, ruta: "/home" }), false);
});
test("En modo habitual nunca", () => {
  assert.equal(debeAbrirseElCentro({ modo: "habitual", inicioDeVisita: true, ruta: "/home" }), false);
});
test("esModoNavegacion rechaza lo desconocido", () => {
  assert.equal(esModoNavegacion("premium"), true);
  assert.equal(esModoNavegacion("otro"), false);
  assert.equal(esModoNavegacion(null), false);
});
```

- [ ] **Step 2: Tests de destinos**, incluido uno contra el `NAV_ITEMS` real: ningún destino oculto, ni `/home` ni `/settings`; todo destino visible del menú (salvo esos dos) aparece; los grupos salen en el orden del menú.
- [ ] **Step 3: Tests de composición:** sin rutina pendiente no hay `ahora`; solo el primer hábito de la hora; sin hechos no hay `dia`; sin Única Cosa no hay `mueve` (aunque haya tareas); una rutina de la noche no aparece a mediodía; la política de pasos del admin NO afecta al centro.
- [ ] **Step 4: Correr los tres tests y verlos fallar** (`ERR_MODULE_NOT_FOUND`).
- [ ] **Step 5: Implementar**

```ts
// apertura.ts
export type ModoNavegacion = "premium" | "habitual";
export function esModoNavegacion(v: unknown): v is ModoNavegacion { return v === "premium" || v === "habitual"; }
const ENTRADAS = new Set(["/", "/home"]);
export function debeAbrirseElCentro(e: { modo: ModoNavegacion; inicioDeVisita: boolean; ruta: string }): boolean {
  return e.modo === "premium" && e.inicioDeVisita && ENTRADAS.has(e.ruta);
}

// destinos.ts
const FUERA = new Set(["/home", "/settings"]);
export function destinosDelCentro(items: { href: string; label: string; group: string; hidden?: boolean }[]) {
  const grupos: { grupo: string; destinos: { href: string; label: string }[] }[] = [];
  for (const it of items) {
    if (it.hidden || FUERA.has(it.href)) continue;
    let g = grupos.find((x) => x.grupo === it.group);
    if (!g) { g = { grupo: it.group, destinos: [] }; grupos.push(g); }
    g.destinos.push({ href: it.href, label: it.label });
  }
  return grupos;
}

// componer.ts
export function componerCentro(e: EntradaSecuencia): BloqueCentro[] {
  const pasos = construirSecuencia({ ...e, settings: { ...e.settings, steps: ["routineStep", "context", "planToday"], maxRoutineSteps: 1 } });
  const bloques: BloqueCentro[] = [];
  for (const p of pasos) {
    if (p.kind === "routineStep") bloques.push({ kind: "ahora", paso: p });
    if (p.kind === "context") bloques.push({ kind: "dia", hechos: p.hechos });
    if (p.kind === "planToday" && p.oneThing) bloques.push({ kind: "mueve", oneThing: p.oneThing });
  }
  return bloques;
}
```

- [ ] **Step 6: Correr los tests (verdes) y `pnpm test:unit` completo.**
- [ ] **Step 7: Commit** `El dominio del centro: cuándo se abre, qué destinos y qué bloques`.

### Task 3: El modo y el contenido en el servidor

**Files:**
- Modify: `src/lib/data/ritual.ts` — `PuertaDelRitual` gana `navMode: ModoNavegacion` desde `data.pref_nav_mode`.
- Create: `src/app/api/centro/route.ts` — `GET`: `loadRitualGate()` → sin puerta 401; `loadRitualContent(puerta)` → `{ ok: true, contenido }`; `dynamic = "force-dynamic"`.
- Modify: `src/lib/ritual/actions.ts` — `setNavMode(modo: ModoNavegacion): Promise<ActionResult>`: valida con `esModoNavegacion`, `upsert` de `{ user_id, nav_mode }` en `ritual_prefs` (`onConflict: "user_id"`), `audit_log` `ritual.nav_mode`, `revalidatePath("/home")`.

- [ ] **Step 1:** Añadir `navMode` a `PuertaDelRitual` y a `loadRitualGate`: `navMode: esModoNavegacion(data.pref_nav_mode) ? data.pref_nav_mode : "premium"`.
- [ ] **Step 2:** Crear la ruta y la acción con el código de arriba.
- [ ] **Step 3:** `pnpm typecheck` y `pnpm lint` limpios.
- [ ] **Step 4: Commit** `El modo viaja en la puerta; el contenido del centro, por su propia ruta`.

### Task 4: Los componentes del centro

**Files:**
- Create: `src/components/ritual/CentroPremium.tsx` — cliente; props `{ cabecera: { saludo: string; nombre: string; dateISO: string }; hourLocal: number; currency: string; locale: string; onCerrar: () => void; onHabitual: () => void; onRepetirRitual: (() => void) | null }`. Pinta el saludo al instante; pide `/api/centro` al montar; pinta `componerCentro(contenido)` y `destinosDelCentro(NAV_ITEMS)`; cada destino es `Link` que llama `onCerrar`. Reutiliza `abrirFoco`/`atraparFoco`, `temaDelRitual`, `HabitCheckbox`, `.rit-*`. Si el contenido falla, se ven igual el saludo y los destinos: el centro sigue sirviendo para navegar. Pie: «Repetir el ritual de hoy» (solo si `onRepetirRitual`), enlace a «Configuración» (`/settings`) y «Navegación habitual».
- Create: `src/components/ritual/BotonCentro.tsx` — pastilla negra «Centro», fija abajo al centro, `z-index: var(--z-centro)`.
- Modify: `src/app/globals.css` — `--z-centro: 65` en la escala (encima de popovers, debajo del menú móvil); clases `.rit-centro-*`, `.rit-boton-centro`.

- [ ] **Step 1:** Escribir los tres cambios.
- [ ] **Step 2:** `pnpm typecheck`, `pnpm lint`.
- [ ] **Step 3: Commit** `El centro premium y su botón`.

### Task 5: La orquestación y la tarjeta de Home

**Files:**
- Modify: `src/components/ritual/RitualHost.tsx` — props `{ datos: DatosDelRitual | null; navMode: ModoNavegacion; cabecera; hourLocal; ritualPermitido: boolean; currency; locale }`. Estado `modo` (desde `navMode`) y `vista: "ritual" | "centro" | null`. Al montar marca la visita en `sessionStorage` (`lifeos_visita`) dentro de `try`. Con ritual enganchado → `"ritual"`; si no, `debeAbrirseElCentro(...)` → `"centro"`. Escucha `window` `lifeos:abrir-centro` (pone modo premium y abre el centro). Botón visible si `modo === "premium" && vista === null`. «Navegación habitual» → `setNavMode("habitual")`, cierra y quita el botón. «Repetir el ritual» → `contenidoParaRepetir()` (ya existe) y `vista = "ritual"` con ese contenido; solo si `ritualPermitido`.
- Modify: `src/components/ritual/RitualOverlay.tsx` y `RitualStep.tsx` — prop opcional `alCerrar?: () => void`, llamada tras terminar u omitir. En premium, el cierre no pinta enlaces: su flecha lleva al centro.
- Modify: `src/components/ritual/RitualGate.tsx` — siempre pinta el anfitrión con `navMode`, `cabecera` y `ritualPermitido = settings.enabled`.
- Create: `src/components/ritual/ActivarPremium.tsx` — tarjeta cliente: `setNavMode("premium")` y luego `window.dispatchEvent(new Event("lifeos:abrir-centro"))`.
- Modify: `src/app/(app)/home/page.tsx` — si `loadRitualGate()?.navMode === "habitual"`, la tarjeta va arriba del todo.

- [ ] **Step 1:** Escribir los cambios.
- [ ] **Step 2:** `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- [ ] **Step 3: Commit** `El anfitrión orquesta ritual, centro y botón; Home reactiva la navegación premium`.

### Task 6: Prueba de navegador, documentación y verificación

**Files:**
- Modify: `docs/DECISIONS.md` (D-166), `docs/CHECKS.md`, `docs/TRACEABILITY.md`, `docs/DEPLOY.md`.
- Test (fuera del repo): el guion de Playwright del job, ampliado.

- [ ] **Step 1:** Ampliar el guion: una visita nueva en `/home` abre el centro; `/execution` directo no; un destino navega y deja el botón; «Centro» reabre; «Navegación habitual» quita el botón y **sigue así tras recargar y en un contexto nuevo**; la tarjeta de Home reactiva y abre el centro; la secuencia de la mañana termina en el centro; 400 px sin desborde; cero errores de consola.
- [ ] **Step 2:** Correrlo contra `pnpm build && pnpm start`, corregir lo que encuentre y volver a correrlo hasta verlo en verde.
- [ ] **Step 3:** `pnpm verify` completo (antes, comprobar que la base local solo tiene semilla).
- [ ] **Step 4:** Documentar lo que se ejecutó de verdad y lo que no.
- [ ] **Step 5: Commit** `D-166, CHECKS y despliegue de la navegación premium`.
