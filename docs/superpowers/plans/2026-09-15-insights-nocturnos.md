# F5 · Insights nocturnos de hábitos · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada noche, analizar el historial de hábitos y dejar recomendaciones con patrones reales («tu cumplimiento baja los viernes», «los días que meditas completas más el resto», «con menos de 6 h de sueño omites el ejercicio»), sin pagar llamadas repetidas.

**Architecture:** extractor puro `facts/habit-patterns.ts` (tramo de hábitos de la fase A3, con `Fact.kind` de A1) conectado en `facts-loader`; `analyze()` partido en `prepararAnalisis` + `recomendarYGuardar` para usarlo con y sin sesión; guarda por día y huella de hechos en `ai_job_runs` (0066); `despacharInsightsHabitos` en el reloj; panel de insights en Hoy.

**Tech Stack:** Supabase (pgTAP), Next.js Route Handler, Gemini por `recommend`, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-15-identidad-y-analitica-design.md` (§ Insights nocturnos) y `2026-09-13-sistema-cognitivo-design.md` (§ A1, A3).

## Global Constraints
- El modelo no calcula: todo patrón sale del extractor con umbrales fijos (6 semanas, 8 días por lado, 15 puntos).
- Correlaciones redactadas como asociación, nunca causa.
- Sin sesión: filtros explícitos por `user_id` y RPC `_de`.
- `recommendations` sigue siendo la única salida; sin tabla `ai_insights`.

## Tareas
- [x] **Task 1 · `habit-patterns.ts` (TDD, 7 pruebas):** estado por rutina, más omitido, día flojo, hábito que acompaña (top 2), sueño < 6 h y energía ≤ 2, caída de la última semana; sin historia suficiente solo estados.
- [x] **Task 2 · Carga:** `FactsOverrides.modo`; serie de 90 días por `habit_log_series[_de]` y check-ins; el coach declara `modo: "servicio"`.
- [x] **Task 3 · Núcleo del análisis:** `generar-recomendaciones.ts` (`prepararAnalisis`, `huellaDeHechos`, `recomendarYGuardar` con `origen`); `analyze()` como envoltorio que revalida también Rutinas.
- [x] **Task 4 · Migración 0066 + pgTAP 0039:** `ai_job_runs` con clave (user_id, job, local_date), solo `service_role`.
- [x] **Task 5 · Reloj:** `debeAnalizar` (prueba); `despacharInsightsHabitos` en la ventana de noche del coach, guarda antes del modelo, línea base = última noche terminada bien, lote 3, 30 s.
- [x] **Task 6 · UI y copy:** `InsightSection scope="habits"` en Hoy; el panel dice que los hábitos se analizan cada noche.
- [x] **Task 7 · Verificación, D-163 y PR:** typecheck, lint, unit, pgTAP, build; reloj con zona en ventana de noche: 1ª pasada intenta, 2ª no, huella igual tras noche fallida reintenta y tras noche buena se omite (`sin-cambios`).

## Pendiente de verificar con clave
Sin `GEMINI_API_KEY` local, `recommend` falla y la fila queda `fallido:…`. Al desplegar, revisar una noche real: `ai_job_runs.outcome = hecho:N` y recomendaciones con dominio `habits` en Hoy.
