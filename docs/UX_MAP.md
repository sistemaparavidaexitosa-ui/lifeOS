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
| Proyectos y Tareas | `/execution` | `execution/page.tsx` | `projects`,`tasks` | `createProject`,`createTask`,`setTaskStatus` |
| Matriz de Eisenhower | `/execution/eisenhower` | `eisenhower/Board.tsx` | `tasks` (columna `urgent`) | `changeTaskQuadrant` |
| Planeación | `/planning` | `planning/page.tsx` | `daily_plans`,`weekly_reviews`,`tasks`,`projects` | `approveDailyPlan`,`closeoutTask`,`saveDailyLearning`,`approveWeeklyReview` |
| Autogestión del Tiempo | `/time` | `time/page.tsx` | `profiles` (ventana),`occupations`,`tasks` | `updateActivityWindow`,`upsertOccupation`,`deleteOccupation`,`assignTaskToSlot` |
| Vista semanal (7 días) | `/time?view=week` | `time/WeekView.tsx` | `occupations` (solo lectura) | — (edición redirige a `/time`) |
| Panel de Desarrollo Personal | `/development` | `development/page.tsx` | `personal_goals`,`key_results`,`routines`,`routine_steps`,`routine_runs` | Lectura agregada |
| Metas Personales | `/development/goals` | `development/goals/page.tsx` | `personal_goals`,`key_results` + fuentes (`habits`,`habit_logs`,`projects`,`tasks`,`books`,`financial_goals`) | `upsertPersonalGoal`,`deletePersonalGoal`,`upsertKeyResult`,`deleteKeyResult` |
| Rutinas | `/development/routines` | `development/routines/page.tsx` | `routines`,`routine_steps`,`routine_runs`,`occupations`,`habits` | `upsertRoutine`,`deleteRoutine`,`upsertRoutineStep`,`deleteRoutineStep`,`toggleRoutineStep` |
| Hábitos | `/development/habits` | `development/habits/page.tsx` | `habits`,`habit_logs`,`occupations` | `upsertHabit`,`toggleHabitToday`,`deleteHabit` |
| Biblioteca | `/development/library` | `development/library/page.tsx` | `books`,`book_notes` | `upsertBook`,`addBookNote`,`deleteBook` |
| Buscador de metadatos de libro | `/api/development/book-lookup` | `api/development/book-lookup/route.ts` | Open Library + Google Books (sin tabla) | Prellena `BookForm`; el libro lo guarda `upsertBook` |
| Recomendaciones (panel de Dinero) | `/money` (al final) | `components/InsightPanel.tsx` | `recommendations` + hechos derivados de `budgets`,`journal_entries`,`profiles` | `analyze`,`dismissRecommendation`,`suppressRecommendation` |
| Equipos y Colaboración | `/workspaces` | `workspaces/page.tsx` | `workspaces`,`memberships`,`invitations`,`project_shares` | `createWorkspace`,`inviteMember`,`removeMember`,`shareProject`,`deleteWorkspace` |
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
