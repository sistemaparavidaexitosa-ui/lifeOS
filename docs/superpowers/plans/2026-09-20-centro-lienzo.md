# Centro lienzo — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Quitar el parpadeo del centro, darle una narrativa de «cómo voy», una fila de destinos por contexto y una barra donde escribir una idea y que la IA proponga dónde va.

**Architecture:** La señal de «visita nueva» pasa del `sessionStorage` a una cookie de sesión puesta en el middleware, para que el servidor decida antes de pintar. La narrativa viaja como un campo más en la llamada por franja que ya existe. Los destacados son puros y deterministas. La barra llama al modelo solo cuando la persona escribe y produce una propuesta, que se acepta de un toque.

**Tech Stack:** Next.js 15 (middleware, Route Handlers), React 19, Supabase (RLS, pgTAP), Gemini vía `generateJson`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-20-centro-lienzo-design.md`

## Global Constraints

- **D-153:** la IA propone; aceptar de un toque es lo que crea. También en la barra.
- **D-151:** una sola cola (`coach_proposals`, `origen = 'centro'`).
- **NO-MOCK:** sin señales no hay destacados; sin resumen no hay bloque.
- **Coste:** cero llamadas nuevas por carga de página. La narrativa va en la llamada por franja; los destacados no llaman; la barra solo al escribir.
- **Nunca lanzar** en la orquestación ni en las rutas.
- Migración `0071`, pgTAP `0044`, decisión **D-168**. La watchlist pasa a D-169/0072.
- Textos en español; contrato `ActionResult`.

---

### Task 1: Migración 0071 — tipo `nota` y `centro_runs.resumen`

**Files:** Create `supabase/migrations/0071_centro_lienzo.sql`, `supabase/tests/0044_centro_lienzo.sql`; regenerar tipos.

**Interfaces:** Produces: `coach_proposals.tipo` admite `'nota'`; `centro_runs.resumen text not null default ''`.

- [ ] **Step 1: pgTAP** que falla: inserta una propuesta `nota` con `origen='centro'` y `payload {"notebookId":"<uuid>","cuerpo":"x"}`, comprueba `has_column('public','centro_runs','resumen')`, y que un tipo inventado siga fallando con `23514`.
- [ ] **Step 2:** Correr `npx supabase test db` y verlo fallar.
- [ ] **Step 3: La migración.** OJO: la lista de tipos es acumulativa; copiarla de una migración vieja borra tipos. La lista completa hoy es `tarea, bloque, rutina, estructura, meta, arista, foco` y se le añade `nota`.
- [ ] **Step 4:** Aplicar, pgTAP verde, `pnpm gen:types:local`.
- [ ] **Step 5: Commit.**

### Task 2: El parpadeo — cookie de visita en el middleware

**Files:** Modify `src/middleware.ts`, `src/components/ritual/RitualGate.tsx`, `src/components/ritual/RitualHost.tsx`.

- [ ] **Step 1:** En el middleware, tras resolver la sesión: si no existe la cookie `lifeos_visita`, ponerla (sin `Max-Age`, `sameSite: lax`, `path: /`) y añadir `requestHeaders.set("x-visita-nueva", "1")`.
- [ ] **Step 2:** `RitualGate` lee `headers()` y pasa `inicioDeVisita` a `RitualHost`; llama a `debeAbrirseElCentro` **en el servidor** y pasa `abrirCentro: boolean`.
- [ ] **Step 3:** `RitualHost` deja de usar `sessionStorage` y arranca con `vista` ya decidida (`useState(abrirCentro ? "centro" : null)`), sin efecto que lo abra.
- [ ] **Step 4:** `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- [ ] **Step 5: Commit.**

### Task 3: Narrativa y destacados

**Files:** Create `src/lib/domain/centro/destacados.ts` y su test; modify `src/lib/centro/generar.ts`, `src/lib/centro/sugerencias.ts`, `src/lib/data/ritual.ts`, `CentroPremium.tsx`.

**Interfaces:** Produces `destacadosDelCentro(señales: SenalesDelDia, yaEnSugerencias: string[]): Destacado[]` con `Destacado = { href: string; label: string; motivo: string }` y `SenalesDelDia = { proyectoActivo: { id: string; title: string; movimientos: number } | null; vencidas: number; habitosPendientes: number; diasParaFinDeQuincena: number; presupuestoEnRojo: boolean }`. Tope 5.

- [ ] **Step 1: Tests de destacados** (TDD): sin señales → `[]`; el proyecto activo sale primero con su motivo; las vencidas aparecen si hay; Dinero aparece con ≤ 3 días de quincena o presupuesto en rojo; no repite un `href` que ya esté en «Lo siguiente»; nunca más de cinco.
- [ ] **Step 2:** Verlos fallar. **Step 3:** Implementar. **Step 4:** Verlos pasar.
- [ ] **Step 5:** `generar.ts`: campo `resumen` en el esquema, en la validación zod y en el prompt, con el límite de 280 y la regla de no inventar cifras.
- [ ] **Step 6:** `sugerencias.ts`: guardar el resumen en `centro_runs.resumen` y devolverlo; `sugerenciasDelCentro()` pasa a devolver `{ sugerencias, resumen }`.
- [ ] **Step 7:** `data/ritual.ts` calcula `SenalesDelDia` con lo que ya lee (`getHomeData`, rutinas, quincena) más una consulta de actividad reciente por proyecto.
- [ ] **Step 8:** `CentroPremium` pinta narrativa (si hay) y destacados (si hay) por encima de «A dónde vas».
- [ ] **Step 9:** `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`. **Step 10: Commit.**

### Task 4: La barra de captura

**Files:** Create `src/lib/domain/centro/captura.ts` y su test, `src/lib/centro/capturar.ts`, `src/app/api/centro/capturar/route.ts`, `src/components/ritual/BarraCaptura.tsx`; modify `src/lib/coach/actions.ts`, `CentroPremium.tsx`.

**Interfaces:** Produces `sanearCaptura(cruda, ctx): CapturaSaneada` con
`CapturaSaneada = { clase: "nota"; notebookId: string; titulo: string; cuerpo: string } | { clase: "tarea"; projectId: string | null; titulo: string } | { clase: "pregunta"; pregunta: string; opciones: { etiqueta: string; clase: "nota" | "tarea"; id: string }[] }`
y `ctx = { notebooks: { id: string; title: string }[]; proyectos: { id: string; title: string }[] }`.

- [ ] **Step 1: Tests de `sanearCaptura`** (TDD): un cuaderno que no existe degrada a `pregunta`; un proyecto ajeno degrada a `pregunta`; sin título degrada a `pregunta`; una `pregunta` con más de tres opciones se recorta; una nota válida conserva cuerpo y título; una clase inventada degrada a `pregunta`.
- [ ] **Step 2:** Verlos fallar. **Step 3:** Implementar. **Step 4:** Verlos pasar.
- [ ] **Step 5:** `capturar.ts`: un `generateJson` con `CENTRO_BUDGET`, esquema de las tres salidas, y el contexto de cuadernos y proyectos. Nunca lanza. Sin llave → `{ ok: false, reason }`.
- [ ] **Step 6:** La ruta `POST /api/centro/capturar`: valida `{ texto: string }` con zod (máx. 2000), llama, sanea, y si la salida es `nota` o `tarea` inserta la propuesta con `origen='centro'` y devuelve su id. `maxDuration = 60`.
- [ ] **Step 7:** `ejecutar()` en `coach/actions.ts` gana `case "nota"`: `createNote(payload.notebookId)` y luego `saveNote(id, p.titulo, payload.cuerpo, 0)`; devuelve `href` al cuaderno.
- [ ] **Step 8:** `BarraCaptura.tsx`: campo, estado de envío, y tres respuestas posibles —propuesta con botones, pregunta con opciones, o el aviso de que la IA no está configurada con la salida «guardar tal cual».
- [ ] **Step 9:** `pnpm typecheck`, `pnpm lint`, `pnpm build`. **Step 10: Commit.**

### Task 5: Navegador, documentación y verificación

- [ ] **Step 1:** Ampliar el guion: el diálogo del centro **está en el HTML inicial** (comprobar con `page.route` o midiendo que existe antes de `networkidle`); narrativa y destacados se pintan cuando hay datos sembrados; escribir en la barra produce una propuesta y aceptarla **crea la nota de verdad**; una entrada ambigua devuelve pregunta.
- [ ] **Step 2:** Correrlo hasta verde, y volver a correr las suites de D-166 y D-167.
- [ ] **Step 3:** `pnpm verify`.
- [ ] **Step 4:** D-168 en `DECISIONS.md`; `CHECKS.md` con lo que se ejecutó de verdad; `TRACEABILITY.md`; `DEPLOY.md`.
- [ ] **Step 5: Commit.**
