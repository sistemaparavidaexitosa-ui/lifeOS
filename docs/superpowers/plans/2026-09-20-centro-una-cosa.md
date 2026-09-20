# El centro dice qué hacer — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Que el centro enseñe una cosa a la vez —qué hacer ahora, con su porqué— en vez de un menú con cifras.

**Architecture:** Una función pura ordena las tarjetas por lo que caduca antes, con lo que el centro ya lee y las propuestas ya guardadas. El componente pinta una, la resuelve y entra la siguiente. **Sin migración y sin llamadas nuevas al modelo.**

**Spec:** `docs/superpowers/specs/2026-09-20-centro-una-cosa-design.md`

## Global Constraints

- **Una tarjeta a la vez**, sin pasos numerados ni flechas. El ritual (D-165) no se toca.
- **D-153/D-151** intactos: la IA propone, aceptar llama a la acción real, una sola cola.
- **NO-MOCK:** ninguna tarjeta sin su dato. Sin nada que atender, se abre en el cierre.
- **Tope de seis** tarjetas antes del cierre.
- **La barra de captura siempre visible.**
- Se **borran** `destinos.ts`, `destacados.ts` y sus pruebas: se quedan sin consumidor.
- Decisión **D-169**; la watchlist pasa a D-170/0073.

---

### Task 1: El dominio del lienzo (TDD)

**Files:** Create `src/lib/domain/centro/lienzo.ts`, `tests/domain/centro-lienzo.test.ts`. Delete `src/lib/domain/centro/{destinos,destacados}.ts` y sus tests.

**Interfaces:** Produces `tarjetasDelCentro(e: EntradaLienzo, pospuestas: string[]): Tarjeta[]` y `MAX_TARJETAS = 6`, con

```ts
export type Tarjeta =
  | { id: "apertura"; kind: "apertura"; voz: ""; titulo: string }
  | { id: string; kind: "habito"; voz: string; titulo: string; routineId: string; habitId: string; durationMin: number }
  | { id: string; kind: "propuesta"; voz: string; titulo: string; propuestaId: string; accion: string }
  | { id: "unica"; kind: "unicaCosa"; voz: string; titulo: string }
  | { id: "dinero"; kind: "dinero"; voz: string; titulo: string; href: "/money" }
  | { id: "vencidas"; kind: "vencidas"; voz: string; titulo: string; href: "/execution" }
  | { id: "cierre"; kind: "cierre"; voz: string; titulo: string };
```

- [ ] **Step 1:** Tests: el orden completo; sin resumen no hay apertura; sin hábito pendiente no hay tarjeta de hábito; las propuestas conservan su id y su motivo como voz; la Única Cosa solo si existe; Dinero solo con quincena ≤ 3 o presupuesto en rojo; vencidas solo si > 0; tope de seis; el cierre SIEMPRE es la última; un día vacío devuelve solo el cierre; lo pospuesto sale al final y no se duplica.
- [ ] **Step 2:** Verlos fallar. **Step 3:** Implementar. **Step 4:** Verlos pasar.
- [ ] **Step 5:** Borrar `destinos.ts`, `destacados.ts` y sus tests; `pnpm test:unit` y `pnpm typecheck` verdes tras quitar sus usos.
- [ ] **Step 6: Commit.**

### Task 2: El lienzo en pantalla

**Files:** Create `src/components/ritual/Lienzo.tsx`; modify `CentroPremium.tsx`, `globals.css`.

- [ ] **Step 1:** `Lienzo.tsx`: recibe las tarjetas, pinta UNA (voz, título enorme, acción principal y «Ahora no»), y al resolver avanza. Marca hábitos con `HabitCheckbox`, acepta propuestas con `acceptProposal`, navega con `router.push` cerrando el centro. Contador «quedan N» discreto.
- [ ] **Step 2:** `CentroPremium`: queda como armazón —fecha, saludo, lienzo, barra, pie— y pierde bloques, destacados, destinos y sugerencias.
- [ ] **Step 3:** Quitar de `globals.css` lo que deja de usarse (`.rit-centro-grupo`, `.rit-centro-destinos`, `.rit-centro-destino`, `.rit-destacados`, `.rit-destacado`) y añadir lo del lienzo.
- [ ] **Step 4:** `pnpm typecheck`, `pnpm lint`, `pnpm build`. **Step 5: Commit.**

### Task 3: Navegador, docs y verificación

- [ ] **Step 1:** Guion nuevo: se ve UNA tarjeta; **no hay lista de módulos**; marcar el hábito avanza; aceptar una propuesta la crea y avanza; «Ahora no» pospone; el contador baja; el cierre aparece al final; la barra siempre visible; 400 px sin desborde.
- [ ] **Step 2:** Correrlo hasta verde y volver a correr las suites de D-166 y D-167 (la de D-167 tendrá que cambiar: las sugerencias ya no son una lista).
- [ ] **Step 3:** `pnpm verify`.
- [ ] **Step 4:** D-169, `CHECKS.md`, `TRACEABILITY.md`.
- [ ] **Step 5: Commit.**
