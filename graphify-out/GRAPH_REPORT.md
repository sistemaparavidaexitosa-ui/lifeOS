# Graph Report - lifeOS  (2026-09-06)

## Corpus Check
- 469 files · ~389,002 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2581 nodes · 6485 edges · 242 communities (152 shown, 39 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 164 edges (avg confidence: 0.88)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Icon Set
- Time Slots & Occupations
- Notebook Actions & Errors
- Insights Context Builder
- API Routes & Page Entries
- Food Lookup Integration
- Insights Memory & States
- AI Chat Engine & Schemas
- Nutrition Domain & Targets
- Monday Board Drag & Drop
- API Routes & Page Entries
- Automations UI & Actions
- Gemini Provider & Model Chain
- Board Popovers & Menus
- Execution Insight Facts
- AI Plan Panel
- Board Popovers & Menus
- Book Lookup & Covers
- Task Detail Panel
- Board Types & Sequencing
- Workspace Team & Email
- API Routes & Page Entries
- Task & Project Threads
- Web Push Encryption
- Development Forms & Actions
- Reading Plan & Dates
- Eisenhower Matrix
- API Routes & Page Entries
- Logbook & Knowledge Cards
- Push Dispatch Scheduling
- Book Lookup & Covers
- Routines & Habits Actions
- Kanban Table Timeline Views
- Task File Attachments
- Command Palette Search
- Next Config & Root Layout
- Routine Template Fields
- Debt Simulator
- Budget Lines & Carryover
- CI Honesty Contract Docs
- Personal Goals Snapshot
- AI Project Planning
- Task & Project Threads
- Monday Board Drag & Drop
- Push Subscription Client
- TypeScript Config
- Habit Streaks & Facts
- Logbook & Knowledge Cards
- Mentions & Comments UI
- Collaboration Migration 0003
- Package Manifest
- Routine Template Fields
- Development Forms & Actions
- Money Accounts & Transactions
- Daily Plan & Closeout
- VAPID Send & Notify
- Debt Cashback Wealth Migration
- Budget Domain
- Money Insight Facts
- Admin Template Actions
- Home, Money & Reports Pages
- Debt Insight Facts
- Package Scripts
- Invite Acceptance Flow
- Investments
- Time Occupations & Overlap
- CI Build & Decisions
- Admin Template Actions
- Quincena Fortnight Periods
- Template Schemas
- CI Database pgTAP Job
- Note Serialization & Escaping
- Reminders Dispatch
- My Tasks Ownership
- Reading Plan & Dates
- Board State Decisions
- Development OS Plans
- Intelligence & PDOS Specs
- Dev Dependencies
- Mandatory Workspaces Migration
- Admin Template Actions
- Cashback Cards
- Project & Task Execution Actions
- Board Toolbar Filters
- AI Project Planning
- Routines & Habits Actions
- Workspace Access Decisions
- Money Ledger Migration
- PWA Icons & Badge
- Project Template Fields
- AI Settings Domains
- Planning Time Habits Migration
- AI Domain Access Checks
- Push Verification Checks
- No-SDK Runtime Decisions
- Template Catalog Decisions
- Routine Scorecard Plans
- Editable Blocks & Cursor
- Format Bar & Input Whitelist
- Note Block Types (Read-Only)
- Icon Generation Script
- API Routes & Page Entries
- Development Forms & Actions
- Financial Goals
- Savings Goals
- Push Endpoints & Workspaces
- RLS Recursion Fix Migration
- Personal Development Migration
- Workspace RLS Migration
- Notebooks Migration
- Intelligence Design Notes
- Habits In Routines Plan
- Inline Marks & Block Edits
- Runtime Dependencies
- Cross-cutting Search Migration
- Task Tree Domain
- Eisenhower Matrix
- Invitation Redemption Decisions
- Note Parsing & Excerpts
- Reactions & Reminders Migration
- Push Notifications Migration
- Middleware CSP Decisions
- Deploy Rollback Guardrails
- PDOS Design & Plan Links
- Routine Plan Concepts
- Routine Block Fit
- Note Editor Screen & Saving
- WYSIWYG Editor Design Decisions
- Recommendation States & Dedupe
- Development Forms & Actions
- Intelligence Migration
- Nutrition Migration
- Nutrition Domain & Targets
- Vercel Config
- Habits In Routines Migration
- Atomic Habits Migration
- Backfill Verification Script
- Identity Migration
- Groups & Folders Migration
- Admin Catalog Migration
- Node & CVE Version Pins
- Action Result Convention
- ESLint Config
- Fortnightly Budget Migration
- Invitation Accept Migration
- VAPID Key Generator
- Household Migration
- Structural RLS Fix Migration
- Task Files Migration
- Mentions Identity Migration
- Nutrition Failure Checks
- Budget Table Decisions
- Timezone & Occupation Decisions
- Projects RLS Reassert Migration
- PostCSS Config
- Tailwind Config
- Health Endpoint
- Audit Log Migration
- Comments Delete Migration
- Book Progress Migration
- Project Thread Migration
- Reading Plan Migration
- AI Chat Migration
- Test Evidence Checks
- TypedRoutes Decision
- AI Prompt Decisions
- Habits Screen Spec
- Cursor Offset Helpers
- Routine Progress Concept
- automation_runs Table
- automations Table
- comment_reactions Table
- memory_items Table
- recommendations Table
- reminders Table
- routine_runs Table
- task_assignees Table
- occupations Table
- profiles Table
- tasks Table
- tasks Table
- tasks Table
- books Table
- profiles Table
- occupations Table
- key_results Table
- workspace_activity Table
- habits Table
- habits Table
- key_results Table
- profiles Table

## God Nodes (most connected - your core abstractions)
1. `getSessionUser` - 146 edges
2. `react` - 116 edges
3. `createClient()` - 111 edges
4. `requireUser()` - 97 edges
5. `todayForUser()` - 51 edges
6. `base()` - 42 edges
7. `zod` - 42 edges
8. `addDaysISO()` - 41 edges
9. `diffDays()` - 39 edges
10. `TaskStatus` - 36 edges

## Surprising Connections (you probably didn't know these)
- `manifest()` --references--> `PWA App Icon 192`  [INFERRED]
  src/app/manifest.ts → public/icons/icon-192.png
- `manifest()` --references--> `PWA App Icon 512 (any)`  [INFERRED]
  src/app/manifest.ts → public/icons/icon-512.png
- `manifest()` --references--> `PWA App Icon 512 (maskable)`  [INFERRED]
  src/app/manifest.ts → public/icons/icon-512-maskable.png
- `EOL de Next 15.x (Maintenance LTS hasta 21-oct-2026)` --semantically_similar_to--> `Node 24.19.0 pinned in CI, .nvmrc and engines`  [INFERRED] [semantically similar]
  docs/VERSIONS.md → .github/workflows/ci.yml
- `hace()` --calls--> `addDaysISO()`  [EXTRACTED]
  tests/domain/insights-activity.test.ts → src/lib/domain/datetime.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Los cuatro componentes del editor de notas y el de lectura** — docs_superpowers_specs_2026_09_05_notas_wysiwyg_design_noteeditor, docs_superpowers_specs_2026_09_05_notas_wysiwyg_design_notedoc, docs_superpowers_specs_2026_09_05_notas_wysiwyg_design_editableline, docs_superpowers_specs_2026_09_05_notas_wysiwyg_design_formatbar, docs_superpowers_specs_2026_09_05_notas_wysiwyg_design_notebody [EXTRACTED 1.00]
- **Cadena que impide al modelo inventar cifras** — docs_superpowers_specs_2026_08_21_intelligence_os_design_fact, docs_superpowers_specs_2026_08_21_intelligence_os_design_context, docs_superpowers_specs_2026_08_21_intelligence_os_design_validacion_factid, docs_superpowers_specs_2026_08_21_intelligence_os_design_seudonimizacion, docs_superpowers_specs_2026_08_21_intelligence_os_design_inyeccion_prompt [EXTRACTED 1.00]
- **Las operaciones puras árbol⇄árbol de edit.ts** — docs_superpowers_plans_2026_09_05_notas_wysiwyg_plainlength, docs_superpowers_plans_2026_09_05_notas_wysiwyg_sliceinlines, docs_superpowers_plans_2026_09_05_notas_wysiwyg_applymark, docs_superpowers_plans_2026_09_05_notas_wysiwyg_hasmark, docs_superpowers_plans_2026_09_05_notas_wysiwyg_setblockstyle, docs_superpowers_plans_2026_09_05_notas_wysiwyg_toggletodo, docs_superpowers_plans_2026_09_05_notas_wysiwyg_splitblock, docs_superpowers_plans_2026_09_05_notas_wysiwyg_mergeblocks, docs_superpowers_plans_2026_09_05_notas_wysiwyg_textodebloque [EXTRACTED 1.00]
- **La propiedad parse(serialize(parse(x))) ≡ parse(x) y las piezas que la sostienen** — docs_superpowers_specs_2026_09_05_notas_wysiwyg_design_propiedad_round_trip, docs_superpowers_plans_2026_09_05_notas_wysiwyg_serializenote, docs_superpowers_plans_2026_09_05_notas_wysiwyg_parsenote, docs_superpowers_plans_2026_09_05_notas_wysiwyg_escapeinlinetext, docs_superpowers_plans_2026_09_05_notas_wysiwyg_escaparinicdelinea, docs_superpowers_plans_2026_09_05_notas_wysiwyg_corpus_round_trip [EXTRACTED 1.00]
- **El puente rutina→hábito que no duplica racha ni horario** — docs_superpowers_plans_2026_08_22_personal_development_os_fase_1_routine_steps, docs_superpowers_plans_2026_08_22_personal_development_os_fase_1_routine_runs, docs_superpowers_plans_2026_08_22_personal_development_os_fase_1_habitlogeffect, docs_superpowers_plans_2026_08_22_personal_development_os_fase_1_toggleroutinestep, docs_superpowers_specs_2026_08_22_personal_development_os_design_puente_habit_logs [EXTRACTED 1.00]
- **PWA installability icon set (manifest-declared)** — public_icons_icon_192, public_icons_icon_512, public_icons_icon_512_maskable, public_icons_icon_192_pwa_installability_icon_set [EXTRACTED 1.00]
- **Scorecard cuyo denominador se deriva de days, no de filas** — docs_superpowers_plans_2026_08_24_rutinas_programables_y_scorecard_occupations_days, docs_superpowers_plans_2026_08_24_rutinas_programables_y_scorecard_outcome, docs_superpowers_plans_2026_08_24_rutinas_programables_y_scorecard_routinerunstate, docs_superpowers_plans_2026_08_24_rutinas_programables_y_scorecard_scorecard, docs_superpowers_plans_2026_08_24_rutinas_programables_y_scorecard_denominador_desde_days, docs_superpowers_plans_2026_08_24_rutinas_programables_y_scorecard_bandeja_pendientes [EXTRACTED 1.00]
- **Privacidad del contexto que viaja al modelo (alias, opt-in, dominios)** — readme_privacidad_intelligence_os, docs_deploy_gemini_api_key, docs_decisions_d_088_hay_un_chat, docs_decisions_d_108_ia_ve_todo_por_defecto, docs_decisions_d_103_ningun_hecho_nombra_un_alimento, docs_ux_map_motor_de_hechos [INFERRED 0.75]
- **Administrador de plataforma: 404 + RLS + Server Action + otorgamiento por SQL** — docs_security_administrador_de_plataforma, docs_decisions_d_082_rol_de_plataforma, docs_decisions_d_083_admin_devuelve_404, docs_decisions_d_080_template_catalog_en_la_base, docs_deploy_primer_administrador, readme_administracion_catalogo_plantillas [INFERRED 0.85]
- **Cadena de verificación honesta (CI + checks + matriz de fallos)** — docs_checks_contrato_de_honestidad, docs_checks_pnpm_verify, _github_workflows_ci_build, _github_workflows_ci_db, docs_failure_matrix_resumen_de_honestidad, docs_versions_proceso_de_verificacion_de_seguridad [INFERRED 0.85]
- **Push notification visual assets (icon + badge + install gate)** — public_icons_icon_192, public_icons_badge_72, public_icons_apple_touch_icon_180, public_icons_icon_192_pwa_installability_icon_set [INFERRED 0.85]
- **Life OS icon family rendered from one checkmark mark** — public_icons_icon_512, public_icons_icon_512_maskable, public_icons_icon_192, public_icons_apple_touch_icon_180, public_icons_badge_72, public_icons_icon_512_life_os_brand_mark [INFERRED 0.95]

## Communities (242 total, 39 thin omitted)

### Community 0 - "Icon Set"
Cohesion: 0.06
Nodes (56): AuthActionState, credentialsSchema, safeNext(), signIn(), signOut(), signUp(), initialState, LoginForm() (+48 more)

### Community 1 - "Time Slots & Occupations"
Cohesion: 0.06
Nodes (46): ADR-0012, assignTaskToDate(), assignTaskToSlot(), deleteOccupation(), isoDate, occupationSchema, unassignTaskDue(), updateActivityWindow() (+38 more)

### Community 2 - "Notebook Actions & Errors"
Cohesion: 0.09
Nodes (37): createNote(), createNotebook(), deleteNote(), deleteNotebook(), firmaDelUsuario(), NoteHit, renameNotebook(), saveNote() (+29 more)

### Community 3 - "Insights Context Builder"
Cohesion: 0.10
Nodes (37): crearCajaDeHerramientas(), consultar(), leerHechos(), ESQUEMA_CONSULTA, ESQUEMA_HECHOS, OpcionesCaja, esFecha(), idDeFila() (+29 more)

### Community 4 - "API Routes & Page Entries"
Cohesion: 0.10
Nodes (27): ActivityFeed(), ActivityPage(), EisenhowerPage(), AppLayout(), GET(), InsightSection(), NotificationsBell(), ETIQUETA (+19 more)

### Community 5 - "Food Lookup Integration"
Cohesion: 0.12
Nodes (34): dynamic, GET(), requireUsdaApiKey(), CachedFood, desdeFila(), FilaFood, FoodSearchResult, guardarEnCache() (+26 more)

### Community 6 - "Insights Memory & States"
Cohesion: 0.11
Nodes (30): MemoryForm(), SCOPES, RecommendationRow(), InsightPanel(), run(), RecommendationLite, recommendationFingerprint(), activeMemory() (+22 more)

### Community 7 - "AI Chat Engine & Schemas"
Cohesion: 0.09
Nodes (34): AiChatRail(), crearTarea(), recordar(), send(), clearChat(), createMemoryFromChat(), createTaskFromChat(), loadChatHistory() (+26 more)

### Community 8 - "Nutrition Domain & Targets"
Cohesion: 0.15
Nodes (34): ACTIVITY_FACTOR, ActivityLevel, ageOn(), basalMetabolicRate(), BodyProfileLike, dailyTargets, dayMeetsTarget(), diasEntre() (+26 more)

### Community 9 - "Monday Board Drag & Drop"
Cohesion: 0.08
Nodes (34): bulkGroupSchema, BulkResult, bulkStatusSchema, groupColorSchema, idListSchema, moveSchema, moveTaskToGroup(), prioritySchema (+26 more)

### Community 10 - "API Routes & Page Entries"
Cohesion: 0.13
Nodes (26): CashbackPage(), DebtPage(), GoalsPage(), HouseholdPage(), IntelligencePage(), InvestmentsPage(), PERIODS, SavingsPage() (+18 more)

### Community 11 - "Automations UI & Actions"
Cohesion: 0.11
Nodes (30): ACTIONS, AutomationRow, Automations(), PRESETS, STATUSES, TRIGGERS, AutomationResult, deleteAutomation() (+22 more)

### Community 12 - "Gemini Provider & Model Chain"
Cohesion: 0.09
Nodes (29): Budget, CHAT_BUDGET, conversarConModelo(), GEMINI_MODEL, GEMINI_MODELS, GeminiContent, GeminiPart, GeminiResponse (+21 more)

### Community 13 - "Board Popovers & Menus"
Cohesion: 0.10
Nodes (28): applyProjectSequence(), CreatedTaskRow, deleteProject(), deleteTask(), patchProject(), patchProjectSchema, ProjectPatch, projectSchema (+20 more)

### Community 14 - "Execution Insight Facts"
Cohesion: 0.13
Nodes (24): diffDays(), activityFacts(), ActivityRowLike, ActivitySnapshot, busyProjectFacts(), ProjectTitleLike, quietFacts(), unansweredMentionFacts() (+16 more)

### Community 15 - "AI Plan Panel"
Cohesion: 0.14
Nodes (25): AiPlanConfirmResult, AiPlanPanel(), generar(), deadlineFromTargetDate(), DeadlineUnit, AiPlanGroup, AiPlanTask, asArray() (+17 more)

### Community 16 - "Board Popovers & Menus"
Cohesion: 0.12
Nodes (22): react, updateTaskDates(), AssigneePopover(), RibbonMenu(), ProjectPriorityPill(), ProjectStatusPill(), PriorityMenu(), StatusMenu() (+14 more)

### Community 17 - "Book Lookup & Covers"
Cohesion: 0.14
Nodes (26): dynamic, GET(), dynamic, GET(), BookCandidate, CATEGORY_KEYWORDS, cleanIsbn(), COVER_HOSTS (+18 more)

### Community 18 - "Task Detail Panel"
Cohesion: 0.11
Nodes (24): save(), AssigneesField(), DepCandidate, DepsField(), getTaskDetail(), setTaskAssignees(), setTaskDeps(), TaskDetailComment (+16 more)

### Community 19 - "Board Types & Sequencing"
Cohesion: 0.15
Nodes (27): bulkDeleteTasks(), bulkMoveToGroup(), bulkSetTaskStatus(), BoardApi, BoardGroup, BoardTask, ExecutionView, isExecutionView() (+19 more)

### Community 20 - "Workspace Team & Email"
Cohesion: 0.12
Nodes (21): InviteLink(), InviteMemberForm(), TeamInvitation, TeamMember, TeamPanel(), TeamSection(), ROLES_QUE_ADMINISTRAN, appUrl() (+13 more)

### Community 21 - "API Routes & Page Entries"
Cohesion: 0.28
Nodes (10): SCOPE_LABEL, Avatar(), AVATAR_PALETTE, Card(), Chip(), colorForName(), EmptyState(), initialsOf() (+2 more)

### Community 22 - "Task & Project Threads"
Cohesion: 0.13
Nodes (24): addProjectComment(), getProjectThread(), ProjectThreadResult, PRESETS, ProjectThreadPanel(), closeMenu(), pin(), react() (+16 more)

### Community 23 - "Web Push Encryption"
Cohesion: 0.14
Nodes (21): RFC-4648, RFC-5869, RFC-8188, RFC-8291, RFC-8292, concatBytes(), fromBase64Url(), toBase64Url() (+13 more)

### Community 24 - "Development Forms & Actions"
Cohesion: 0.13
Nodes (19): Field(), FormActions(), FormSheet(), deleteKeyResult(), deletePersonalGoal(), goalSchema, krSchema, upsertKeyResult() (+11 more)

### Community 25 - "Reading Plan & Dates"
Cohesion: 0.15
Nodes (21): LibraryView, LibraryViews(), VISTAS, GROUP_TITLE, gruposDelPlan(), LibraryPage(), STATUS_ORDER, todayLocal() (+13 more)

### Community 26 - "Eisenhower Matrix"
Cohesion: 0.13
Nodes (20): ADR-0013, changeTaskQuadrant(), EisenhowerBoard(), onDrop(), QUADS, TaskLite, changeQuadrant(), QUADRANT_MAP (+12 more)

### Community 27 - "API Routes & Page Entries"
Cohesion: 0.13
Nodes (23): RFC-8291, dynamic, GET(), dynamic, POST(), PersonalGoalsPage(), NutritionPage(), DevelopmentPage() (+15 more)

### Community 28 - "Logbook & Knowledge Cards"
Cohesion: 0.13
Nodes (19): updateProject(), applyAiPlan(), BoardHeader(), EditProjectForm(), LogEntry, DeleteProjectPanel(), GuestAccessPanel(), MoveProjectPanel() (+11 more)

### Community 29 - "Push Dispatch Scheduling"
Cohesion: 0.15
Nodes (21): Admin, despacharRecordatorios(), despacharVencimientos(), dynamic, maxDuration, POST(), preferencias(), reintentarPendientes() (+13 more)

### Community 30 - "Book Lookup & Covers"
Cohesion: 0.13
Nodes (21): addBookNote(), bookSchema, BookUpsertPayload, deleteBook(), planSchema, registrarPunto(), revalidarLectura(), scheduleBook() (+13 more)

### Community 31 - "Routines & Habits Actions"
Cohesion: 0.15
Nodes (19): deleteFoodEntry(), entradaSchema, filaDesde(), leerEntrada(), logFoodEntry(), logMealFromRoutine(), perfilSchema, pesoSchema (+11 more)

### Community 32 - "Kanban Table Timeline Views"
Cohesion: 0.14
Nodes (20): handleDropOnRow(), label(), TimelineView(), activeFilterCount(), BoardStats, CLOSED_STATUSES, DropMode, EMPTY_FILTERS (+12 more)

### Community 33 - "Task File Attachments"
Cohesion: 0.12
Nodes (20): TaskDetailFile, deleteSchema, deleteTaskFile(), recordSchema, recordTaskFileUpload(), formatBytes(), TaskFilesPanel(), handleDownload() (+12 more)

### Community 34 - "Command Palette Search"
Cohesion: 0.16
Nodes (18): createTask(), submit(), CommandPalette(), crear(), go(), hitHref(), isSearchable(), KIND_ALIASES (+10 more)

### Community 35 - "Next Config & Root Layout"
Cohesion: 0.11
Nodes (15): nextConfig, next, @supabase/ssr, @supabase/supabase-js, metadata, viewport, parsearJwk(), parsedPublic (+7 more)

### Community 36 - "Routine Template Fields"
Cohesion: 0.16
Nodes (17): HabitTemplateFields(), FRECUENCIAS, PASO_NUEVO, RoutineTemplateFields(), Previsualizacion(), createRoutineFromTemplate(), Contenido(), OccupationLite (+9 more)

### Community 37 - "Debt Simulator"
Cohesion: 0.16
Nodes (18): acceptAiDebtPlan(), debtSchema, deleteDebt(), saveDebtScenario(), upsertDebt(), DebtForm(), DebtLite, DebtLite (+10 more)

### Community 38 - "Budget Lines & Carryover"
Cohesion: 0.16
Nodes (17): applyCarryover(), carryoverSchema, computeCarryoverAmount(), createLineSchema, deleteBudgetLine(), editLineSchema, incomeSchema, removeCarryover() (+9 more)

### Community 39 - "CI Honesty Contract Docs"
Cohesion: 0.11
Nodes (22): Step: Verify lockfile is committed, Contrato de Honestidad (EJECUTADO OK / FALLÓ / NO EJECUTADO), D-005 · Sin skeletons custom; se confía en el streaming de Server Components, D-025 · Metadatos de libros: Open Library manda, Google Books rellena, D-039 · La búsqueda vive en la base, en español, y no es SECURITY DEFINER, D-049 · Intelligence OS sale del menú pero conserva sus rutas, D-054 · Una mención se resuelve contra el roster, no contra un regex, D-062 · La búsqueda es una consulta sobre cinco fuentes (+14 more)

### Community 40 - "Personal Goals Snapshot"
Cohesion: 0.16
Nodes (17): CardHeader(), ModuleNote(), SectionHeader(), BookCover(), goalAtRisk(), goalProgress(), KeyResultLike, KeyResultMetric (+9 more)

### Community 41 - "AI Project Planning"
Cohesion: 0.13
Nodes (18): createProject(), parsePlanPayload(), Db, readOutline(), requestAiPlan(), RequestPlanResult, requestSchema, NewProjectForm() (+10 more)

### Community 42 - "Task & Project Threads"
Cohesion: 0.13
Nodes (17): addTaskComment(), CommentLite, HistoryLite, PRESETS, ReactionLite, stateLabel(), TaskThreadPanel(), pin() (+9 more)

### Community 43 - "Monday Board Drag & Drop"
Cohesion: 0.18
Nodes (14): renameTask(), GroupHeader(), DropHint, DropMode, MondayRow(), saveTitle(), QuickAddRow(), GROUP_COLORS (+6 more)

### Community 44 - "Push Subscription Client"
Cohesion: 0.26
Nodes (17): PushNotifications(), refrescar(), PushSetup(), deletePushSubscription(), PushActionResult, savePushSubscription(), sendTestPush(), SubscriptionJson (+9 more)

### Community 45 - "TypeScript Config"
Cohesion: 0.10
Nodes (20): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+12 more)

### Community 46 - "Habit Streaks & Facts"
Cohesion: 0.17
Nodes (14): addDaysISO(), habitDoneToday(), habitStreak(), brokenStreakFacts(), HabitFactLike, HabitFrequency, habitsFacts(), HabitsSnapshot (+6 more)

### Community 47 - "Logbook & Knowledge Cards"
Cohesion: 0.17
Nodes (14): KnowledgeCard(), TYPE_ICON, TYPE_LABEL, addKnowledgeItem(), addLogEntry(), deleteKnowledgeItem(), deleteLogEntry(), KnowledgeItem (+6 more)

### Community 48 - "Mentions & Comments UI"
Cohesion: 0.20
Nodes (15): CommentBody(), MentionComposer(), close(), onType(), pick(), ProjectThreadComment, ProjectThreadReaction, BodySegment (+7 more)

### Community 49 - "Collaboration Migration 0003"
Cohesion: 0.26
Nodes (18): public.can_edit_project(), public.comments, public.has_project_access(), public.invitations, public.is_workspace_member(), public.knowledge_items, public.logbook, public.memberships (+10 more)

### Community 50 - "Package Manifest"
Cohesion: 0.11
Nodes (17): engines, node, name, packageManager, private, type, version, autoprefixer (+9 more)

### Community 51 - "Routine Template Fields"
Cohesion: 0.19
Nodes (15): AdminTemplatePage(), enBlanco(), esKind(), AdminPage(), metadata, Payload, fetchRows(), getAdminTemplate() (+7 more)

### Community 52 - "Development Forms & Actions"
Cohesion: 0.18
Nodes (13): Db, deleteHabit(), habitSchema, routineSchema, sincronizarCierreDeRutina(), toggleHabitToday(), upsertHabit(), HabitFields() (+5 more)

### Community 53 - "Money Accounts & Transactions"
Cohesion: 0.18
Nodes (13): ADR-0016, accountSchema, createAccount(), postTransaction(), reconcileEntry(), reverseEntry(), txnSchema, NewAccountForm() (+5 more)

### Community 54 - "Daily Plan & Closeout"
Cohesion: 0.18
Nodes (12): approveDailyPlan(), approveWeeklyReview(), closeoutSchema, closeoutTask(), planSchema, saveDailyLearning(), CloseoutPanel(), TaskLite (+4 more)

### Community 55 - "VAPID Send & Notify"
Cohesion: 0.18
Nodes (14): marcarEntregado(), NotificationKind, notify(), NotifyInput, Entrega, entregar(), PushPayload, PushResult (+6 more)

### Community 56 - "Debt Cashback Wealth Migration"
Cohesion: 0.25
Nodes (15): public.accounts, public.family_members, public.assets, public.cashback_cards, public.cashback_redemptions, public.debts, public.financial_goals, public.investments (+7 more)

### Community 57 - "Budget Domain"
Cohesion: 0.23
Nodes (13): budgetQuincenaRow, BudgetStatus, budgetTabRow, carryoverOffered(), DateRange, round2(), spentInRange(), totalIncomeInRange() (+5 more)

### Community 58 - "Money Insight Facts"
Cohesion: 0.28
Nodes (11): addDaysISO(), BudgetLineLike, budgetOverrunFacts(), moneyFacts(), MoneySnapshot, spendSpikeFacts(), spentIn(), unassignedIncomeFact() (+3 more)

### Community 59 - "Admin Template Actions"
Cohesion: 0.14
Nodes (13): categoriaHabito, categoriaProyecto, Cubre, frecuencia, habitTemplateSchema, prioridad, projectTemplateSchema, routineTemplateSchema (+5 more)

### Community 60 - "Home, Money & Reports Pages"
Cohesion: 0.33
Nodes (11): HomePage(), getHomeData(), DEFAULT_TIMEZONE, greetingFor(), hourInTimeZone(), isValidTimeZone(), partsIn(), safeZone() (+3 more)

### Community 61 - "Debt Insight Facts"
Cohesion: 0.32
Nodes (11): debtFacts(), DebtPaymentLike, DebtSnapshot, isLive(), minimumOnlyFacts(), monthlyInterest(), neverAmortizesFacts(), rateOutlierFacts() (+3 more)

### Community 62 - "Package Scripts"
Cohesion: 0.14
Nodes (14): scripts, build, db:push, db:reset, db:test, dev, gen:types, gen:types:local (+6 more)

### Community 63 - "Invite Acceptance Flow"
Cohesion: 0.21
Nodes (10): zod, deleteFamilyMember(), memberSchema, upsertFamilyMember(), FamilyMemberForm(), MemberLite, AcceptButton(), acceptInvitation() (+2 more)

### Community 64 - "Investments"
Cohesion: 0.22
Nodes (10): deleteInvestment(), investmentSchema, upsertInvestment(), FamilyMemberLite, InvestmentForm(), InvestmentLite, columnFromMessage(), DbErrorLike (+2 more)

### Community 65 - "Time Occupations & Overlap"
Cohesion: 0.23
Nodes (10): overlapMinutes(), ImpactTaskLike, noSlotFacts(), overlapFacts(), saturationFacts(), timeFacts(), TimeSnapshot, ActivityWindow (+2 more)

### Community 66 - "CI Build & Decisions"
Cohesion: 0.15
Nodes (13): CI job: build, D-001 · Gestor de paquetes: pnpm, D-007 · audit_log vive en public con RLS por user_id, D-075 · (superada) Dos proveedores de IA: Anthropic y OpenAI, D-087 · Un solo proveedor de IA (Gemini) y sin SDK, D-095 · El modelo deja de ser uno y pasa a ser una cadena (GEMINI_MODELS), DEPLOY · GEMINI_MODELS como cadena con fallback por 429/404, F1 · ERESOLVE en Vercel (+5 more)

### Community 67 - "Admin Template Actions"
Cohesion: 0.29
Nodes (12): deleteTemplate(), exigirAdmin(), kindSchema, PANTALLAS, repintar(), saveTemplate(), setTemplateStatus(), TemplateEditor() (+4 more)

### Community 68 - "Quincena Fortnight Periods"
Cohesion: 0.33
Nodes (10): QuincenaSwitcher(), build(), daysInMonth(), monthRangeOf(), MONTHS_SHORT, pad(), Quincena, quincenaFor() (+2 more)

### Community 69 - "Template Schemas"
Cohesion: 0.26
Nodes (10): getHabitTemplate(), getRoutineTemplate(), getProjectTemplate(), buscar(), FilaSembrada, HABITOS_SEMBRADOS, PROYECTOS_SEMBRADOS, raiz (+2 more)

### Community 70 - "CI Database pgTAP Job"
Cohesion: 0.20
Nodes (12): CI job: db (Supabase + pgTAP), Step: Verify critical dotfiles are committed, DEPLOY §1 · Supabase: link, db push, tipos y Auth, F10 · BD vacía tras db push (seed.sql no corre en remoto), F13 · Seed no idempotente deja datos a medias, F3 · Tipos de BD como stub permisivo, F9 · permission denied (RLS sin GRANT), Regla: si gen:types produce un diff, gana el generado (+4 more)

### Community 71 - "Note Serialization & Escaping"
Cohesion: 0.17
Nodes (12): CORPUS_ROUND_TRIP, escaparInicioDeLinea, escapeInlineText, serializeBlock, serializeInline, Cero migraciones de base de datos, notes.body sigue siendo Markdown en texto plano, edit.ts — módulo puro de edición (árbol ⇄ árbol) (+4 more)

### Community 72 - "Reminders Dispatch"
Cohesion: 0.32
Nodes (8): completeReminder(), ReminderCard, RemindersCard(), dueReminders(), overdueDays(), PRESET_DAYS, presetDate(), ReminderLike

### Community 73 - "My Tasks Ownership"
Cohesion: 0.33
Nodes (8): loadMyTasks, MyTaskRow, isMyTask(), myAssigneeNames(), myTasks(), OwnershipContext, TaskOwnershipLike, tasksAssignedTo()

### Community 74 - "Reading Plan & Dates"
Cohesion: 0.27
Nodes (9): BASIS_LABEL, BookLike, EstimateBasis, estimatedFinish(), FinishEstimate, ProgressPoint, proyectar(), readingVelocity() (+1 more)

### Community 75 - "Board State Decisions"
Cohesion: 0.27
Nodes (11): D-012 · Un solo estado de tablero en el cliente (BoardShell), D-013 · Orden manual en tasks.position (migración 0021), D-014 · La vista Árbol se absorbe en el Tablero, D-058 · El ✅ completa la tarea y no se salta la máquina de estados, F12 · Móvil se ve como mockup (phone-frame), CSS del Tree View (Fase 4), sin colores nuevos, CSS del Task Drawer (Fase 3), sin colores nuevos, Rediseño del flujo de proyectos (monday.com / ClickUp) (+3 more)

### Community 76 - "Development OS Plans"
Cohesion: 0.20
Nodes (11): todayLocal(getUserTimeZone()) calculado en el servidor (D-016/D-018), habitLogEffect (el puente rutina→hábito), nextCompletedSteps, toggleRoutineStep (Server Action), Bandeja de pendientes y notificaciones capa A, El denominador del scorecard se deriva de days, no de filas, routineRunState (máquina de estados del día), D-087 habit_logs es la única fuente de «¿lo hice hoy?» (+3 more)

### Community 77 - "Intelligence & PDOS Specs"
Cohesion: 0.22
Nodes (11): goalAtRisk, goalProgress, Tabla key_results, keyResultProgress, Resultado clave stale (fuente eliminada), Allowlist de extractores por scope, Inyección de prompt desde datos de terceros, Validación de anclaje por factId (+3 more)

### Community 78 - "Dev Dependencies"
Cohesion: 0.18
Nodes (11): devDependencies, autoprefixer, eslint, eslint-config-next, @eslint/eslintrc, postcss, tailwindcss, @types/node (+3 more)

### Community 79 - "Mandatory Workspaces Migration"
Cohesion: 0.22
Nodes (9): public.guard_personal_workspace_invitation, public.guard_personal_workspace_membership, public.guard_personal_workspace_invitation(), public.guard_personal_workspace_membership(), public.handle_new_user(), public.projects, public.workspaces, trg_guard_personal_workspace_invitation (+1 more)

### Community 80 - "Admin Template Actions"
Cohesion: 0.29
Nodes (9): AdminKindPage(), esKind(), resumir(), AdminRow, TemplateRows(), cambiar(), CatalogRow, templateSummary (+1 more)

### Community 81 - "Cashback Cards"
Cohesion: 0.29
Nodes (8): cardSchema, deleteCashbackCard(), redeemCashback(), upsertCashbackCard(), CardLite, CashbackForm(), DebtLite, RedeemButton()

### Community 82 - "Project & Task Execution Actions"
Cohesion: 0.22
Nodes (9): setTaskStatus(), KanbanBoard(), handleDrop(), WIP_LIMIT, STATUS_META, LABELS, TaskStatusButtons(), TRANSITIONS (+1 more)

### Community 83 - "Board Toolbar Filters"
Cohesion: 0.24
Nodes (8): BoardToolbar(), DATE_BUCKETS, dateLabel(), initials(), sortLabel(), SORTS, DateBucket, SortKey

### Community 84 - "AI Project Planning"
Cohesion: 0.22
Nodes (10): PLAN_BUDGET, buildPrompt(), PLAN_RESPONSE_SCHEMA, PlanGroupSchema, PlanInput, planProject(), PlanResult, PlanSchema (+2 more)

### Community 85 - "Routines & Habits Actions"
Cohesion: 0.35
Nodes (9): routineAdherence(), routineDueToday(), routineFitsBlock(), RoutineHabitLike, routineProgress(), routineRunComplete(), routineRunNeedsWrite(), toggleHabitEffect() (+1 more)

### Community 86 - "Workspace Access Decisions"
Cohesion: 0.22
Nodes (10): D-031 · Todo proyecto vive en un espacio; projects.workspace_id NOT NULL, D-032 · Membresía = acceso; project_shares es la llave del Guest, D-038 · Formato propio de notas en vez de una librería Markdown, sin innerHTML, D-105 (push) · admin.ts se usa también desde una Server Action, D-106 (push) · notifications no tiene política de INSERT, Modelo de amenazas y matriz de controles, Control: RLS por user_id = auth.uid() + GRANT explícito por migración, Control: import "server-only" en admin.ts (service_role no llega al cliente) (+2 more)

### Community 87 - "Money Ledger Migration"
Cohesion: 0.36
Nodes (9): public.check_journal_balance, public.accounts, public.budgets, public.categories, public.check_journal_balance(), public.journal_entries, public.journal_lines, auth.users (+1 more)

### Community 88 - "PWA Icons & Badge"
Cohesion: 0.36
Nodes (10): Apple Touch Icon 180, Push Notification Badge 72, Monochrome Notification Badge Silhouette, PWA App Icon 192, PWA Installability Icon Set, PWA App Icon 512 (any), Life OS Brand Mark (white checkmark on teal), PWA App Icon 512 (maskable) (+2 more)

### Community 89 - "Project Template Fields"
Cohesion: 0.29
Nodes (8): PRIORIDADES, ProjectTemplateFields(), GROUP_COLORS, PlannedGroup, ProjectTemplateCategory, ProjectTemplateGroup, ProjectTemplateTask, TEMPLATE_CATEGORIES

### Community 90 - "AI Settings Domains"
Cohesion: 0.27
Nodes (7): AiSettings(), DOMAINS, ORDEN, DOMAIN_LABEL, clearAiHistory(), clearMemory(), setAiDomains()

### Community 91 - "Planning Time Habits Migration"
Cohesion: 0.36
Nodes (9): public.book_notes, public.books, public.daily_plans, public.habit_logs, public.habits, public.occupations, public.weekly_reviews, auth (+1 more)

### Community 92 - "AI Domain Access Checks"
Cohesion: 0.28
Nodes (9): Verificación: la IA pasa a ver todo por defecto (migración 0048), D-066 · activity es el sexto dominio del motor y no entra en global, D-088 · Hay un chat, y no contradice al spec, D-091 · Sin streaming, y dicho a propósito, D-103 · Ningún hecho de nutrición nombra un alimento, D-108 · La IA ve todo por defecto (migración 0048, invierte a D-088), DEPLOY §1ter · GEMINI_API_KEY, una sola llave para tres funciones de IA, Motor de hechos sin pantalla propia (facts por dominio) (+1 more)

### Community 93 - "Push Verification Checks"
Cohesion: 0.22
Nodes (9): Verificación de notificaciones push (migraciones 0049–0052), pnpm verify — comando único de verificación del owner, D-068 · Las automatizaciones se tipan, no se interpretan, D-100 (push) · Se revierte «no hay ningún proceso que despierte a nadie», D-103 (push) · pg_cron en Supabase y no Vercel Cron, D-104 (push) · La URL y el secreto del reloj viven en Supabase Vault, DEPLOY §1quater · Llaves VAPID y reloj de push, Runbook: no me llegan las notificaciones (7 pasos de fuera hacia dentro) (+1 more)

### Community 94 - "No-SDK Runtime Decisions"
Cohesion: 0.25
Nodes (9): D-008 · Dependencias de runtime mínimas (sin SDKs), D-022 · Resend por fetch, sin SDK, D-101 (push) · El cifrado de Web Push se escribe a mano, sin web-push, D-102 (push) · Se descartó el push sin payload, Borrado en cascada de subtareas vía tasks.parent_task_id ON DELETE CASCADE, Entrega: ProjectMenu y EditProjectForm en /execution, Tree View es 100% aditivo: cero tablas y cero funciones RLS nuevas, @supabase/ssr en vez de @supabase/auth-helpers-* (deprecados) (+1 more)

### Community 95 - "Template Catalog Decisions"
Cohesion: 0.25
Nodes (9): D-044 · (DEROGADA) El catálogo de plantillas vive en código, D-080 · El catálogo se muda a template_catalog y lo edita un administrador (deroga D-044), D-081 · payload jsonb, y no cinco tablas relacionales, D-082 · El rol de administrador es de plataforma y no toca datos de nadie, D-083 · /admin devuelve 404 a quien no es administrador, no un redirect, D-099 · foods es la única tabla sin user_id y su escritura se restringe, DEPLOY §3bis · Nombrar al primer administrador por SQL, Administrador de plataforma: tres controles en profundidad sobre la escritura (+1 more)

### Community 96 - "Routine Scorecard Plans"
Cohesion: 0.22
Nodes (9): routineAdherence, routineDueToday (Fase 1, por frequency), array_length('{}',1) devuelve NULL y un CHECK que evalúa a NULL pasa, Migración 0029_routine_scheduling.sql, occupationAppliesOn, Columna occupations.days (0=domingo … 6=sábado), routine_runs.outcome: Completada / Sin oportunidad / Omitida, Scorecard: cumplimiento, constancia y confirmación (+1 more)

### Community 97 - "Editable Blocks & Cursor"
Cohesion: 0.28
Nodes (9): Cursor { block, item, start, end }, EditableLine.tsx (Task 8), mergeBlocks, NoteDoc.tsx (Tasks 9 y 11), setBlockStyle, textoDeBloque, Autoformato al escribir (`- `, `1. `, `[] `, `# `), EditableLine.tsx (el único contenteditable del proyecto) (+1 more)

### Community 98 - "Format Bar & Input Whitelist"
Cohesion: 0.25
Nodes (9): FormatBar.tsx (Task 10), leerDom, styleOf, Barra de formato anclada sobre el teclado (visualViewport), BlockStyle (el menú «Aa» del iPhone), D-040 (autoguardado sin botón; acciones arriba), FormatBar.tsx (menú «Aa», marcas, listas, tabla, enlace, deshacer), Lista blanca de entrada del contenteditable (+1 more)

### Community 99 - "Note Block Types (Read-Only)"
Cohesion: 0.22
Nodes (9): NoteBody.tsx (Tasks 2–5), SEPARADORA_TABLA / esFilaDeTabla, toggleTodo, La alineación de las tablas se acepta pero no se guarda, Bloque mono (monoespaciado), Bloque table, Bloque todo (casillas), D-038 (nunca HTML ajeno; sin tablas) (+1 more)

### Community 100 - "Icon Generation Script"
Cohesion: 0.31
Nodes (8): chunk(), crc32(), dibujar(), distanciaASegmento(), png(), salidas, TABLA_CRC, VERDE

### Community 101 - "API Routes & Page Entries"
Cohesion: 0.31
Nodes (6): AdminLayout(), profileSchema, toggleTheme(), updateProfile(), SettingsPage(), isPlatformAdmin

### Community 102 - "Development Forms & Actions"
Cohesion: 0.31
Nodes (7): deleteRoutine(), upsertRoutine(), avisoDeBorrado(), FRECUENCIAS, OccupationLite, RoutineFields(), RoutineLite

### Community 103 - "Financial Goals"
Cohesion: 0.33
Nodes (7): deleteFinancialGoal(), goalSchema, upsertFinancialGoal(), AccountLite, FamilyMemberLite, GoalForm(), GoalLite

### Community 104 - "Savings Goals"
Cohesion: 0.39
Nodes (7): contributeToSaving(), deleteSavingsGoal(), goalSchema, upsertSavingsGoal(), ContributeButton(), GoalLite, SavingsGoalForm()

### Community 105 - "Push Endpoints & Workspaces"
Cohesion: 0.33
Nodes (6): completeOnboarding(), onboardingSchema, OnboardingState, initialState, OnboardingForm(), OnboardingPage()

### Community 106 - "RLS Recursion Fix Migration"
Cohesion: 0.33
Nodes (8): public.can_edit_project(), public.has_project_access(), public.is_workspace_member(), public.workspace_role(), public.memberships, public.project_shares, public.projects, public.workspaces

### Community 107 - "Personal Development Migration"
Cohesion: 0.33
Nodes (8): public.key_results, public.personal_goals, public.routine_runs, public.routine_steps, public.routines, auth.users, public.habits, public.occupations

### Community 108 - "Workspace RLS Migration"
Cohesion: 0.44
Nodes (8): public.can_edit_project(), public.has_project_access(), public.is_workspace_member(), public.workspace_role(), public.memberships, public.project_shares, public.projects, public.workspaces

### Community 109 - "Notebooks Migration"
Cohesion: 0.47
Nodes (8): public.can_edit_notebook(), public.has_notebook_access(), public.notebooks, public.notes, public.search_notes(), auth.users, public.memberships, public.workspaces

### Community 110 - "Intelligence Design Notes"
Cohesion: 0.25
Nodes (8): Plan: Personal Development OS — Fase 1 (núcleo), Plan: Rutinas programables y scorecard, Plan: Hábitos dentro de rutinas, Spec: Intelligence OS — motor de recomendaciones, Fact y extractores de hechos deterministas, Spec: Personal Development OS, Spec: Hábitos dentro de rutinas, Spec: Plan de lectura programable

### Community 111 - "Habits In Routines Plan"
Cohesion: 0.29
Nodes (8): Tabla routine_runs, Tabla routine_steps, D-086 Un hábito no existe fuera de una rutina, Migración 0045_habitos_dentro_de_rutinas.sql, routineRunComplete, Todo hábito vive en una rutina, Cola semanal: una fila por (libro, semana), focusBook — tres escalones de urgencia

### Community 112 - "Inline Marks & Block Edits"
Cohesion: 0.32
Nodes (8): applyMark, fusionar (edit.ts), fusionarTexto (markup.ts), hasMark, MarcaInline, sliceInlines, splitBlock, tests/domain/notes-edit.test.ts

### Community 113 - "Runtime Dependencies"
Cohesion: 0.25
Nodes (8): dependencies, clsx, next, react, react-dom, @supabase/ssr, @supabase/supabase-js, zod

### Community 114 - "Cross-cutting Search Migration"
Cohesion: 0.25
Nodes (7): public.notebooks, public.notes, public.search_workspace(), public.comments, public.projects, public.tasks, public.workspace_activity

### Community 115 - "Task Tree Domain"
Cohesion: 0.32
Nodes (5): countDescendantProgress(), countGroupProgress(), isDoneStatus(), ProgressCount, TreeTaskLike

### Community 116 - "Eisenhower Matrix"
Cohesion: 0.33
Nodes (5): ADR-0014, PRIORITY_WEIGHT, SequenceEvidence, SequenceSuggestion, suggestProjectSequence()

### Community 117 - "Invitation Redemption Decisions"
Cohesion: 0.33
Nodes (7): D-019 · El canje de invitación vive en RPC SECURITY DEFINER, D-020 · El token no basta: el correo de la sesión debe coincidir, D-021 · Enviar correo nunca rompe la acción, DEPLOY §1bis · Correo transaccional con Resend (opcional), DEPLOY §3 · Variables de entorno en Vercel (obligatorias vs opcionales), F11 · Una acción falla por secretos ajenos (validación lazy por secreto), Fix: invitar a un workspace no invitaba a nadie

### Community 118 - "Note Parsing & Excerpts"
Cohesion: 0.33
Nodes (7): celdasDeFila, INLINE_PATTERN, noteDisplayTitle, noteExcerpt, parseInline, parseNote, Marcas inline underline (++…++) y strike (~~…~~)

### Community 119 - "Reactions & Reminders Migration"
Cohesion: 0.33
Nodes (6): public.comment_reactions, public.reminders, auth, auth.users, public, public.comments

### Community 120 - "Push Notifications Migration"
Cohesion: 0.38
Nodes (5): public.notification_prefs, public.notifications, public.push_subscriptions, auth, auth.users

### Community 121 - "Middleware CSP Decisions"
Cohesion: 0.53
Nodes (6): Hallazgo: el middleware nunca corría (estaba en la raíz, no en src/), D-002 · CSP con nonce por request en middleware, D-026 · El middleware vive en src/, y eso no es cosmético, F5 · Pantalla en blanco por CSP sin nonce, Runbook: no hay CSP en ninguna respuesta (el middleware no corre), Runbook: pantalla en blanco en producción (CSP)

### Community 122 - "Deploy Rollback Guardrails"
Cohesion: 0.33
Nodes (6): Guardrails aplicados literalmente del prompt de build, DEPLOY §5 · Rollback (Vercel promote; migraciones forward-only), DEPLOY §4 · Smoke test post-deploy, F8 · «Se ve pero no funciona» (guardrail NO-MOCK), Runbook: pérdida de la base de datos y restauración, Guardrail NO-MOCK: ninguna ruta de localStorage del HTML se portó

### Community 123 - "PDOS Design & Plan Links"
Cohesion: 0.47
Nodes (6): loadSourceSnapshot, Privacidad por user_id sin workspace_id (BR-012/019/027), instantiateTemplate y ROUTINE_TEMPLATES, instantiate (blueprint → plan de filas), Sistemas como plantillas instanciables, loadReadingFocus — una sola fuente de verdad

### Community 124 - "Routine Plan Concepts"
Cohesion: 0.33
Nodes (6): Migración 0024_personal_development.sql, Tabla personal_goals, Deriva de esquema entre local y producción, scripts/verificar-backfill-0045.sh, Wishlist y semáforo de asequibilidad, Backfill en cuatro pasos: el primero que reclama un hábito se lo queda

### Community 125 - "Routine Block Fit"
Cohesion: 0.33
Nodes (6): routineFitsBlock (booleano), Tabla routines, BlockFit: cabe / no cabe / indeterminado, Migración 0030_routine_occupation_unique.sql, projectRoutineToOccupation / absorbOccupationIntoRoutine, Proyección bidireccional rutina ↔ bloque horario

### Community 126 - "Note Editor Screen & Saving"
Cohesion: 0.40
Nodes (6): NoteEditor.tsx (Tasks 12–13), saveNote (actions.ts), serializeNote, NoteEditor.tsx (pantalla: guardado, conflicto, roles, deshacer), Pila de deshacer propia (50 entradas, agrupadas por pausa), Tope de 256 KB en el cuerpo de la nota

### Community 127 - "WYSIWYG Editor Design Decisions"
Cohesion: 0.40
Nodes (6): Plan de implementación: editor de notas con formato en vivo, D-008 (cero dependencias de runtime nuevas), Los dos regímenes: el DOM manda al escribir, el modelo manda al formatear, Notas con formato en vivo (WYSIWYG) — diseño, Sin execCommand ni dangerouslySetInnerHTML, Verificación manual en iPhone (docs/CHECKS.md, Contrato de Honestidad)

### Community 128 - "Recommendation States & Dedupe"
Cohesion: 0.33
Nodes (6): context.ts — constructor de contexto, Siete estados de una recomendación, Deduplicación por fingerprint (migración 0023), memory_items — memoria del motor, Catálogo cerrado de acciones propuestas, Seudonimización antes de salir del servidor

### Community 129 - "Development Forms & Actions"
Cohesion: 0.40
Nodes (3): FoodSearchForm(), HabitRow(), RunnerHabit

### Community 130 - "Intelligence Migration"
Cohesion: 0.53
Nodes (5): public.automation_runs, public.automations, public.memory_items, public.recommendations, auth.users

### Community 131 - "Nutrition Migration"
Cohesion: 0.53
Nodes (5): public.body_measurements, public.food_entries, public.foods, public.nutrition_profiles, auth.users

### Community 132 - "Nutrition Domain & Targets"
Cohesion: 0.40
Nodes (5): dia(), OBJETIVOS, PERFIL, racha(), VACIO

### Community 133 - "Vercel Config"
Cohesion: 0.33
Nodes (5): buildCommand, framework, installCommand, regions, $schema

### Community 134 - "Habits In Routines Migration"
Cohesion: 0.40
Nodes (4): public.guard_habit_routine_owner, public.routines, public.guard_habit_routine_owner(), trg_guard_habit_routine_owner

### Community 135 - "Atomic Habits Migration"
Cohesion: 0.40
Nodes (4): public.guard_habit_stack_owner, public.guard_habit_stack_owner(), public.habits, trg_guard_habit_stack_owner

### Community 136 - "Backfill Verification Script"
Cohesion: 0.60
Nodes (3): correr(), correr_atomico(), verificar-backfill-0046.sh script

### Community 137 - "Identity Migration"
Cohesion: 0.50
Nodes (3): public.consents, public.profiles, auth.users

### Community 138 - "Groups & Folders Migration"
Cohesion: 0.40
Nodes (4): public.folders, public.task_groups, public.projects, public.workspaces

### Community 139 - "Admin Catalog Migration"
Cohesion: 0.40
Nodes (4): public.is_admin(), public.template_catalog, auth.users, public.profiles

### Community 140 - "Node & CVE Version Pins"
Cohesion: 0.67
Nodes (4): Node 24.19.0 pinned in CI, .nvmrc and engines, CVE-2025-66478 «React2Shell» (RCE crítico, CVSS 10.0), EOL de Next 15.x (Maintenance LTS hasta 21-oct-2026), Pin de next 15.5.23 (hotfix de seguridad same-major)

### Community 141 - "Action Result Convention"
Cohesion: 0.50
Nodes (4): Las acciones devuelven { ok, reason } en vez de lanzar, Fallar suave: nunca lanzar, devolver { ok, reason }, Integraciones externas escalonadas, Tokens de terceros en Supabase Vault

### Community 142 - "ESLint Config"
Cohesion: 0.50
Nodes (3): compat, eslintConfig, @eslint/eslintrc

### Community 143 - "Fortnightly Budget Migration"
Cohesion: 0.50
Nodes (3): public.budgets, public.budget_carryovers, auth.users

### Community 145 - "VAPID Key Generator"
Cohesion: 0.50
Nodes (3): mensaje, publicB64, raw

### Community 146 - "Household Migration"
Cohesion: 0.50
Nodes (3): public.family_members, auth.users, public.journal_entries

### Community 147 - "Structural RLS Fix Migration"
Cohesion: 0.50
Nodes (3): public.list_workspace_members(), public.memberships, public.workspaces

### Community 148 - "Task Files Migration"
Cohesion: 0.50
Nodes (3): public.task_files, auth.users, public.tasks

### Community 149 - "Mentions Identity Migration"
Cohesion: 0.50
Nodes (3): public.comment_reads, auth.users, public.comments

### Community 150 - "Nutrition Failure Checks"
Cohesion: 0.67
Nodes (3): Verificación: /development/nutrition devolvía 500 y ninguna herramienta lo vio, Verificación: primera llamada real al modelo en producción, D-106 · Una cadena vacía no es un valor de enum; el esquema se revisa

### Community 151 - "Budget Table Decisions"
Cohesion: 0.67
Nodes (3): D-003 · El presupuesto tabular reutiliza la tabla budgets, D-009 · quincenal_income vive en profiles, no en budgets, D-010 · La conciliación reutiliza accountBalance

### Community 152 - "Timezone & Occupation Decisions"
Cohesion: 0.67
Nodes (3): D-016 · «Hoy» se calcula con profiles.timezone, nunca con el reloj del servidor, D-029 · occupations.days usa 0=domingo, no ISO-8601, Fix: la app usaba el reloj del servidor, no el del usuario

## Ambiguous Edges - Review These
- `Deriva de esquema entre local y producción` → `scripts/verificar-backfill-0045.sh`  [AMBIGUOUS]
  docs/superpowers/plans/2026-09-01-habitos-dentro-de-rutinas.md · relation: conceptually_related_to
- `Step: Verify critical dotfiles are committed` → `F13 · Seed no idempotente deja datos a medias`  [AMBIGUOUS]
  .github/workflows/ci.yml · relation: references
- `Life OS Brand Mark (white checkmark on teal)` → `Push Notification Badge 72`  [AMBIGUOUS]
  public/icons/badge-72.png · relation: conceptually_related_to
- `DEPLOY §1ter · GEMINI_API_KEY, una sola llave para tres funciones de IA` → `D-108 · La IA ve todo por defecto (migración 0048, invierte a D-088)`  [AMBIGUOUS]
  docs/DEPLOY.md · relation: conceptually_related_to
- `D-108 · La IA ve todo por defecto (migración 0048, invierte a D-088)` → `Privacidad de Intelligence OS: solo hechos calculados y con alias`  [AMBIGUOUS]
  README.md · relation: conceptually_related_to

## Knowledge Gaps
- **485 isolated node(s):** `ActivityInput`, `WorkspaceRole`, `GoalLite`, `KeyResultLite`, `SourceOption` (+480 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 766 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **39 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Deriva de esquema entre local y producción` and `scripts/verificar-backfill-0045.sh`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Step: Verify critical dotfiles are committed` and `F13 · Seed no idempotente deja datos a medias`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Life OS Brand Mark (white checkmark on teal)` and `Push Notification Badge 72`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `DEPLOY §1ter · GEMINI_API_KEY, una sola llave para tres funciones de IA` and `D-108 · La IA ve todo por defecto (migración 0048, invierte a D-088)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `D-108 · La IA ve todo por defecto (migración 0048, invierte a D-088)` and `Privacidad de Intelligence OS: solo hechos calculados y con alias`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `react` connect `Board Popovers & Menus` to `Icon Set`, `Development Forms & Actions`, `Notebook Actions & Errors`, `Time Slots & Occupations`, `API Routes & Page Entries`, `Insights Memory & States`, `API Routes & Page Entries`, `Automations UI & Actions`, `Board Popovers & Menus`, `AI Plan Panel`, `Task Detail Panel`, `Board Types & Sequencing`, `Workspace Team & Email`, `API Routes & Page Entries`, `Task & Project Threads`, `Development Forms & Actions`, `Reading Plan & Dates`, `Eisenhower Matrix`, `Logbook & Knowledge Cards`, `Book Lookup & Covers`, `Routines & Habits Actions`, `Kanban Table Timeline Views`, `Task File Attachments`, `Command Palette Search`, `Routine Template Fields`, `Debt Simulator`, `Budget Lines & Carryover`, `AI Project Planning`, `Task & Project Threads`, `Monday Board Drag & Drop`, `Push Subscription Client`, `Logbook & Knowledge Cards`, `Mentions & Comments UI`, `Package Manifest`, `Routine Template Fields`, `Development Forms & Actions`, `Money Accounts & Transactions`, `Daily Plan & Closeout`, `Invite Acceptance Flow`, `Investments`, `Reminders Dispatch`, `My Tasks Ownership`, `Admin Template Actions`, `Cashback Cards`, `Project & Task Execution Actions`, `Board Toolbar Filters`, `AI Settings Domains`, `Development Forms & Actions`, `Financial Goals`, `Savings Goals`, `Push Endpoints & Workspaces`?**
  _High betweenness centrality (0.162) - this node is a cross-community bridge._
- **Why does `getSessionUser` connect `API Routes & Page Entries` to `Time Slots & Occupations`, `Notebook Actions & Errors`, `API Routes & Page Entries`, `Food Lookup Integration`, `Insights Memory & States`, `AI Chat Engine & Schemas`, `Nutrition Domain & Targets`, `Monday Board Drag & Drop`, `API Routes & Page Entries`, `Automations UI & Actions`, `Board Popovers & Menus`, `Book Lookup & Covers`, `Board Types & Sequencing`, `Workspace Team & Email`, `API Routes & Page Entries`, `Task & Project Threads`, `Reading Plan & Dates`, `Logbook & Knowledge Cards`, `Book Lookup & Covers`, `Routines & Habits Actions`, `Routine Template Fields`, `Personal Goals Snapshot`, `AI Project Planning`, `Task & Project Threads`, `Push Subscription Client`, `Routine Template Fields`, `Development Forms & Actions`, `Home, Money & Reports Pages`, `Admin Template Actions`, `Reminders Dispatch`, `AI Settings Domains`, `API Routes & Page Entries`, `Push Endpoints & Workspaces`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._