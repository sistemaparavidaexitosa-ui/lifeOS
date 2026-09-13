# Universal Life Graph — architecture migration plan

## Executive conclusion

LifeOS should **extend, not replace**, its existing graph architecture. The repository already implements the correct foundational shape: domain tables remain the transactional source of truth; `graph_nodes` and `graph_edges` are a governed materialized projection. Migrations 0054–0059 have delivered the graph core, registry, declarative system edges, and centralized graph-visibility predicate.

The migration is therefore a controlled expansion from 14 projected domain sources to the rest of the public domain model, followed by consolidation of search and AI retrieval onto the same registry. A wholesale “everything in JSONB nodes” rewrite would discard financial integrity, relational constraints, domain-specific queries, and the current privacy boundary.

**Repository baseline reviewed:** `fda190f5d6b975eba872d1b44e209ffd19e9f20a` (12 Sep 2026). The inventory below is based on the generated public-schema types and migrations 0002–0059. It describes the **final schema**, not tables later dropped (`milestones`, `routine_steps`).

## Target architecture

```
Domain source of truth                    Universal Life Graph projection
─────────────────────                     ───────────────────────────────
Identity / workspaces / life domains  ──►  graph_sources (what is a node)
Specialized transactional tables      ──►  graph_nodes (identity, scope, summary)
Existing FK/arrays/bridges            ──►  graph_edge_rules (what is an edge)
                                          graph_edges (materialized relations)
Interaction/UI state                  ──►  graph_layouts, notifications, audit

Consumers: graph UI | cross-domain search | AI context | impact | suggestions | analytics
```

### Non-negotiable design rules

1. **Projection, not replacement.** Every business write continues to land in its normalized domain table. Graph rows are trigger-maintained read/relationship projections.
2. **Two scopes only.** A `user` node has `user_id` and no workspace/project; a `workspace` node has `workspace_id` and may have `project_id`. Do not introduce hybrid rows.
3. **Audience-safe edges.** Keep `graph_misma_audiencia` and the edge-tenant trigger as the sole rule for cross-node visibility. A user-private financial or health node must never become visible through a shared project.
4. **Registry-first expansion.** Add each source through `graph_sources` and each derived domain relation through `graph_edge_rules`; do not add bespoke trigger/function logic unless the source’s tenancy cannot be expressed by the registered projector contract.
5. **Metadata is a white list.** Project only display, routing, retrieval, and analytic fields. Never duplicate credentials, account identifiers, full journal payloads, private note bodies, or detailed health data into graph metadata.
6. **System and user edges differ.** FK/array/bridge-derived edges use `origin = system`; people add `origin = user`; approved AI proposals use `origin = ai`. Never let AI write direct edges without the proposal/approval path.

## Current graph baseline

| Layer | Present capability | Status |
|---|---|---|
| Vocabulary | `graph_node_types`, `graph_rel_types` with semantics such as dependency/reversed/symmetric | live |
| Projection core | `graph_nodes`, `graph_edges`, `graph_layouts` | live |
| Source registry | `graph_sources`: 14 declared sources; trigger/install/backfill/drift checks | live |
| Edge registry | `graph_edge_rules`: 11 declared system relations; generated edge functions and drift checks | live |
| Authorization | tenant shape checks, RLS, audience matching, centralized `graph_nodo_visible` | live |
| Traversal | subgraph, impact, all-nodes, edge retrieval, search RPCs | live |
| Unified vocabulary in client | SQL catalog still duplicated in TypeScript/UI constants | pending |
| Cross-domain coverage | money, time, knowledge, household and health mostly absent | pending |
| Retrieval / semantic preparation | no canonical `search_text`, `content_hash`, context RPC, or embeddings | pending |

The current 14 sources are: `workspaces`, `projects`, `memberships`, `tasks`, `notes`, `task_files`, decision-only `logbook`, `personal_goals`, `habits`, `routines`, `books`, `investments`, `budgets`, and `assets`.

## Complete entity-to-graph mapping

### Mapping legend

- **Node now** — registered projection source today.
- **Node next** — add a graph source and node type (or reuse an existing type) in the coverage phase.
- **Edge/event/support** — remain relational/event records; create system edges only where the indicated relationship has navigation, impact, retrieval, or recommendation value.
- **Keep outside graph** — infrastructure, authorization, audit, preference, or device data; expose only through tightly scoped operational views if needed.

| Domain | Existing entity/table | Future graph role | Proposed node type / relation treatment | Scope and migration note |
|---|---|---|---|---|
| Identity | `profiles` | Keep outside graph | actor profile; resolve `auth.users` only as identity | user-private; PK is `user_id`, so it cannot enter current source registry without a deliberate adapter. Do not project profile preferences. |
| Identity | `consents` | Keep outside graph | compliance event, no node | user-private; retain immutable consent history. |
| Collaboration | `workspaces` | Node now | `workspace` | workspace; root/container node. |
| Collaboration | `memberships` | Node now | `person`; `member_of`/`belongs_to` edge should be added only if it remains audience-safe | workspace; current node label is membership/user name. Preserve one node per workspace membership rather than globally merging people. |
| Collaboration | `invitations` | Edge/event/support | invitation lifecycle event | workspace; not a durable life entity until accepted. |
| Collaboration | `project_shares` | Edge/support | authorization entitlement, not a semantic relation | workspace; never publish it as a general graph edge because it is permission data. |
| Execution | `projects` | Node now | `project`; system `belongs_to workspace`, `depends_on project` | workspace; project scope is important for Guest access. |
| Execution | `tasks` | Node now | `task`; `belongs_to project`, `child_of task`, `depends_on task`, `assigned_to person` | workspace/project; retain existing high-write optimized projector. |
| Execution | `task_groups` | Node next | `task_group` (new) or non-node structural container | workspace/project; add only if board/folder navigation needs graph visibility. Parent/group relation should be `contains`, not dependency. |
| Execution | `folders` | Node next | `folder` (new) | workspace; add `contains`/`belongs_to` relations to projects or task groups only after validating its ownership path. |
| Execution | `task_files` | Node now | `document`; `belongs_to task` | workspace/project; preserve storage pointer only in source table, not graph metadata. |
| Execution | `task_assignees` | Edge/support | existing `assigned_to` system edge | bridge table; no node. |
| Execution | `task_history` | Edge/event/support | task activity/event timeline | workspace/project; do not make every status transition a node. |
| Execution | `comments` | Node next (selectively) | `comment`/`discussion` only if graph conversation context is a product requirement | tenant derives from subject; otherwise retain as activity linked from task/project/note views. |
| Execution | `comment_reads` | Keep outside graph | read receipt | composite-key interaction state. |
| Execution | `comment_reactions` | Keep outside graph | reaction | composite-key interaction state. |
| Execution | `workspace_activity` | Edge/event/support | activity event | workspace; useful in timelines/search, not as durable node by default. |
| Execution | `logbook` | Node now, filtered | `decision` where `type = decision` | user-private; expand only to explicitly valuable event types, never all entries by default. |
| Execution | `knowledge_items` | Node next | `knowledge_item` or reuse `document` | user-private; strong M5 candidate. Project/source links become `references`/`supports`. |
| Planning | `daily_plans` | Node next | `plan` (new) | user-private; connect to date/time context and planned tasks/habits only when a durable plan is meaningful. |
| Planning | `weekly_reviews` | Node next | `review` (new) | user-private; summary/reflection node, links to reviewed goals, habits, plans. |
| Time | `occupations` | Node next | `time_block`/`occupation` (new) | user-private; use temporal attributes, and edges only to explicitly linked task/project/habit. Avoid graphing every calendar occurrence if volume is high. |
| Habits | `habits` | Node now | `habit`; `belongs_to routine`, `depends_on habit` | user-private; retain meal metadata as minimal display metadata only. |
| Habits | `habit_logs` | Edge/event/support | completion observation | user-private; aggregate into measures/insights, not one node per log. |
| Development | `personal_goals` | Node now | `goal` | user-private; `key_results` supplies support edges. |
| Development | `key_results` | Edge/support | existing `supports` edge from source to goal | user-private; do not force a node unless key-result-level navigation/analytics is required. Preserve polymorphic source resolution. |
| Development | `routines` | Node now | `routine` | user-private. |
| Development | `routine_runs` | Edge/event/support | routine execution observation | user-private; aggregate, no run nodes by default. |
| Library | `books` | Node now | `book` | user-private; current source. |
| Library | `book_notes` | Node next | `annotation`/`note` (new or reuse `note`) | user-private; add `annotates book` only if notes need graph discovery. |
| Library | `book_progress` | Edge/event/support | progress observation | user-private; retain source-table history/metrics. |
| Library | `reading_plan_weeks` | Edge/support | schedule segment | user-private; edge or plan metadata rather than node unless displayed independently. |
| Knowledge | `notebooks` | Node next | `notebook` (new) | workspace; needed to make `notes -> notebook -> workspace` explicit and to remove today’s skipped semantic layer. |
| Knowledge | `notes` | Node now | `note`; current `belongs_to workspace` is a lookup shortcut | workspace; after `notebook` is projected, migrate relation to `note belongs_to notebook`, and `notebook belongs_to workspace`; maintain compatibility during backfill. |
| Intelligence | `recommendations` | Node next (accepted only) | `recommendation`/`suggestion` (new) | user-private; pending/declined recommendations remain workflow records, not graph facts. |
| Intelligence | `memory_items` | Node next | `memory` (new) | user-private; high-value retrieval source. Require sensitivity classification and opt-in exposure to AI context. |
| Intelligence | `automations` | Node next | `automation` (new) | user-private; link to affected entities with `acts_on`/`triggers`, never serialize executable secrets/config into metadata. |
| Intelligence | `automation_runs` | Edge/event/support | execution event | user-private; event timeline and operational audit only. |
| Intelligence | `ai_chat_messages` | Node next (conversation aggregate) | use existing `ai_conversation`, not one node per message | tenant must be derived from conversation/context; messages remain event/content records. |
| Coaching | `coach_proposals` | Edge/event/support | proposal with accepted relation promoted to `origin=ai` edge | user-private; a proposal is not fact until accepted. |
| Finance | `accounts` | Node next | `financial_account` (new) | user-private; metadata excludes balances/account numbers; link journal lines only through aggregated/allowed relations. |
| Finance | `categories` | Keep outside graph initially | taxonomy/value object | user-private; use as metadata/tag vocabulary; promote only if users navigate category networks. |
| Finance | `journal_entries` | Edge/event/support | financial transaction/event | user-private; retain double-entry integrity; do not project transaction-level nodes initially. |
| Finance | `journal_lines` | Edge/support | accounting line | user-private; never replace with graph edges; optional aggregated `affects` edges only later. |
| Finance | `budgets` | Node now | `budget` | user-private; current node. Amounts are sensitive—use minimal/derived metadata in consumer-specific views. |
| Finance | `budget_carryovers` | Edge/event/support | period continuity | user-private; represent as derived budget timeline, not a standalone node. |
| Finance | `debts` | Node next | `debt`/`liability` (new) | user-private; add to M5 with `associated_with account/goal` only where explicit FK exists. |
| Finance | `cashback_cards` | Node next | `payment_card` (new) | user-private; do not expose card identifiers. |
| Finance | `cashback_redemptions` | Edge/event/support | redemption event | user-private; edges from card to reward/transaction only if domain has stable references. |
| Finance | `savings_goals` | Node next | `savings_goal` (new) or `goal` with a finance facet | user-private; recommend a distinct type to preserve financial semantics. |
| Finance | `financial_goals` | Node next | `financial_goal` (new) | user-private; may `supports` a broader personal goal only when explicitly linked. |
| Finance | `investments` | Node now | `investment` | user-private; current node. Exclude account IDs and detailed valuations from general graph metadata. |
| Finance | `assets` | Node now | `asset` | user-private; current node. |
| Finance | `liabilities` | Node next | `liability` (new) | user-private; distinct from debt if the product preserves both concepts; otherwise establish a canonical taxonomy before projection. |
| Finance | `net_worth_snapshots` | Edge/event/support | derived measure/snapshot | user-private; an analytic time series, not a semantic node. |
| Household | `family_members` | Node next | `person` with `person_kind=family` or `family_member` | user-private; do **not** merge it with workspace `memberships` automatically. A person resolution layer needs explicit consent/identity matching. |
| Health | `nutrition_profiles` | Keep outside graph | private health preference/profile | PK is `user_id`; sensitive. Expose only summarized, opt-in context. |
| Health | `body_measurements` | Edge/event/support | health measurement observation | user-private/sensitive; trend analytics, not per-reading nodes. |
| Health | `foods` | Node next (catalog) | `food` (new) | shared/reference catalog; no user-private scope. Requires a third, catalog/reference audience model or a separate non-tenant catalog policy—do not force into the current two-scope invariant unchanged. |
| Health | `food_entries` | Edge/event/support | meal/nutrition event | user-private/sensitive; optional aggregate `consumes food` relation only with product and privacy approval. |
| Notifications | `reminders` | Node next (optional) | `reminder` (new) | user-private/workspace-derived; graph only if it can be attached to a node. Otherwise it is delivery scheduling. |
| Notifications | `notifications` | Keep outside graph | delivered notification | event/delivery record. |
| Notifications | `notification_prefs` | Keep outside graph | preference | user-private; PK is `user_id`. |
| Notifications | `push_subscriptions` | Keep outside graph | device endpoint | device/security data; never project. |
| Templates | `template_catalog` | Node next (catalog) | `template` (new) | global/admin catalog. As with `foods`, model as reference/catalog data rather than a user/workspace node until scope is extended safely. |
| Audit | `audit_log` | Keep outside graph | immutable audit event | operational/compliance record; search through controlled admin tooling, not graph traversal. |
| Graph core | `graph_node_types` | Graph catalog | authoritative node vocabulary | global catalog, read-only to app users. |
| Graph core | `graph_rel_types` | Graph catalog | authoritative relation vocabulary | global catalog, read-only to app users. |
| Graph core | `graph_sources` | Graph registry | declarative source mapping | global catalog; sole onboarding contract for projectable tables. |
| Graph core | `graph_edge_rules` | Graph registry | declarative system-edge mapping | global catalog; sole onboarding contract for derived relationships. |
| Graph core | `graph_nodes` | Projection store | universal node index | not a source of truth. |
| Graph core | `graph_edges` | Projection store | universal relationship index | not a source of truth. |
| Graph core | `graph_layouts` | User view state | per-user, per-view layout | presentation state, not domain relation. |

## Key normalization decisions before expanding coverage

1. **People are not yet one global entity.** `memberships` are workspace-scoped collaborators; `family_members` are private contacts. Treat both as distinct source identities until an explicit, consented `person_identity_links` model exists. Do not join by name/email heuristics.
2. **Reference catalogs require a safe third audience.** `foods` and `template_catalog` are neither user-private nor workspace-owned. Keep them outside `graph_nodes` until a `reference`/`catalog` scope is designed with separate RLS, or represent them in a catalog-only graph that cannot bridge into private/workspace graphs.
3. **Events should not inflate the graph.** logs, history, runs, reactions, deliveries, transactions, measurements, and snapshots feed timeline/analytics projections; they do not become a node per row.
4. **Finance preserves double-entry modeling.** `journal_entries` and `journal_lines` remain authoritative. The graph may expose summarized relationships, but never replaces ledger controls or turns journal lines into mutable edges.
5. **Health and AI retrieval are opt-in.** Nutrition, body metrics, and memory need classification plus a purpose/consent gate before adding their text to retrieval fields.

## Migration plan

### Phase 0 — establish the migration contract (no product behavior change)

- Freeze the current baseline with `graph_registry_diff()`, `graph_registry_deriva()`, `graph_edges_deriva()`, and `graph_check_integrity()` in CI and before/after every deployment.
- Produce row counts by source and edge rule; capture traversal latency and trigger-write overhead for `tasks`, `projects`, `notes`, and `habits`.
- Publish a data-classification matrix: public catalog, workspace-shared, user-private, sensitive health, financial confidential, operational/security. The registry cannot be expanded before each source has one classification.
- Add an Architecture Decision Record for the two open choices: catalog/reference scope and person identity resolution.

**Exit:** zero structural/data drift; measured baseline; security owner approves classifications.

### Phase 1 — finish universal vocabulary and routing (M4)

- Make `graph_node_types` and `graph_rel_types` the generated client catalog; delete TypeScript/UI copies of type unions, colors, dependency semantics, and native/projected status.
- Add `route_template` and user-visible display metadata to `graph_sources`, so node inspection, search deep-links, and “show in graph” use one source of truth.
- Add tests that generated client artifacts exactly reflect the SQL catalog and that each registered source resolves to an authorized route.

**Exit:** no duplicated graph semantics in client code; every current source has a route.

### Phase 2 — expand low-risk, high-value private coverage (M5a)

Onboard `debts`, `savings_goals`, `financial_goals`, `accounts`, `liabilities`, `occupations`, `daily_plans`, `weekly_reviews`, `knowledge_items`, `memory_items`, and `family_members`. Add the corresponding node types and only relationships backed by stable keys.

- Start each source disabled, validate registry schema/tenancy/labels, install its static triggers during deployment, backfill in bounded batches, then enable.
- Use minimal metadata: status, category, date, display value buckets, and safe labels. Do not copy raw memory, balance, health, or account data.
- Add per-source RLS tests proving a workspace member and Guest cannot discover private nodes through nodes, edges, search, or traversal RPCs.

**Exit:** registry and projection drift are zero; p95 write latency stays within agreed budget; privacy test suite passes for each source.

### Phase 3 — make structural context explicit (M5b)

Onboard `notebooks`, then alter the semantic path from `notes → workspace` to `notes → notebook → workspace` while preserving old traversal results during the transition. Evaluate `folders` and `task_groups` as navigation containers; add them only if graph consumers use them.

- Version edge rules: create the new edges, verify them, migrate UI reads, then retire the shortcut edge only after historical and access checks pass.
- Preserve the existing `notes` source projection; this is a relation migration, not a note-data migration.

**Exit:** no inaccessible or duplicated note nodes; note traversal and Guest restrictions stay correct.

### Phase 4 — intelligence, recommendations, and automation (M5c)

- Add `automations`, `recommendations` (accepted/active only), and aggregate AI conversations; keep runs/messages/proposals as events.
- Implement accepted coach/AI proposal promotion to `origin=ai` edges, recording approval actor/time and confidence.
- Do not materialize conversational message bodies in `graph_nodes`.

**Exit:** AI-generated relationships are traceable, reversible, and never published before explicit approval.

### Phase 5 — unify retrieval and controlled search (M6)

- Extend source registry with `search_fields`, sensitivity classification, AI eligibility, retention/deletion policy, and a content-redaction policy.
- Add `graph_nodes.search_text` and `content_hash`; maintain them in the same projector transaction. `search_text` is plain normalized text, not another duplicate tsvector.
- Implement `graph_context()` as the only retrieval surface for AI, enforcing user consent, source eligibility, audience visibility, field redaction, and token/node budgets.
- Refactor `TABLAS_CONSULTABLES` and cross-workspace search to read the graph registry rather than hard-coded table lists; retain specialized financial and audit query paths where necessary.

**Exit:** one auditable source inventory powers graph, search, and AI; tests demonstrate no sensitive/unauthorized content enters context.

### Phase 6 — graph analytics and recommendations (M7)

- Add read-only analytics (`degree`, components, orphan detection, bottlenecks) over materialized nodes/edges, segmented strictly by valid audience.
- Build deterministic recommendation detectors from registry metadata and edge rules. Emit proposals first; promote only accepted ones.
- Define graph health dashboards: coverage, drift, orphan rate, invalid edges, backfill age, and per-source trigger cost.

**Exit:** analytics is useful without becoming a new source of truth or bypassing RLS.

### Phase 7 — semantic embeddings, only after a product/privacy decision (M8)

- Do not ship by default. If approved, use `graph_node_embeddings(node_id, model, embedding, content_hash)` with an external asynchronous worker.
- Embed only `AI-eligible` sources after redaction and consent filtering; reprocess only changed hashes; document vendor/data egress, deletion, model version, and re-embedding policy.

**Exit:** explicit product approval, data-processing assessment, and deletion/revocation behavior are tested.

## Rollout and safety mechanics

For every newly registered source:

1. Define node type, scope, label, route, metadata/search white lists, sensitivity, and projector/tenant path.
2. Validate the source contract: a single UUID `id` primary key is required by the present registry. Build an adapter or consciously leave composite/`user_id`-keyed records outside the projection; do not weaken the constraint casually.
3. Declare only stable, meaningful system edges in `graph_edge_rules`; validate source/target audience compatibility.
4. Deploy schema/catalog and static trigger definitions with a short `lock_timeout`; avoid re-creating unrelated existing triggers.
5. Backfill one source at a time in batches. The current backfill deliberately updates the label to fire the same projector, so it can cause MVCC/derived-index churn; schedule large sources off peak.
6. Compare registry, node, and edge drift; run owner/member/Guest/outsider RLS tests plus delete/move/reclassification scenarios.
7. Enable consumer use behind a feature flag. Monitor counts, errors, traversal truncation, and latency before widening the rollout.
8. Roll back by disabling the source and consumer flag first. Retain domain data; remove only projection rows once the source is no longer queried.

## Acceptance criteria

- Every public domain table is classified in the inventory above, with no uncategorized entity.
- Every projected source has exactly one registry row, validated static triggers, a route, a data classification, an owner path, and a drift test.
- Every system edge has one declarative rule and is derivable/reconcilable; no silent hand-maintained duplicate relation logic remains.
- No graph traversal, search, AI context, or analytics query crosses from a private node into an audience-incompatible workspace/project node.
- Ledger, consent, audit, device, and health-sensitive source tables retain their domain-specific controls and are not degraded into generic graph JSON.
- Backfills are restartable, bounded, observable, and do not block normal writes beyond the agreed operational budget.

## Sources examined

- `supabase/migrations/0002_identity.sql` through `0059_un_solo_predicado_de_permiso.sql`
- `src/types/database.types.ts` (final generated public-schema inventory)
- `docs/UNIVERSAL_GRAPH_ROADMAP.md`, `docs/SECURITY.md`, `docs/DECISIONS.md`, and `docs/TRACEABILITY.md`

