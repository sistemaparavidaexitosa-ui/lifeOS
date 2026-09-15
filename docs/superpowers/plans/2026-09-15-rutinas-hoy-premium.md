# F6 · Hoy: composición final · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que Hoy se lea de arriba abajo como un día —quién eres, tu brief, tus cifras, tus rutinas, tu check-in, lo que la IA vio— y que funcione igual de bien vacío, en móvil y en oscuro.

**Architecture:** solo composición y pulido sobre F1–F5; sin migraciones ni dependencias.

**Spec:** `docs/superpowers/specs/2026-09-15-identidad-y-analitica-design.md` (§ Árbol de componentes, F6).

## Tareas
- [x] Orden: identidad + Identity Score → brief → cifras del día (Hoy, Días sólidos, Esta semana; mismas funciones que Analítica) → Rutinas de hoy → check-in → recomendaciones → «Tus rutinas» (crear, plantillas, nota del módulo, las que hoy no tocan).
- [x] Móvil: el título ya no se parte por los botones; «…» y «Editar» apilados; panel de recomendaciones con botones debajo; sin desbordamiento horizontal a 400 px.
- [x] Casilla instantánea: `toggleHabitToday` devuelve el registro resultante y `HabitRow` lo pinta sin esperar a la revalidación (verificado 3/3).
- [x] Estados vacíos: sin desglose del score sin datos; la tarjeta de primera rutina lleva sus botones; «Tus rutinas» se oculta sin rutinas; Analítica vacía con enlace a Hoy.
- [x] `loading.tsx` de Hoy y Analítica.
- [x] `docs/UX_MAP.md` y `docs/TRACEABILITY.md` al día.
- [x] Verificación: typecheck, lint, unit (1026), pgTAP (40 archivos), build; Playwright en oscuro 400 px y claro 1280 px con datos y con usuario vacío.
