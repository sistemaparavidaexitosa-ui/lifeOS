# UX_MAP — Vista HTML → Ruta → Componente → Fuente de datos → Acción real

Fuente de diseño: `LifeOS 4.html` (autocontenido, con `localStorage` como
mock). **Ninguna** de esas rutas de `localStorage` se portó: cada vista de
esta tabla lee de Supabase vía Server Component y cada acción invoca una
Server Action real que escribe en Postgres (guardrail NO-MOCK, F8).

| Vista HTML | Ruta Next.js | Componente principal | Fuente de datos (Supabase) | Acción real / endpoint |
|---|---|---|---|---|
| Onboarding | `/onboarding` | `onboarding-form.tsx` | `profiles`, `consents` | `completeOnboarding` (Server Action) |
| Login/Signup | `/login` | `login-form.tsx` | `auth.users` (Supabase Auth) | `signIn`/`signUp` (Server Action) |
| Home | `/home` | `home/page.tsx` | `profiles`,`daily_plans`,`tasks`,`accounts`,`journal_entries`,`budgets`,`occupations`,`books` | Lectura agregada en `getHomeData()` |
| Plantillas de proyecto | `/execution` (formulario de nuevo proyecto) y menú del proyecto → «Aplicar plantilla» | `execution/ProjectTemplatePicker.tsx`, `execution/template-actions.ts`; el catálogo lo lee `lib/data/templates.ts` (la página lo baja por props: el selector es cliente) | `template_catalog` (lectura), `task_groups`,`tasks`,`task_history` (escritura) | `createProject` (con `templateId`), `applyProjectTemplate` |
| Panel de administración · catálogo de plantillas | `/admin`, `/admin/[kind]`, `/admin/[kind]/[slug]` (`nueva` para crear) | `admin/layout.tsx` (404 si no es admin), `admin/TemplateEditor.tsx` + los tres `*TemplateFields.tsx`, `admin/actions.ts` | `template_catalog`, `profiles.is_admin`, `audit_log` | `saveTemplate`,`setTemplateStatus`,`deleteTemplate` |
| Proyectos y Tareas | `/execution` | `execution/page.tsx` | `projects`,`tasks` | `createProject`,`createTask`,`setTaskStatus` |
| Matriz de Eisenhower | `/execution/eisenhower` | `eisenhower/Board.tsx` | `tasks` (columna `urgent`) | `changeTaskQuadrant` |
| Planeación | `/planning` | `planning/page.tsx` | `daily_plans`,`weekly_reviews`,`tasks`,`projects` | `approveDailyPlan`,`closeoutTask`,`saveDailyLearning`,`approveWeeklyReview` |
| Autogestión del Tiempo | `/time` | `time/page.tsx` | `profiles` (ventana),`occupations` (incl. `days`, `source`),`tasks` | `updateActivityWindow`,`upsertOccupation`,`deleteOccupation`,`assignTaskToSlot` |
| Vista semanal (7 días) | `/time?view=week` | `time/WeekView.tsx` | `occupations` — cada recurrente se pinta solo en los días de su columna `days` | Edición por día vía `DayEditor` |
| Panel de Desarrollo Personal | `/development` | `development/page.tsx` | `personal_goals`,`key_results`,`routines`,`routine_steps`,`routine_runs` | Lectura agregada |
| Metas Personales | `/development/goals` | `development/goals/page.tsx` | `personal_goals`,`key_results` + fuentes (`habits`,`habit_logs`,`projects`,`tasks`,`books`,`financial_goals`,`savings_goals`) | `upsertPersonalGoal`,`deletePersonalGoal`,`upsertKeyResult`,`deleteKeyResult` |
| Rutinas | `/development/routines` | `development/routines/page.tsx`,`RoutineTemplates.tsx` | `routines`,`routine_steps`,`routine_runs`,`occupations`,`habits`; catálogo en `lib/domain/development/templates.ts` | `upsertRoutine`,`deleteRoutine`,`upsertRoutineStep`,`deleteRoutineStep`,`toggleRoutineStep`,`createRoutineFromTemplate` |
| Hábitos | `/development/habits` | `development/habits/page.tsx`,`HabitTemplates.tsx`,`HabitRow.tsx` | `habits` (+`cue`,`two_min_version`,`stack_after_habit_id`),`habit_logs`,`occupations` | `upsertHabit`,`toggleHabitToday`,`deleteHabit` |
| Biblioteca (vistas: estado / categoría / todos) | `/development/library?por=` | `development/library/page.tsx`,`LibraryViews.tsx` | `books` (+`category`),`book_notes`,`book_progress` | `upsertBook`,`addBookNote`,`deleteBook` |
| Buscador de metadatos de libro | `/api/development/book-lookup` | `api/development/book-lookup/route.ts` | Open Library + Google Books (sin tabla) | Prellena `BookForm`; el libro lo guarda `upsertBook` |
| Recomendaciones (panel por ámbito) | `/money`, `/debt`, `/time`, `/execution` (cartera), `/development` y `/home` (ámbito `global`), al final de cada una | `components/InsightSection.tsx` (carga) + `components/InsightPanel.tsx` (UI) | `recommendations` filtradas por `domain` = ámbito | `analyze(scope)`,`setRecommendationStatus` |
| Motor de hechos (sin pantalla propia) | — | `lib/domain/insights/facts/{money,debt,time,execution,habits,activity}.ts` | money: `budgets`,`journal_entries`,`profiles` · debt: `debts`,`journal_entries.debt_id` · time: `occupations`,`tasks`,`profiles` · execution: `projects`,`tasks` · habits: `habits`,`habit_logs`,`routines`,`routine_runs` | `analyze(scope)`; cinco dominios personales + `global`, y `activity` aparte (D-066) |
| Bandeja de recomendaciones | `/intelligence` — **fuera del menú** (D-049); se llega desde el panel de `/money` y desde `/settings` | `intelligence/page.tsx` | `recommendations` | `setRecommendationStatus`,`editRecommendationText` |
| Memoria del motor | `/intelligence/memory` — **fuera del menú** (D-049); se llega desde `/intelligence` y desde `/settings` | `intelligence/memory/page.tsx` | `memory_items` | `upsertMemoryItem`,`deleteMemoryItem` |
| Opt-in y borrado de IA | `/settings` | `settings/AiSettings.tsx` | `profiles.ai_domains` | `setAiDomains`,`clearAiHistory`,`clearMemory` |
| Automatizaciones | `/settings` | `settings/Automations.tsx`, `lib/domain/automations/rules.ts`, `lib/automations/dispatch.ts` | `automations`,`automation_runs`; disparadas desde `setTaskStatus`,`setTaskAssignees`,`addTaskComment` | `upsertAutomation`,`toggleAutomation`,`deleteAutomation` |
| Actividad del espacio (+ recap «¿qué me perdí?») | `/activity?ws=` — pestaña del espacio, fuera del menú (D-057) | `activity/page.tsx`, `lib/domain/execution/activity.ts`, `lib/domain/insights/facts/activity.ts` | `workspace_activity`,`comments`,`comment_reads`,`projects` | Lectura agregada + `analyze('activity')` |
| Bandeja de menciones | Barra superior, en todas las pantallas | `components/MentionsBell.tsx` (carga) + `MentionsMenu.tsx` (UI) | `comments.mentioned_user_ids`, `comment_reads` | `markMentionRead`,`markAllMentionsRead` |
| Hilo de una tarea (comentarios + historial + reacciones) | Drawer de tarea | `execution/TaskThreadPanel.tsx`, `lib/domain/execution/{thread,mentions,reactions}.ts` | `comments`,`task_history`,`comment_reactions`; roster vía `list_workspace_members` | `addTaskComment`,`toggleReaction`,`reactDone`,`pinCommentToLogbook`,`createReminder` |
| Hilo de un PROYECTO (solo conversación: comentarios y menciones) | `/execution?project=&view=hilo` — pestaña del tablero, solo en espacios compartidos | `execution/ProjectThreadPanel.tsx`, `execution/mention-ui.tsx`, `lib/domain/execution/{mentions,reactions,reminders}.ts` | `comments` (`subject_type='project'`),`comment_reactions`; roster vía `list_workspace_members`. **Ya NO lee `workspace_activity`** (D-086): los eventos viven en `/activity` | `getProjectThread`,`addProjectComment`,`toggleReaction`,`pinCommentToLogbook`,`createReminder` |
| Recordatorios del día | `/home` (tarjeta «Te pediste recordar») | `home/RemindersCard.tsx`, `lib/domain/execution/reminders.ts` | `reminders` | `createReminder`,`completeReminder` |
| Notebooks (cuadernos del espacio) | `/notebooks` | `notebooks/page.tsx`,`NotebookGrid.tsx`,`NoteList.tsx`,`NoteEditor.tsx` | `notebooks`,`notes` | `createNotebook`,`renameNotebook`,`deleteNotebook`,`createNote`,`saveNote`,`deleteNote` |
| Búsqueda de notas | `/notebooks` (cabecera) | `notebooks/NotesSearch.tsx` | RPC `search_notes` sobre `notes.search` (tsvector español) | `searchNotes` |
| Paleta de comandos (`Cmd+K` / `Ctrl+K`) | Todas las pantallas | `components/CommandPalette.tsx`, `lib/domain/search/query.ts` | RPC `search_workspace` sobre `projects`,`tasks`,`comments`,`notes`,`workspace_activity` | `searchWorkspace`,`quickAddTask` |
| Espacios de trabajo y equipo | `/execution` y `/notebooks` (selector + panel «Equipo») | `components/workspace/WorkspaceSwitcher.tsx`,`TeamPanel.tsx`,`WorkspaceTabs.tsx` | `workspaces`,`memberships`,`invitations`,`project_shares` | `createWorkspace`,`inviteMember`,`revokeInvitation`,`removeMember`,`moveProject`,`shareProjectWithGuest`,`deleteWorkspace` |
| Dashboard y Gastos | `/money` | `money/page.tsx` | `accounts`,`journal_entries`,`journal_lines`,`budgets` | `createAccount`,`postTransaction`,`reconcileEntry`,`reverseEntry` |
| Presupuesto (tabular) | `/money/budget` | `budget/page.tsx`,`QuincenalIncomeForm.tsx`,`CreateBudgetButton.tsx` | `budgets` (monthly_cost/q1/q2); `profiles.quincenal_income`; `accounts`+`journal_entries` (conciliación, lectura reutilizada) | `upsertBudgetLine`,`deleteBudgetLine`,`updateQuincenalIncome` |
| Inversiones | `/investments` | `investments/page.tsx` | `investments` | `upsertInvestment`,`deleteInvestment` |
| Ahorros | `/savings` | `savings/page.tsx` | `savings_goals` | `upsertSavingsGoal`,`contributeToSaving`,`deleteSavingsGoal` |
| Deudas | `/debt` | `debt/page.tsx` | `debts` | `upsertDebt`,`deleteDebt`,`saveDebtScenario`,`acceptAiDebtPlan` |
| Cashback | `/cashback` | `cashback/page.tsx` | `cashback_cards`,`cashback_redemptions` | `upsertCashbackCard`,`redeemCashback` |
| Patrimonio | `/wealth` | `wealth/page.tsx` | `assets`,`liabilities`,`net_worth_snapshots` | `upsertAsset`,`createNetWorthSnapshot` |
| Metas Financieras | `/goals` | `goals/page.tsx` | `financial_goals` | `upsertFinancialGoal`,`deleteFinancialGoal` |
| Hogar y Dependientes | `/household` | `household/page.tsx` | `family_members` (+ join con `journal_entries`/`financial_goals`/`investments` por `family_member_id`) | `upsertFamilyMember`,`deleteFamilyMember` |
| Recomendaciones (Intelligence OS) | — (integrado en Home/Execution/Time/Debt) | `SequenceButton.tsx`, notas de saturación en `time/page.tsx` | `tasks`,`occupations`,`profiles` (cálculo determinista, sin tabla `recommendations` consumida aún en UI) | `requestProjectSequence`/`applyProjectSequence` |
| Reportes | `/reports` | `reports/page.tsx` | `tasks`,`projects`,`accounts`,`journal_entries`,`investments`,`assets`,`debts` | Lectura agregada |
| Configuración | `/settings` | `settings/page.tsx` | `profiles`,`categories` | `updateProfile`,`addCategory`,`toggleTheme` |

## Estados de UI reproducidos

- **loading**: cada Server Component se resuelve en el servidor; Next.js
  muestra el `loading.tsx` implícito del framework durante la navegación (no
  se añadió un skeleton custom por página en este slice — ver
  `/docs/DECISIONS.md` D-005).
- **empty**: componente `<EmptyState icon text />` reutilizado en todas las
  vistas (proyectos, tareas, cuentas, deudas, hábitos, libros, metas, etc.).
- **error**: cada formulario cliente captura el `Error` lanzado por la Server
  Action y lo muestra inline (patrón `try { await action() } catch (e) { setError(...) }`).
- **stale/offline**: no implementado en este slice (Phase 2, ver `TD-001` en
  `MASTER_PRODUCT_SOFTWARE_ARCHITECTURE_SPECIFICATION_v0.4.md`).

## Fidelidad de tokens de diseño

Los tokens de color/radio/sombra de `:root` en `LifeOS 4.html` se portaron
literalmente a `src/app/globals.css` (mismas variables CSS `--bg`,
`--surface`, `--accent`, etc.), incluyendo el tema oscuro
(`html[data-theme="dark"]`).
