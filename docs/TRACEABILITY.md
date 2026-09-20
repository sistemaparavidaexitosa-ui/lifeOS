# TRACEABILITY — Requisito → Tabla → Política RLS → API/Action → Componente → Test

Fuente de requisitos: `MASTER_PRODUCT_SOFTWARE_ARCHITECTURE_SPECIFICATION_v0.4.md`.
Ningún ID de requisito fue renumerado.

| Requisito | Tabla(s) | Política RLS | Server Action / Route | Componente | Test |
|---|---|---|---|---|---|
| FR-IAM-001/002 | `auth.users` (Supabase Auth) | RLS por `auth.uid()` en todas las tablas | `signIn`/`signUp` | `login-form.tsx` | Manual (sin CLI Supabase en este entorno) |
| FR-USR-001 | `profiles` | `profiles_select_own`/`update_own` | `completeOnboarding`,`updateProfile` | `onboarding-form.tsx`,`settings/page.tsx` | Manual |
| BR-012/019/027 (privacidad Money OS/Time/Habits) | `accounts`,`journal_entries`,`occupations`,`habits`,`books`,`family_members` | Todas `for all using (user_id = auth.uid())`, **sin** `workspace_id` | — | — | `supabase/tests/0001_rls_money.sql`, `0003_rls_habits_household_budget.sql` (⚠️ NO EJECUTADO) |
| FR-EXE-001…005 | `projects` (`workspace_id` NOT NULL desde 0030),`tasks`,`task_history` | `projects_select_access`,`tasks_select`/`tasks_write` (vía `has_project_access`/`can_edit_project`) | `createProject` (exige espacio),`createTask`,`setTaskStatus` | `execution/page.tsx`,`NewProjectForm.tsx`,`TaskStatusButtons.tsx` | `tests/domain/task-state.test.ts` (8 casos, ✅) · `supabase/tests/0011_workspace_obligatorio.sql` (7 casos, ✅) |
| FR-EXE-013 (maestro-detalle) | `projects`,`tasks` | igual que arriba | consulta filtrada por `?project=` en la página | `execution/page.tsx` | Manual |
| FR-EXE-014, FR-VIEW-007/008, BR-023 (Eisenhower) | `tasks.urgent` | `tasks_write` (misma política, `urgent` es una columna más) | `changeTaskQuadrant` | `eisenhower/Board.tsx` | `tests/domain/eisenhower.test.ts` (8 casos, ✅ ejecutado) |
| FR-INT-011, BR-022 (secuenciación IA) | `tasks` (lectura) | `tasks_select` | `requestProjectSequence`,`applyProjectSequence` (solo audita, no reordena) | `SequenceButton.tsx` | `tests/domain/project-sequence.test.ts` (6 casos, ✅ ejecutado) |
| Execution Graph · modelo, privacidad y recorrido (0054, D-117/D-118) | `graph_nodes`,`graph_edges`,`graph_layouts`,`graph_node_types`,`graph_rel_types`; proyectadas por trigger desde `workspaces`,`projects`,`tasks`,`notes`,`task_files`,`logbook`,`memberships`,`personal_goals`,`habits`,`routines`,`books`,`investments`,`budgets`,`assets` | `graph_nodes_select_privado` + `graph_nodes_select_espacio` (**dos** políticas, no un `or`), CHECK `graph_nodes_tenant_shape`, trigger `graph_edge_tenant` (BR-012 en la base), `graph_layouts_own`. RPC `graph_impact`/`graph_subgraph` son `security definer` con `row_security=off` y `revoke execute … from anon` | `createGraphEdge`,`deleteGraphEdge`,`createCustomNode`,`deleteCustomNode`,`saveLayout`,`fetchImpact`,`searchGraph`; `GET /api/graph/subgraph` | `graph/page.tsx`,`GraphWorkspace.tsx`,`GraphCanvas.tsx`,`NodeInspector.tsx`,`Minimap.tsx`,`GraphToolbar.tsx`,`GraphSearch.tsx` | `supabase/tests/0025_rls_grafo.sql` (14 aserciones: Guest, BR-012, `proconfig`/`provolatile`, `anon`, mudanza de proyecto — ✅) · `tests/domain/graph-{viewport,quadtree,layout,lod,views,selection,impact,cluster}.test.ts` (66 casos, ✅) |
| FR-PLN-002/004/005/008 | `daily_plans`,`weekly_reviews`,`logbook` | `daily_plans_own`,`weekly_reviews_own` | `approveDailyPlan`,`closeoutTask`,`saveDailyLearning`,`approveWeeklyReview` | `DailyPlanForm.tsx`,`CloseoutPanel.tsx`,`WeeklyReviewPanel.tsx` | Manual |
| FR-TIM-001…008 | `occupations`,`profiles` (ventana) | `occupations_own` | `updateActivityWindow`,`upsertOccupation`,`deleteOccupation`,`assignTaskToSlot` | `time/page.tsx`,`Timeline.tsx`,`WeekView.tsx` | `tests/domain/time.test.ts` (7 casos, ✅ ejecutado) |
| FR-HAB-001…006, BR-026, FR-HOM-007 | `habits`,`habit_logs`,`books`,`book_notes` | `habits_own`,`habit_logs_own`,`books_own`,`book_notes_own` | `upsertHabit`,`toggleHabitToday`,`upsertBook`,`addBookNote` | `routines/page.tsx`,`routines/HabitForm.tsx`,`HabitRow.tsx`,`BookForm.tsx` | `tests/domain/habits.test.ts` (5 casos, ✅ ejecutado); `supabase/tests/0021_habitos_en_rutinas.sql` (pgTAP: la invariante de 0046 —todo hábito dentro de una rutina, y de una rutina TUYA— más el cascade que se lleva hábitos y logs al borrarla); FK `ON DELETE SET NULL` en `0004_planning_time_habits.sql` (⚠️ NO EJECUTADO contra Postgres real). Desde 0046 el bloque lo ancla la rutina, no el hábito: borrar la ocupación deja `routines.occupation_id` en null y la rutina —con sus hábitos— sobrevive. |
| Rutinas como sistema de identidad (F1–F5, D-158…D-163) | `habit_logs` (+estado, 0063), `daily_reflections` (0063), `identity_profiles`, `identity_revisions`, `identity_traits`, `habit_identity_traits`, `identity_scores` (0064), `identity_briefs` (0065), `ai_job_runs` (0066); RPC `habit_log_series[_de]` | RLS `user_id = auth.uid()`; votos vía hábito con guard de mismo dueño; `identity_scores` y `identity_revisions` sin escritura de `authenticated`; `identity_briefs` con `grant update (reactions)` tras `revoke all`; `ai_job_runs` y las `_de` solo `service_role` | `logHabit`,`toggleHabitToday`,`saveDailyReflection`,`upsertIdentityProfile`,`upsertTrait`,`deleteTrait`,`generateTodayBrief`,`regenerateTodayBrief`,`reactToBriefItem`,`analyze`; reloj: `despacharIdentidad`, `despacharInsightsHabitos` | `routines/{page,layout}.tsx`, `routines/analytics/page.tsx`, `routines/identity/*`, `routines/brief/*`, `components/charts/*` | `supabase/tests/0036…0039` (pgTAP, ✅) · `tests/domain/{habit-analytics,habit-dashboard,identity-score,identity-schedule,identity-brief,insights-identity,insights-habit-patterns,insights-nightly}.test.ts` (✅) · Playwright manual contra `pnpm start` (claro/oscuro, 400 px) · ⚠️ llamadas reales a Gemini sin verificar en local |
| FR-NUT-001…006 (0047), BR-027 | `nutrition_profiles`,`body_measurements`,`foods`,`food_entries` | `nutrition_profiles_own`,`body_measurements_own`,`food_entries_own`,`foods_lectura` (+GRANT sin insert) | `upsertBodyProfile`,`upsertWeight`,`logFoodEntry`,`updateFoodEntry`,`deleteFoodEntry`,`searchFoods` | `development/nutrition/page.tsx`,`FoodSearchForm.tsx`,`BodyProfileForm.tsx`,`WeightForm.tsx` | `tests/domain/development-nutrition.test.ts` (27 casos, ✅ ejecutado); `tests/domain/development-nutrition-lookup.test.ts` (16 casos, ✅); `tests/domain/insights-nutrition.test.ts` (7 casos, ✅); `supabase/tests/0022_rls_nutricion.sql` (pgTAP, 17 aserciones, ✅) |
| FR-WSP-001…007, FR-COL-001…009 | `workspaces` (+`is_personal`),`memberships`,`invitations`,`project_shares` (llave del rol Guest desde 0031),`comments`,`workspace_activity` | `is_workspace_member`,`workspace_role`,`has_project_access`,`can_edit_project` — **membresía = acceso** (0031) | `createWorkspace`,`inviteMember`,`removeMember`,`moveProject`,`shareProjectWithGuest`,`deleteWorkspace` | `execution/WorkspaceSwitcher.tsx`,`execution/TeamPanel.tsx` | `supabase/tests/0002_rls_execution_collaboration.sql` (12 casos, ✅ ejecutado) |
| Notebooks del espacio (colaboración escrita) | `notebooks`,`notes` | `notebooks_select`/`_insert`/`_update`/`_delete`, `notes_*` vía `has_notebook_access`/`can_edit_notebook` | `createNotebook`,`createNote`,`saveNote`,`searchNotes` | `notebooks/page.tsx`,`NoteEditor.tsx` | `supabase/tests/0012_rls_notebooks.sql` (9 casos, ✅) · `tests/domain/notes-markup.test.ts` (20 casos, ✅) |
| Plantillas de rutinas y hábitos · lectura medida | `routines` (+`identity`, 0046),`habits` (+3 columnas, 0033),`books` (+`category`),`book_progress` (0034) | `routines_own`,`habits` por `user_id`, `book_progress_own` vía libro padre | `createRoutineFromTemplate`,`upsertHabit`,`upsertBook` | `RoutineTemplates.tsx`,`HabitTemplates.tsx`,`LibraryViews.tsx` | `tests/domain/development-templates.test.ts` (13) · `development-reading.test.ts` (16) · `supabase/tests/0013_rls_desarrollo_personal.sql` (7) — ✅ |
| Plan de lectura programable (cola semanal) · «el libro de esta semana» | `reading_plan_weeks` (0043, una fila por libro y semana, `week_start` siempre lunes por check) | `reading_plan_weeks_own` vía libro padre, mismo patrón que `book_progress_own` | `scheduleBook`,`unscheduleBook`,`updateBookPage` (avance rápido) | `library/PlanForm.tsx`,`library/QuickProgress.tsx`,`library/page.tsx` (vista `?por=plan`),`development/page.tsx` («Leyendo ahora»),`home/page.tsx` | `tests/domain/development-reading-plan.test.ts` (22) · `format.test.ts` (3) · `supabase/tests/0019_rls_plan_lectura.sql` (7) — ✅ |
| FR-COL-004/005 (hilo del PROYECTO: solo conversación, D-086) | `comments` (`subject_type='project'`, ya previsto en 0003),`comment_reactions`,`comment_reads`. El hilo **ya no lee `workspace_activity`**; `/activity` sigue haciéndolo | `comments_select/insert/delete`; `comment_reactions_select/insert` reescritas sobre `can_view_comment_subject` (0041) | `getProjectThread`,`addProjectComment`,`toggleReaction`,`pinCommentToLogbook` | `execution/ProjectThreadPanel.tsx`,`execution/mention-ui.tsx`,`MentionsMenu.tsx` | `supabase/tests/0018_rls_hilo_proyecto.sql` (6 casos, ✅) · `tests/domain/execution-mentions.test.ts` · `execution-reactions.test.ts` — `execution-project-thread.test.ts` se eliminó con el módulo que probaba |
| Actividad del espacio (el feed, ahora único sitio donde se leen los eventos) | `workspace_activity` (+`actor_id`, 0037) | `workspace_activity_select/insert` vía `is_workspace_member` | `recordActivity` (`lib/data/activity.ts`) | `activity/page.tsx` | `tests/domain/execution-activity.test.ts` (11, ✅) |
| Chat de IA transversal (D-088…D-092) | `ai_chat_messages` (0045); lectura del contexto sobre las tablas de los dominios que el usuario autorizó en `profiles.ai_domains` | `ai_chat_messages_select/insert/update/delete`, las cuatro sobre `user_id = auth.uid()` | `sendChatMessage`,`loadChatHistory`,`createTaskFromChat` (envuelve `quickAddTask`),`clearChat`; `clearAiHistory` la vacía también | `components/AiChatRail.tsx`,`components/AppShell.tsx`,`settings/AiSettings.tsx` | `supabase/tests/0021_rls_chat_ia.sql` (6 casos, ✅) · `tests/domain/ai-chat.test.ts` (11, ✅) |
| FR-MNY-001…012 | `accounts`,`journal_entries`,`journal_lines`,`budgets` | `accounts_own`,`journal_entries_own`,`journal_lines_own`,`budgets_own` | `createAccount`,`postTransaction`,`reconcileEntry`,`reverseEntry` | `money/page.tsx`,`NewTransactionForm.tsx` | `tests/domain/money.test.ts` (11 casos, ✅ ejecutado) |
| FR-MNY-018/019, BR-028 (Presupuesto tabular) | `budgets` (extendida) | `budgets_own` | `upsertBudgetLine`,`deleteBudgetLine` | `budget/page.tsx`,`BudgetLineForm.tsx` | `tests/domain/budget.test.ts` (5 casos, ✅ ejecutado) |
| FR-MNY-018/019 (extensión: ingreso quincenal + conciliación con cuentas, D-009/D-010/D-011) | `profiles.quincenal_income`; lectura de `accounts`/`journal_entries` (reutilizada, sin tabla nueva) | `profiles_select_own/update_own`; `accounts_own`,`journal_entries_own` | `updateQuincenalIncome` | `budget/page.tsx`,`QuincenalIncomeForm.tsx`,`CreateBudgetButton.tsx` | ⚠️ NO EJECUTADO (sin Supabase CLI/Docker en este entorno); sintaxis TS/SQL validada por inspección — ver `/docs/CHECKS.md` |
| FR-DEB-001…005 | `debts` | `debts_own` | `upsertDebt`,`deleteDebt` | `debt/page.tsx`,`DebtForm.tsx`,`DebtSimulator.tsx` | `tests/domain/debt.test.ts` (6 casos, ✅ ejecutado) |
| FR-DEB-006, BR-024 (pago vinculado) | `journal_entries.debt_id` | `journal_entries_own` (misma tabla) | `postTransaction` (con `debtId`),`reverseEntry` | `NewTransactionForm.tsx` | `tests/domain/money.test.ts::applyDebtPayment` (✅ ejecutado) |
| FR-DEB-007, BR-025 (Cashback) | `cashback_cards`,`cashback_redemptions` | `cashback_cards_own`,`cashback_redemptions_own` | `upsertCashbackCard`,`redeemCashback` | `cashback/page.tsx` | `tests/domain/money.test.ts::cashbackAccrued` (✅ ejecutado) |
| FR-DEB-008 (simulador editable) | `debts` (lectura) | `debts_own` | `saveDebtScenario` (solo audita) | `DebtSimulator.tsx` (modo "single") | `tests/domain/debt.test.ts::simulateSingleDebt` (✅ ejecutado) |
| FR-SAV-001…003 | `savings_goals` | `savings_goals_own` | `upsertSavingsGoal`,`contributeToSaving` | `savings/page.tsx` | `tests/domain/money.test.ts::savingsProjection` (✅ ejecutado) |
| FR-INV-001…007 | `investments` | `investments_own` | `upsertInvestment`,`deleteInvestment` | `investments/page.tsx` | `tests/domain/money.test.ts::investmentReturnPct` (✅ ejecutado) |
| FR-WLT-001…004, BR-004 | `assets`,`liabilities`,`net_worth_snapshots` | `assets_own`,`liabilities_own`,`net_worth_snapshots_own` | `upsertAsset`,`createNetWorthSnapshot` | `wealth/page.tsx` | `tests/domain/money.test.ts::netWorth` (✅ ejecutado) |
| FR-GOL-001…004 | `financial_goals` | `financial_goals_own` | `upsertFinancialGoal`,`deleteFinancialGoal` | `goals/page.tsx` | Manual |
| FR-MNY-013…017, BR-020/021 (Hogar) | `family_members` | `family_members_own` | `upsertFamilyMember`,`deleteFamilyMember` | `household/page.tsx` | `supabase/tests/0003_rls_habits_household_budget.sql` (⚠️ NO EJECUTADO) |
| FR-RPT-001/002 | (agregación de múltiples tablas) | heredadas de cada tabla | — (solo lectura) | `reports/page.tsx` | Manual |
| NFR-SEC-001/002/003 | todas | RLS + `server-only` en `admin.ts` | `middleware.ts` (CSP + refresh de sesión) | — | ⚠️ NO EJECUTADO (pentest fuera de alcance de este entorno) |

## Cobertura de pruebas ejecutadas (evidencia real)

| Catálogo de plantillas administrable (D-080/082, migración 0044) | `template_catalog`, `profiles.is_admin`, `audit_log` | `template_catalog_select` (`status = 'published' or is_admin()`), `_insert`/`_update`/`_delete` (`is_admin()`); `anon` revocado | `saveTemplate`,`setTemplateStatus`,`deleteTemplate` (`admin/actions.ts`); lectura en `lib/data/templates.ts` | `admin/layout.tsx` (404), `admin/TemplateEditor.tsx`, `Project/Routine/HabitTemplateFields.tsx` | `supabase/tests/0020_rls_template_catalog.sql` (12 assertions, ✅) · `tests/domain/templates-catalogo.test.ts` (9 casos, ✅) |

```
tests/domain/*.test.ts → 56 tests, 56 pass, 0 fail (node --experimental-strip-types --test)
```

Ver `/docs/CHECKS.md` para el desglose exacto por archivo y para los ítems
marcados honestamente como NO EJECUTADOS.

## Arquitecto de Manifestación (D-164, migración 0067)

| Requisito | Tablas | RLS / GRANT | Server Actions y rutas | UI | Pruebas |
|---|---|---|---|---|---|
| Brief ampliado: mantra, acción del día, área de foco, categorías, 10-20 afirmaciones | `identity_briefs` (+`mantra`,`daily_action`,`focus_area`,`action_done`,`generator`,`agent_version`) | `identity_briefs_own`; GRANT por columna: la persona solo escribe `reactions` y `action_done` | `generateTodayBrief`,`regenerateTodayBrief`,`marcarAccionDelDia` | `brief/MantraCard.tsx`,`brief/DailyActionCard.tsx`,`brief/AffirmationGroups.tsx`,`brief/BriefCard.tsx` | `tests/domain/identity-brief.test.ts` (19 casos, ✅) · `supabase/tests/0040_*.sql` (13 assertions, ✅) |
| Las 11 categorías proyectan a las 7 áreas sin taxonomía nueva | — (dentro del jsonb `affirmations`) | — | — | `AffirmationGroups.tsx` | `tests/domain/identity-categorias.test.ts` (6 casos, ✅) |
| Libro de estilo: etiquetar, medir, correlacionar | `identity_brief_style` | `_select_own`,`_insert_own`; **sin UPDATE ni DELETE** para `authenticated`; cascade desde el brief | `guardarBrief` (etiqueta) · `despacharEstilo` en `/api/push/dispatch` (mide) | — (viaja al prompt) | `tests/domain/identity-estilo.test.ts` (16 casos, ✅) |
| El agente Python escribe el brief; TypeScript es el respaldo | `identity_briefs.generator` | — | `src/lib/identity/manifestacion.ts` (único punto de decisión) | — | `tests/domain/identity-respaldo.test.ts` (5 casos, ✅) · `agents/tests/` (61 casos, ✅) |
| Contexto e ingesta del agente, sin sesión | lectura de las mismas que el brief | `MANIFESTATION_AGENT_SECRET` + token HMAC; `audit_log` de cada lectura; opt-in de `ai_domains` respetado | `/api/agents/manifestation/context`, `/api/agents/manifestation/brief` | — | `tests/domain/identity-token.test.ts` (7 casos, ✅) · `tests/domain/identity-payload.test.ts` (8 casos, ✅) · recorrido real con `curl`, ver CHECKS.md |
| Joe Dispenza como quinta inspiración, sin poder atribuirse | `identity_profiles.inspirations` (check ampliado) | `identity_profiles_own` | `upsertIdentityProfile` | `IdentityProfileSheet.tsx`,`BriefCard.tsx` | `citaAtribuida` en `identity-brief.test.ts` (✅) · `0040_*.sql` (✅) |

Contrato entre lenguajes: `agents/contract/brief.example.json` lo validan **los
dos lados** (`tests/domain/identity-payload.test.ts` y
`agents/tests/test_manifestation_models.py`), así que una deriva pone en rojo a
uno de ellos.


## Arranque guiado (D-165, migración 0068)

| Requisito | Tablas | RLS / GRANT | Server Actions y rutas | UI | Pruebas |
|---|---|---|---|---|---|
| Política global editable solo por el administrador; nace apagada | `ritual_policy` (fila única, sin dueño) | `select` con sesión; `insert`/`update`/`delete` solo `is_admin()`; `revoke all from anon` | `updateRitualPolicy` (triple defensa con `exigirAdmin`) | `/admin/ritual` (`RitualPolicyForm.tsx`) | `supabase/tests/0041_arranque_guiado.sql` (19 assertions, ✅) |
| El usuario apaga lo que el admin encendió, **nunca al revés** | `ritual_prefs` (`steps_off`, no `steps_on`) | `ritual_prefs_own` | `updateRitualPrefs` | `settings/RitualPrefs.tsx` (solo pinta `pasosOfrecibles`) | `tests/domain/ritual-policy.test.ts` (prueba de propiedad sobre 400 combinaciones, ✅) |
| Primera sesión del día, dentro de ventana y frecuencia | `ritual_runs` (PK `user_id, local_date`) | `ritual_runs_own`; `ritual_gate()` es `security invoker` | `startRitual`,`advanceRitual`,`skipRitual`,`completeRitual` | `components/ritual/RitualGate.tsx` en `(app)/layout.tsx` | `tests/domain/ritual-decidir.test.ts` (11, ✅) · recorrido de navegador, ver CHECKS.md |
| La secuencia se calcula de datos reales; ningún paso sin dato; la hora decide la rutina | — (lee `routines`,`habits`,`habit_logs`,`occupations`,`identity_briefs`,`daily_plans`, dinero) | la RLS de cada tabla | `loadRitualContent` (`src/lib/data/ritual.ts`), `loadRoutinesForToday` | `RitualOverlay.tsx`,`RitualStep.tsx` | `tests/domain/ritual-secuencia.test.ts` (27, ✅) · `ritual-contexto.test.ts` (11, ✅) |
| Marcar el hábito con la acción de siempre | `habit_logs` | `habit_logs` de siempre | `toggleHabitToday` (sin duplicar) | `components/habits/HabitCheckbox.tsx` (extraída de `HabitRow`) | recorrido de navegador (✅) |
| Respaldo del brief sin bloquear, un intento al día | `ritual_runs.brief_attempted`; `identity_briefs` vía `guardarBrief` | sesión; `ritual_runs_own` | `POST /api/ritual/brief` → `generateTodayBrief` | — | recorrido de navegador con el agente en un agujero negro (✅) |
| Blanco de día, invertido de noche, por hora local | — | — | — | `.rit-shell[data-ritual-theme]` en `globals.css` | `tests/domain/ritual-tema.test.ts` (4, ✅) · recorrido de navegador (✅) |
| Accesible con teclado y lector de pantalla | — | — | — | `src/lib/dom/ritual-focus.ts` | `tests/dom/ritual-focus-dom.test.ts` (13, ✅) |

## Navegación premium (D-166, migración 0069)

| Requisito | Tablas | RLS / GRANT | Server Actions y rutas | UI | Pruebas |
|---|---|---|---|---|---|
| El modo es de cada persona y la sigue entre dispositivos | `ritual_prefs.nav_mode` | `ritual_prefs_own`; `check (nav_mode in ('premium','habitual'))` | `setNavMode(modo)` | `CentroPremium` (pie), `ActivarPremium` (Home) | `supabase/tests/0042_navegacion_premium.sql` (6 assertions, ✅) |
| Sin elección previa, premium | — | `coalesce(f.nav_mode,'premium')` en `ritual_gate` | — | — | pgTAP 0042 (✅) · `centro-apertura.test.ts` (✅) |
| Se abre al empezar la visita en Home, no en cada navegación ni sobre un enlace directo | — | — | — | `RitualHost` (`sessionStorage`) | `tests/domain/centro-apertura.test.ts` (7, ✅) · navegador (✅) |
| El centro enseña lo siguiente, las cifras del día y todos los módulos | lee lo de D-165 | la RLS de cada tabla | `GET /api/centro` | `CentroPremium.tsx` | `centro-componer.test.ts` (9, ✅) · `centro-destinos.test.ts` (8, ✅) |
| Una sola lista de destinos, la del menú | — | — | — | `destinosDelCentro(NAV_ITEMS)` | `centro-destinos.test.ts` compara con `NAV_ITEMS` real (✅) |
| Siempre se puede salir y volver | `ritual_prefs.nav_mode` | — | `setNavMode` | «Navegación habitual» · `BotonCentro` · `ActivarPremium` | navegador: persiste tras recargar y en contexto nuevo (✅) |
| La secuencia de la mañana termina en el centro | `ritual_runs` | — | — | `RitualOverlay alCentro` | navegador (✅) |
| El coste no crece en cada clic | — | — | `ritual_gate` con una columna más; contenido por ruta | — | revisión del código; sin prueba automática de rendimiento |

## Centro agéntico (D-167, migración 0070)

| Requisito | Tablas | RLS / GRANT | Server Actions y rutas | UI | Pruebas |
|---|---|---|---|---|---|
| La IA propone qué sigue, a partir de la actividad real | `coach_proposals` (`origen='centro'`), lee los hechos del motor | la de siempre; `origen <> 'coach' or message_id is not null` intacta | `src/lib/centro/generar.ts`, `src/lib/centro/sugerencias.ts`, `GET /api/centro` | `Sugerencias.tsx` | `supabase/tests/0043_centro_agentico.sql` (9, ✅) · navegador (✅) |
| `foco` lleva a una pantalla y no escribe nada | `coach_proposals.tipo` | `check` con `foco` | `ejecutar()` devuelve `href`, como `estructura` | botón «Ir» | `centro-sugerencias.test.ts` (✅) · navegador: acepta y navega (✅) |
| El destino no se lo inventa el modelo | — | — | `destinoValido(href, proyectos)` | — | `centro-sugerencias.test.ts`: externas, ocultas y proyectos ajenos (✅) |
| Piensa una vez por franja y solo si algo cambió | `centro_runs` | `centro_runs_own` | `sugerenciasDelCentro()` con `debeAnalizar` | — | `centro-franja.test.ts` (6, ✅) · pgTAP: PK por franja (✅) |
| Aceptar crea de verdad; descartar no vuelve | `coach_proposals.status` | — | `acceptProposal`, `dismissProposal` (ya existían) | `Sugerencias.tsx` | navegador: 0 → 1 tareas, y lo descartado no reaparece (✅) |
| Si el modelo no contesta, el centro se pinta igual | — | — | `/api/centro` con `Promise.all` y `.catch(() => [])` | — | navegador sin `GEMINI_API_KEY` (✅) |

## Centro lienzo (D-168, migración 0071)

| Requisito | Tablas | RLS / GRANT | Server Actions y rutas | UI | Pruebas |
|---|---|---|---|---|---|
| El centro llega en el primer HTML, sin parpadeo | — | — | `middleware.ts` (cookie `lifeos_visita` + `x-ruta`), `RitualGate` decide en servidor | `RitualHost` arranca con la vista ya decidida | navegador: el diálogo está en el HTML crudo, sin ejecutar JS (✅) |
| «Cómo voy» bajo el saludo | `centro_runs.resumen` | `centro_runs_own` | `generar.ts` (campo `resumen`), `sugerenciasDelCentro` | `CentroPremium` | pgTAP 0044 (✅) · navegador (✅) |
| «Sigue por aquí» por contexto, sin IA | — (deduce de `workspace_activity`, tareas, rutinas, quincena) | la RLS de cada tabla | `loadRitualContent` calcula `SenalesDelDia` | `.rit-destacado` | `centro-destacados.test.ts` (11, ✅) · navegador (✅) |
| Escribir una idea y que la IA diga dónde va | `coach_proposals` (tipo `nota`) | `check` con `nota` | `POST /api/centro/capturar`, `capturarIdea` | `BarraCaptura.tsx` | `centro-captura.test.ts` (10, ✅) · navegador (✅) |
| Aceptar una nota la crea de verdad | `notes` | la de siempre | `ejecutar()` → `createNote` + `saveNote` (versión 1) | botón «Guardar» | navegador: 0 → 1 notas, con su cuerpo (✅) |
| Ante la duda, pregunta | — | — | `sanearCaptura` degrada a `pregunta` | opciones como botones | `centro-captura.test.ts` (✅) |

## El centro dice qué hacer (D-169, sin migración)

| Requisito | Tablas | RLS / GRANT | Server Actions y rutas | UI | Pruebas |
|---|---|---|---|---|---|
| Una sola cosa en pantalla, en orden de caducidad | — (nada nuevo) | — | — (puro) | `Lienzo.tsx` | `centro-lienzo.test.ts` (14, ✅) · navegador: «se ve UNA sola cosa» (✅) |
| El porqué acompaña siempre al qué | `centro_runs.resumen`, `coach_proposals.payload.motivo` | las de D-167/D-168 | `GET /api/centro` (sin cambios) | `.rit-eyebrow` | `centro-lienzo.test.ts`: sin dato no hay tarjeta (✅) · navegador (✅) |
| El hábito se marca sin salir, con la regla de la hora de D-165 | `habit_logs` | `habit_logs_own` | `toggleHabitToday` (ya existía) | `HabitCheckbox` 64px | `ritual-secuencia.test.ts` (✅) · navegador (✅) |
| Una propuesta se acepta de un toque | `coach_proposals` | la de D-151 | `acceptProposal` (ya existía) | «Ir» / «Añadir» | navegador: navega y queda `accepted` (✅) |
| «Ahora no» aparta; nada se pierde | — (estado en el cliente) | — | — | contador «Quedan N» | `centro-lienzo.test.ts`: lo pospuesto va al final sin duplicarse (✅) · navegador (✅) |
| Un día sin nada no miente | — | — | — | tarjeta de cierre | `centro-lienzo.test.ts`: día vacío abre en el cierre (✅) · navegador (✅) |
| El menú desaparece del centro | — | — | — | `destinos.ts`, `destacados.ts`, `componer.ts` y `Sugerencias.tsx` **borrados** | navegador: ni lista de módulos, ni atajos, ni rejilla (✅) |

## Agent Runtime mínimo (D-170, sin migración)

Las columnas vacías no son un descuido: **son el resultado del sprint**. El
núcleo entra sin tocar base, sin rutas y sin pantallas.

| Requisito | Tablas | RLS / GRANT | Server Actions y rutas | UI | Pruebas |
|---|---|---|---|---|---|
| Existe un vocabulario común de agente | — | — | — (puro) | — | `types.ts` compila bajo `strict` (✅) |
| El registro da de alta y devuelve por id | — | — | — (puro) | — | `agents-registro.test.ts` (12, ✅) |
| Listar es estable, no depende del orden de import | — | — | — | — | `agents-registro.test.ts`: orden por id (✅) |
| Un contrato inválido no entra, con motivo pintable | — | — | — | — | `agents-registro.test.ts`: id, versión, descripción, `ejecutar` (✅) |
| Un id duplicado se rechaza y gana el primero | — | — | — | — | `agents-registro.test.ts`: el que ya estaba queda intacto (✅) |
| El registro no lanza nunca (D-021) | — | — | — | — | `agents-registro.test.ts`: id desconocido → `null` (✅) |
| El runtime no entra en el bundle de cliente | — | — | `runtime.ts` con `server-only` | — | `pnpm build` (✅) · `git diff --stat` vacío (✅) |
| Preparado para ejecutar, sin ejecutar | — | — | — | — | `AgentDefinition.ejecutar` en el tipo; el runtime no lo expone (✅) |

## Agentic Kernel, Fase 1 (D-171, sin migración)

Las columnas vacías siguen siendo el resultado: el Kernel crece sin tocar base,
rutas ni pantallas. La diferencia con D-170 es que ahora hay reglas que probar.

| Requisito | Tablas | RLS / GRANT | Server Actions y rutas | UI | Pruebas |
|---|---|---|---|---|---|
| Cada agente declara qué dominios necesita | — | — | — (puro) | — | `agents-registro.test.ts`: sin dominios no entra (✅) |
| La puerta de privacidad se aplica al agente | — | — | — (puro) | — | `agents-contexto.test.ts`: estrecha y nunca ensancha (✅) |
| Un dominio apagado deja al agente fuera | — | — | — | — | `agents-seleccion.test.ts` + `agents-contexto.test.ts`: corta con motivo (✅) |
| Los hechos se filtran por dominio del agente | — | — | — | — | `agents-contexto.test.ts`: el de hábitos no ve dinero (✅) |
| Cada agente dice a qué versión de ti sirve | — | — | — | — | `agents-registro.test.ts`: solo las 7 `AREAS` (✅) |
| Identidades incompatibles se detectan | — | — | — | — | `agents-politicas.test.ts`: gana el primero, el otro calla (✅) |
| **Por defecto NO se actúa** | — | — | — | — | `agents-politicas.test.ts`: el que solo resume, calla (✅) |
| Un descarte de hoy silencia al agente | — | — | — | — | `agents-politicas.test.ts` (✅) |
| Riesgo alto interrumpe menos, no más | — | — | — | — | `agents-politicas.test.ts`: topes por franja (✅) |
| Todo silencio lleva motivo legible | — | — | — | — | `agents-politicas.test.ts`: motivo que nombra al agente (✅) |
| La selección es determinista y estable | — | — | — | — | `agents-seleccion.test.ts`: prioridad, desempate por id (✅) |
| Solo se permite la autonomía «propone» | — | — | — | — | `agents-registro.test.ts`: `autonomo` rechazado (✅) |
| No se llama al modelo sin presupuesto | — | — | — | — | `agents-registro.test.ts`: pensar ≥ tope se rechaza (✅) |
| Un agente que falla no tumba a quien lo llamó | — | — | `ejecutarAgente` con `server-only` | — | `pnpm build` (✅); sin agente real todavía (⚠️) |
| Ningún módulo importa el Kernel | — | — | — | — | `git diff` acotado a Kernel + mudanza de `Budget` (✅) |

## Agentic Kernel, Fase 2 — el coach (D-172, sin migración)

Primer agente real. Las columnas de datos siguen vacías porque registrar no es
conectar: el coach de producción sigue siendo el de `/api/push/dispatch`.

| Requisito | Tablas | RLS / GRANT | Server Actions y rutas | UI | Pruebas |
|---|---|---|---|---|---|
| El coach cumple el contrato de agente | — | — | — | — | `agents-coach.test.ts`: `validarAgente` lo acepta (✅) |
| Entra en el registro al arrancar | — | — | `runtime.ts` (`server-only`) | — | `agents-coach.test.ts` (✅) · `problemasDeArranque()` vacío (✅ typecheck) |
| Responde a las dos citas del día y a nada más | — | — | — | — | `agents-coach.test.ts`: mañana y noche sí; centro y hábito no (✅) |
| Una vez por franja | — | — | — | — | `agents-coach.test.ts`: riesgo medio → tope 1 (✅) |
| Pide ocho dominios, ve solo los encendidos | `profiles.ai_domains` | la de 0048 | — | — | `agents-coach.test.ts` (✅) |
| Sabe qué dominios pidió y no puede ver | — | — | — | — | `agents-coach.test.ts`: `skippedDomains` incluye lo apagado (✅) |
| Con todo apagado, no corre | — | — | — | — | `agents-coach.test.ts` (✅) — misma regla que ya aplicaba `daily.ts` |
| No choca con ningún especialista futuro | — | — | — | — | `agents-coach.test.ts`: sirve las 7 áreas (✅) |
| Un disparo que no es suyo no se interpreta | — | — | — | — | `agents-coach.test.ts`: `momentoDelDisparo` → `null` (✅) |
| El agente no escribe | `ai_chat_messages`, `coach_proposals` | sin cambios | envuelve `generarMensajeCoach`, no `…Guardar…` | — | por construcción: la función envuelta no importa Supabase (✅) |
| No se filtra al bundle de cliente | — | — | `server-only` | — | `pnpm build`: First Load JS 102 kB, sin cambio (✅) |
| `ejecutar` con un agente real | — | — | — | — | **sin ejercitar** (⚠️): nadie lo llama todavía |
| Paridad de conducta con el camino actual | — | — | — | — | **no** (⚠️): sin `CajaDeHerramientas`, ver CHECKS |

## Agentic Kernel, Fase 3 — el disparo real (D-173, sin migración)

Primera vez que el Kernel puede cambiar el comportamiento de producción. Por eso
la columna que importa es la última: todo depende de una variable apagada.

| Requisito | Tablas | RLS / GRANT | Server Actions y rutas | UI | Pruebas |
|---|---|---|---|---|---|
| El agente recibe la caja de herramientas | — | — | `daily.ts` → `acotarContexto` | — | `agents-contexto.test.ts`: pasa entera (✅) |
| Un agente sin caja sigue funcionando | — | — | — | — | `agents-contexto.test.ts`: no la inventa (✅) |
| La forma de la caja vive en el dominio | — | — | fábrica intacta en `lib/ai/tools.ts` | — | `pnpm typecheck`: 8 consumidores sin tocar (✅) |
| Sin la variable, nada cambia | — | — | `coachPorElKernel()` → `false` | — | `pnpm build` (✅) · en producción **sin ejercitar** (⚠️) |
| Con la variable, el Kernel decide y ejecuta | — | — | `daily.ts` · `/api/push/dispatch` | — | **sin ejercitar** (⚠️): requiere `GEMINI_API_KEY` |
| El contexto es el mismo por los dos caminos | — | — | — | — | por construcción: se sustituyen 4 líneas (✅ lectura) |
| El coach puede callarse, con motivo | — | — | el motivo va a `audit_log` | — | `agents-politicas.test.ts` (✅) · de punta a punta **no** (⚠️) |
| Lo que devuelve el agente se comprueba | — | — | `esSalidaCoach()` | — | `pnpm typecheck`: sin `as` (✅) |
| Volver atrás no requiere desplegar | — | — | borrar `AGENT_KERNEL_COACH` | — | por construcción (✅) |
