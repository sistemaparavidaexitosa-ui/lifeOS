# F4 · Coach de identidad: el brief del día · Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** cada día, un brief de identidad escrito para la persona —cinco afirmaciones, visualización guiada, recordatorio, pregunta y cita original— que no se repite y evoluciona con sus reacciones.

**Architecture:** migración `0065` (`identity_briefs`, con `reactions` como única columna escribible por la persona); saneado puro (`brief.ts`) y hechos de identidad (`facts/identity.ts`); `generar.ts` arma el contexto con `loadScoreContext`, `loadFacts` y `buildContext` y llama a `generateJson` con `BRIEF_BUDGET`; acciones que devuelven el brief; UI en Hoy.

**Tech Stack:** Supabase (RLS, GRANT por columna, pgTAP), Gemini por `fetch` (`src/lib/ai/gemini-provider.ts`), zod, Next.js Server Actions, `node --test`.

**Spec:** `docs/superpowers/specs/2026-09-15-identidad-y-analitica-design.md` (§ Flujo de IA).

## Global Constraints
- Un solo proveedor, sin SDK ni embeddings (D-087, sistema cognitivo).
- Exige `habits` y `growth` en `ai_domains`; todo hecho pasa por `buildContext`.
- Texto de la persona entre `<<<` `>>>` y declarado no confiable.
- Nunca lanza (D-021); se audita cada intento.
- Español en UI, prompts, comentarios y commits.

## Tareas
- [x] **Task 1 · Migración 0065 + pgTAP 0038:** tabla, único por día, `generation ≤ 3`, `revoke all` + `grant update (reactions)`, RLS, aislamiento.
- [x] **Task 2 · `brief.ts` (TDD, 9 pruebas):** `tokensSignificativos`, `similitud`, `filtrarRepetidas`, `citaAtribuida`, `sanearBrief` (recortes, rasgos y hechos válidos, visualización 120–240 s, mínimo 3 afirmaciones).
- [x] **Task 3 · `facts/identity.ts` (TDD, 2 pruebas):** rachas ≥ 7 días / 3 semanas con récord, rasgos ≥ 80 % o ≤ 40 %, score ±5 en una semana, metas logradas en 14 días, días sólidos ≥ 3.
- [x] **Task 4 · `prompt.ts` y `generar.ts`:** `BriefSchema` + `BRIEF_RESPONSE_SCHEMA`, `systemDelBrief(tono, inspiraciones)`, `promptDelBrief(datos)` con correcciones; generación con un reintento y respaldo.
- [x] **Task 5 · Acciones:** `generateTodayBrief`, `regenerateTodayBrief` (tope en `audit_log`), `reactToBriefItem`; `loadTodayBrief`; `clearAiHistory` borra briefs.
- [x] **Task 6 · UI:** `BriefCard` (reacciones optimistas, «Otro», `VisualizationPlayer`, pregunta, cita), `BriefGenerator` (esqueleto, error con enlace a Configuración); la pregunta llega al check-in.
- [x] **Task 7 · Verificación y PR:** typecheck, lint, unit, pgTAP, build; navegador sin `GEMINI_API_KEY` (error legible y auditado) y con un brief sembrado (reacción persistida, temporizador, pregunta en el check-in, claro y oscuro a 400 px); D-161; PR con base `feat/identidad`.

## Pendiente de verificar con clave
La llamada real al modelo no se pudo ejercitar en local (sin `GEMINI_API_KEY`). Al desplegar: generar un brief, regenerarlo dos veces, comprobar el tercer tope, y revisar en `audit_log` `ai.identity_brief` con `model` e `intentos`.
