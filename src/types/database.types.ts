// ⚠️ STUB ESCRITO A MANO — NO generado con `supabase gen types typescript --linked`.
//
// F3 🔴: prohibido entregar esto como ESTADO FINAL. El check correspondiente
// en /docs/CHECKS.md está marcado explícitamente como
// "⚠️ NO EJECUTADO en el entorno del asistente" (sin CLI de Supabase ni
// proyecto real disponibles aquí).
//
// Antes del primer deploy real, el owner DEBE correr:
//   supabase link --project-ref <tu-proyecto>
//   pnpm gen:types
// para reemplazar este archivo por el generado real, que reflejará con
// exactitud las tablas de /supabase/migrations/*.sql.
//
// Rev. fix 2 (post primer `next build` real y en verde en CI): se eliminó
// la interfaz `Relationship` (singular), que quedó definida pero sin usarse
// directamente en ningún tipo (cada tabla declara su array de relaciones
// inline) — causaba el warning de ESLint
// "'Relationship' is defined but never used." Se retiró como código muerto;
// no cambia ningún comportamiento ni tipo expuesto.
//
// Rev. fix (post primera corrida real de `tsc` en CI): se agregó el arreglo
// `Relationships` con las FKs reales del esquema en las tablas que participan
// en un `.select("*, tabla_hija(*)")` en la app (journal_lines, tasks), y se
// completó para el resto de tablas por consistencia/robustez futura.
// @supabase/postgrest-js usa este array para resolver el tipo de un embed
// anidado; sin él, cualquier select anidado se tipa como
// `SelectQueryError<"could not find the relation...">` en vez de un array
// real, rompiendo `.map()`/`.reduce()` sobre esa relación (bug real
// detectado en CI, no hipotético).
//
// También se agregó `list_workspace_members` a `Functions` (RPC creado en
// supabase/migrations/0012_fix_rls_recursion_structural.sql para restaurar
// el roster completo de un workspace tras el fix de recursión de RLS).
//
// Este stub SÍ satisface la forma `GenericSchema` de @supabase/supabase-js
// (Tables/Views/Functions/Enums/CompositeTypes con Row/Insert/Update), para
// que el resto del código compile contra un contrato razonable mientras
// tanto — no es un `any` disfrazado.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamptz = string;
type DateStr = string;

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          user_id: string;
          name: string;
          currency: string;
          timezone: string;
          locale: string;
          cycle: string;
          onboarded: boolean;
          activity_window_start: string;
          activity_window_end: string;
          theme: string;
          created_at: Timestamptz;
          updated_at: Timestamptz;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { user_id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      consents: {
        Row: { id: string; user_id: string; purpose: string; version: string; status: string; ts: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["consents"]["Row"]> & { user_id: string; purpose: string; status: string };
        Update: Partial<Database["public"]["Tables"]["consents"]["Row"]>;
        Relationships: [];
      };
      workspaces: {
        Row: { id: string; owner_id: string; name: string; color: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["workspaces"]["Row"]> & { owner_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["workspaces"]["Row"]>;
        Relationships: [];
      };
      memberships: {
        Row: { id: string; workspace_id: string; user_id: string; user_name: string; role: string; status: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["memberships"]["Row"]> & { workspace_id: string; user_id: string; user_name: string; role: string };
        Update: Partial<Database["public"]["Tables"]["memberships"]["Row"]>;
        Relationships: [
          { foreignKeyName: "memberships_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] }
        ];
      };
      invitations: {
        Row: { id: string; workspace_id: string; email: string; role: string; token: string; status: string; expires_at: Timestamptz; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["invitations"]["Row"]> & { workspace_id: string; email: string };
        Update: Partial<Database["public"]["Tables"]["invitations"]["Row"]>;
        Relationships: [
          { foreignKeyName: "invitations_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] }
        ];
      };
      projects: {
        Row: {
          id: string;
          owner_id: string;
          workspace_id: string | null;
          title: string;
          objective: string;
          description: string;
          status: string;
          priority: string;
          target_date: DateStr | null;
          area: string;
          owner_name: string;
          tags: string[];
          results: string;
          risks: string;
          dependencies: string;
          resources: string;
          notes: string;
          version: number;
          created_at: Timestamptz;
        };
        Insert: Partial<Database["public"]["Tables"]["projects"]["Row"]> & { owner_id: string; title: string };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [
          { foreignKeyName: "projects_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] }
        ];
      };
      milestones: {
        Row: { id: string; project_id: string; title: string; done: boolean; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["milestones"]["Row"]> & { project_id: string; title: string };
        Update: Partial<Database["public"]["Tables"]["milestones"]["Row"]>;
        Relationships: [
          { foreignKeyName: "milestones_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ];
      };
      project_shares: {
        Row: { id: string; project_id: string; workspace_id: string; access_level: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["project_shares"]["Row"]> & { project_id: string; workspace_id: string };
        Update: Partial<Database["public"]["Tables"]["project_shares"]["Row"]>;
        Relationships: [
          { foreignKeyName: "project_shares_project_id_fkey"; columns: ["project_id"]; isOneToOne: true; referencedRelation: "projects"; referencedColumns: ["id"] },
          { foreignKeyName: "project_shares_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] }
        ];
      };
      tasks: {
        Row: {
          id: string;
          project_id: string;
          title: string;
          status: string;
          priority: string;
          urgent: boolean;
          due: DateStr | null;
          est: number;
          deps: string[];
          impact: boolean;
          completed_at: Timestamptz | null;
          version: number;
          created_at: Timestamptz;
        };
        Insert: Partial<Database["public"]["Tables"]["tasks"]["Row"]> & { project_id: string; title: string };
        Update: Partial<Database["public"]["Tables"]["tasks"]["Row"]>;
        Relationships: [
          { foreignKeyName: "tasks_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ];
      };
      task_history: {
        Row: { id: string; task_id: string; from_state: string | null; to_state: string; ts: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["task_history"]["Row"]> & { task_id: string; to_state: string };
        Update: Partial<Database["public"]["Tables"]["task_history"]["Row"]>;
        Relationships: [
          { foreignKeyName: "task_history_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] }
        ];
      };
      task_assignees: {
        Row: { task_id: string; user_name: string };
        Insert: Database["public"]["Tables"]["task_assignees"]["Row"];
        Update: Partial<Database["public"]["Tables"]["task_assignees"]["Row"]>;
        Relationships: [
          { foreignKeyName: "task_assignees_task_id_fkey"; columns: ["task_id"]; isOneToOne: false; referencedRelation: "tasks"; referencedColumns: ["id"] }
        ];
      };
      comments: {
        Row: { id: string; subject_type: string; subject_id: string; author_id: string; author_name: string; body: string; mentions: string[]; read: boolean; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["comments"]["Row"]> & { subject_type: string; subject_id: string; author_id: string; author_name: string; body: string };
        Update: Partial<Database["public"]["Tables"]["comments"]["Row"]>;
        // subject_id es polimórfico (task o project); no se puede declarar una
        // única FK real, por eso queda sin Relationships.
        Relationships: [];
      };
      workspace_activity: {
        Row: { id: string; workspace_id: string; project_id: string | null; type: string; text: string; actor: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["workspace_activity"]["Row"]> & { workspace_id: string; type: string; text: string; actor: string };
        Update: Partial<Database["public"]["Tables"]["workspace_activity"]["Row"]>;
        Relationships: [
          { foreignKeyName: "workspace_activity_workspace_id_fkey"; columns: ["workspace_id"]; isOneToOne: false; referencedRelation: "workspaces"; referencedColumns: ["id"] },
          { foreignKeyName: "workspace_activity_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ];
      };
      logbook: {
        Row: { id: string; user_id: string; project_id: string | null; type: string; text: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["logbook"]["Row"]> & { user_id: string; type: string; text: string };
        Update: Partial<Database["public"]["Tables"]["logbook"]["Row"]>;
        Relationships: [
          { foreignKeyName: "logbook_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ];
      };
      knowledge_items: {
        Row: { id: string; user_id: string; project_id: string | null; title: string; type: string; url: string; note: string; version: number; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["knowledge_items"]["Row"]> & { user_id: string; title: string; type: string };
        Update: Partial<Database["public"]["Tables"]["knowledge_items"]["Row"]>;
        Relationships: [
          { foreignKeyName: "knowledge_items_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }
        ];
      };
      daily_plans: {
        Row: {
          id: string;
          user_id: string;
          local_date: DateStr;
          one_thing: string;
          one_thing_task_id: string | null;
          one_thing_project_id: string | null;
          task_ids: string[];
          approved: boolean;
          approved_at: Timestamptz | null;
          created_at: Timestamptz;
        };
        Insert: Partial<Database["public"]["Tables"]["daily_plans"]["Row"]> & { user_id: string; local_date: DateStr };
        Update: Partial<Database["public"]["Tables"]["daily_plans"]["Row"]>;
        Relationships: [];
      };
      weekly_reviews: {
        Row: { id: string; user_id: string; review_date: DateStr; completed_count: number; progress_pct: number; blocked_count: number; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["weekly_reviews"]["Row"]> & { user_id: string };
        Update: Partial<Database["public"]["Tables"]["weekly_reviews"]["Row"]>;
        Relationships: [];
      };
      occupations: {
        Row: { id: string; user_id: string; title: string; start_time: string; end_time: string; category: string; recurring: boolean; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["occupations"]["Row"]> & { user_id: string; title: string; start_time: string; end_time: string };
        Update: Partial<Database["public"]["Tables"]["occupations"]["Row"]>;
        Relationships: [];
      };
      habits: {
        Row: { id: string; user_id: string; name: string; frequency: string; category: string; occupation_id: string | null; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["habits"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["habits"]["Row"]>;
        Relationships: [
          { foreignKeyName: "habits_occupation_id_fkey"; columns: ["occupation_id"]; isOneToOne: false; referencedRelation: "occupations"; referencedColumns: ["id"] }
        ];
      };
      habit_logs: {
        Row: { id: string; habit_id: string; log_date: DateStr; completed_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["habit_logs"]["Row"]> & { habit_id: string; log_date: DateStr };
        Update: Partial<Database["public"]["Tables"]["habit_logs"]["Row"]>;
        Relationships: [
          { foreignKeyName: "habit_logs_habit_id_fkey"; columns: ["habit_id"]; isOneToOne: false; referencedRelation: "habits"; referencedColumns: ["id"] }
        ];
      };
      books: {
        Row: { id: string; user_id: string; title: string; author: string; status: string; current_page: number; total_pages: number; started_at: DateStr | null; finished_at: DateStr | null; updated_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["books"]["Row"]> & { user_id: string; title: string };
        Update: Partial<Database["public"]["Tables"]["books"]["Row"]>;
        Relationships: [];
      };
      book_notes: {
        Row: { id: string; book_id: string; page_ref: number; text: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["book_notes"]["Row"]> & { book_id: string; text: string };
        Update: Partial<Database["public"]["Tables"]["book_notes"]["Row"]>;
        Relationships: [
          { foreignKeyName: "book_notes_book_id_fkey"; columns: ["book_id"]; isOneToOne: false; referencedRelation: "books"; referencedColumns: ["id"] }
        ];
      };
      accounts: {
        Row: { id: string; user_id: string; name: string; type: string; currency: string; opening_balance: number; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["accounts"]["Row"]> & { user_id: string; name: string; type: string };
        Update: Partial<Database["public"]["Tables"]["accounts"]["Row"]>;
        Relationships: [];
      };
      categories: {
        Row: { id: string; user_id: string; name: string };
        Insert: Partial<Database["public"]["Tables"]["categories"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["categories"]["Row"]>;
        Relationships: [];
      };
      journal_entries: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          memo: string;
          entry_date: DateStr;
          effective_at: DateStr;
          category: string | null;
          counterparty: string;
          status: string;
          reconciled: boolean;
          source: string;
          dedupe_key: string;
          family_member_id: string | null;
          debt_id: string | null;
          version: number;
          created_at: Timestamptz;
        };
        Insert: Partial<Database["public"]["Tables"]["journal_entries"]["Row"]> & { user_id: string; type: string; memo: string; entry_date: DateStr; effective_at: DateStr; dedupe_key: string };
        Update: Partial<Database["public"]["Tables"]["journal_entries"]["Row"]>;
        Relationships: [
          { foreignKeyName: "journal_entries_family_member_id_fkey"; columns: ["family_member_id"]; isOneToOne: false; referencedRelation: "family_members"; referencedColumns: ["id"] },
          { foreignKeyName: "journal_entries_debt_id_fkey"; columns: ["debt_id"]; isOneToOne: false; referencedRelation: "debts"; referencedColumns: ["id"] }
        ];
      };
      journal_lines: {
        Row: { id: string; entry_id: string; account_id: string; amount: number };
        Insert: Partial<Database["public"]["Tables"]["journal_lines"]["Row"]> & { entry_id: string; account_id: string; amount: number };
        Update: Partial<Database["public"]["Tables"]["journal_lines"]["Row"]>;
        // Estas dos FKs son las que permiten tipar correctamente
        // `.from("journal_entries").select("*, journal_lines(*)")` como un
        // array real (Row[]) en vez de SelectQueryError.
        Relationships: [
          { foreignKeyName: "journal_lines_entry_id_fkey"; columns: ["entry_id"]; isOneToOne: false; referencedRelation: "journal_entries"; referencedColumns: ["id"] },
          { foreignKeyName: "journal_lines_account_id_fkey"; columns: ["account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["id"] }
        ];
      };
      budgets: {
        Row: { id: string; user_id: string; period: string; cycle: string; category: string; amount: number; monthly_cost: number; q1_amount: number; q2_amount: number; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["budgets"]["Row"]> & { user_id: string; category: string };
        Update: Partial<Database["public"]["Tables"]["budgets"]["Row"]>;
        Relationships: [];
      };
      debts: {
        Row: { id: string; user_id: string; name: string; balance: number; rate: number; min_payment: number; due_day: number; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["debts"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["debts"]["Row"]>;
        Relationships: [];
      };
      cashback_cards: {
        Row: { id: string; user_id: string; name: string; account_id: string | null; debt_id: string | null; rate_pct: number; eligible_categories: string[]; accrued_estimate: number; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["cashback_cards"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["cashback_cards"]["Row"]>;
        Relationships: [
          { foreignKeyName: "cashback_cards_account_id_fkey"; columns: ["account_id"]; isOneToOne: false; referencedRelation: "accounts"; referencedColumns: ["id"] },
          { foreignKeyName: "cashback_cards_debt_id_fkey"; columns: ["debt_id"]; isOneToOne: false; referencedRelation: "debts"; referencedColumns: ["id"] }
        ];
      };
      cashback_redemptions: {
        Row: { id: string; card_id: string; amount: number; redeemed_at: DateStr };
        Insert: Partial<Database["public"]["Tables"]["cashback_redemptions"]["Row"]> & { card_id: string; amount: number };
        Update: Partial<Database["public"]["Tables"]["cashback_redemptions"]["Row"]>;
        Relationships: [
          { foreignKeyName: "cashback_redemptions_card_id_fkey"; columns: ["card_id"]; isOneToOne: false; referencedRelation: "cashback_cards"; referencedColumns: ["id"] }
        ];
      };
      savings_goals: {
        Row: { id: string; user_id: string; name: string; type: string; target: number; current_amount: number; target_date: DateStr | null; priority: string; monthly: number; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["savings_goals"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["savings_goals"]["Row"]>;
        Relationships: [];
      };
      investments: {
        Row: { id: string; user_id: string; kind: string; name: string; institution: string; broker: string; principal: number; rate: number; valuation: number; as_of: DateStr; source: string; currency: string; family_member_id: string | null; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["investments"]["Row"]> & { user_id: string; kind: string; name: string };
        Update: Partial<Database["public"]["Tables"]["investments"]["Row"]>;
        Relationships: [
          { foreignKeyName: "investments_family_member_id_fkey"; columns: ["family_member_id"]; isOneToOne: false; referencedRelation: "family_members"; referencedColumns: ["id"] }
        ];
      };
      financial_goals: {
        Row: { id: string; user_id: string; name: string; target: number; horizon: DateStr | null; priority: string; account_ids: string[]; current_amount: number; family_member_id: string | null; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["financial_goals"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["financial_goals"]["Row"]>;
        Relationships: [
          { foreignKeyName: "financial_goals_family_member_id_fkey"; columns: ["family_member_id"]; isOneToOne: false; referencedRelation: "family_members"; referencedColumns: ["id"] }
        ];
      };
      assets: {
        Row: { id: string; user_id: string; name: string; kind: string; value: number; currency: string; as_of: DateStr; source: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["assets"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["assets"]["Row"]>;
        Relationships: [];
      };
      liabilities: {
        Row: { id: string; user_id: string; name: string; value: number; currency: string; as_of: DateStr; source: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["liabilities"]["Row"]> & { user_id: string; name: string };
        Update: Partial<Database["public"]["Tables"]["liabilities"]["Row"]>;
        Relationships: [];
      };
      net_worth_snapshots: {
        Row: { id: string; user_id: string; as_of: DateStr; assets: number; liabilities: number; net: number; method_version: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["net_worth_snapshots"]["Row"]> & { user_id: string; assets: number; liabilities: number; net: number };
        Update: Partial<Database["public"]["Tables"]["net_worth_snapshots"]["Row"]>;
        Relationships: [];
      };
      family_members: {
        Row: { id: string; user_id: string; name: string; relationship: string; member_type: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["family_members"]["Row"]> & { user_id: string; name: string; relationship: string };
        Update: Partial<Database["public"]["Tables"]["family_members"]["Row"]>;
        Relationships: [];
      };
      recommendations: {
        Row: { id: string; user_id: string; type: string; text: string; confidence: string; domain: string; evidence: Json; assumptions: Json; actions: Json; requires_confirmation: boolean; impact: string; status: string; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["recommendations"]["Row"]> & { user_id: string; type: string; text: string; confidence: string; domain: string };
        Update: Partial<Database["public"]["Tables"]["recommendations"]["Row"]>;
        Relationships: [];
      };
      memory_items: {
        Row: { id: string; user_id: string; scope: string; origin: string; text: string; valid_until: DateStr | null; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["memory_items"]["Row"]> & { user_id: string; scope: string; text: string };
        Update: Partial<Database["public"]["Tables"]["memory_items"]["Row"]>;
        Relationships: [];
      };
      automations: {
        Row: { id: string; user_id: string; name: string; trigger_text: string; condition_text: string; action_text: string; authorized: boolean; enabled: boolean; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["automations"]["Row"]> & { user_id: string; name: string; trigger_text: string };
        Update: Partial<Database["public"]["Tables"]["automations"]["Row"]>;
        Relationships: [];
      };
      automation_runs: {
        Row: { id: string; automation_id: string; result: string; ts: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["automation_runs"]["Row"]> & { automation_id: string; result: string };
        Update: Partial<Database["public"]["Tables"]["automation_runs"]["Row"]>;
        Relationships: [
          { foreignKeyName: "automation_runs_automation_id_fkey"; columns: ["automation_id"]; isOneToOne: false; referencedRelation: "automations"; referencedColumns: ["id"] }
        ];
      };
      audit_log: {
        Row: { id: string; user_id: string; action: string; object: string | null; correlation_id: string; meta: Json | null; created_at: Timestamptz };
        Insert: Partial<Database["public"]["Tables"]["audit_log"]["Row"]> & { user_id: string; action: string };
        Update: Partial<Database["public"]["Tables"]["audit_log"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_workspace_member: { Args: { p_workspace_id: string }; Returns: boolean };
      workspace_role: { Args: { p_workspace_id: string }; Returns: string | null };
      has_project_access: { Args: { p_project_id: string }; Returns: boolean };
      can_edit_project: { Args: { p_project_id: string }; Returns: boolean };
      list_workspace_members: { Args: { p_workspace_id: string }; Returns: Database["public"]["Tables"]["memberships"]["Row"][] };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
