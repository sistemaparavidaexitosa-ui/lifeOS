export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          opening_balance: number
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          name: string
          opening_balance?: number
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          opening_balance?: number
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          as_of: string
          created_at: string
          currency: string
          id: string
          kind: string
          name: string
          source: string
          user_id: string
          value: number
        }
        Insert: {
          as_of?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          name: string
          source?: string
          user_id: string
          value?: number
        }
        Update: {
          as_of?: string
          created_at?: string
          currency?: string
          id?: string
          kind?: string
          name?: string
          source?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          correlation_id: string
          created_at: string
          id: string
          meta: Json | null
          object: string | null
          user_id: string
        }
        Insert: {
          action: string
          correlation_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          object?: string | null
          user_id: string
        }
        Update: {
          action?: string
          correlation_id?: string
          created_at?: string
          id?: string
          meta?: Json | null
          object?: string | null
          user_id?: string
        }
        Relationships: []
      }
      automation_runs: {
        Row: {
          automation_id: string
          id: string
          result: string
          ts: string
        }
        Insert: {
          automation_id: string
          id?: string
          result: string
          ts?: string
        }
        Update: {
          automation_id?: string
          id?: string
          result?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_id_fkey"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          action_text: string
          authorized: boolean
          condition_text: string
          created_at: string
          enabled: boolean
          id: string
          name: string
          trigger_text: string
          user_id: string
        }
        Insert: {
          action_text?: string
          authorized?: boolean
          condition_text?: string
          created_at?: string
          enabled?: boolean
          id?: string
          name: string
          trigger_text: string
          user_id: string
        }
        Update: {
          action_text?: string
          authorized?: boolean
          condition_text?: string
          created_at?: string
          enabled?: boolean
          id?: string
          name?: string
          trigger_text?: string
          user_id?: string
        }
        Relationships: []
      }
      book_notes: {
        Row: {
          book_id: string
          created_at: string
          id: string
          page_ref: number
          text: string
        }
        Insert: {
          book_id: string
          created_at?: string
          id?: string
          page_ref?: number
          text: string
        }
        Update: {
          book_id?: string
          created_at?: string
          id?: string
          page_ref?: number
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_notes_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      books: {
        Row: {
          author: string
          cover_url: string
          current_page: number
          finished_at: string | null
          id: string
          started_at: string | null
          status: string
          title: string
          total_pages: number
          updated_at: string
          user_id: string
        }
        Insert: {
          author?: string
          cover_url?: string
          current_page?: number
          finished_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
          title: string
          total_pages?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          author?: string
          cover_url?: string
          current_page?: number
          finished_at?: string | null
          id?: string
          started_at?: string | null
          status?: string
          title?: string
          total_pages?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          category: string
          created_at: string
          cycle: string
          id: string
          monthly_cost: number
          period: string
          q1_amount: number
          q2_amount: number
          user_id: string
        }
        Insert: {
          amount?: number
          category: string
          created_at?: string
          cycle?: string
          id?: string
          monthly_cost?: number
          period?: string
          q1_amount?: number
          q2_amount?: number
          user_id: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          cycle?: string
          id?: string
          monthly_cost?: number
          period?: string
          q1_amount?: number
          q2_amount?: number
          user_id?: string
        }
        Relationships: []
      }
      cashback_cards: {
        Row: {
          account_id: string | null
          accrued_estimate: number
          created_at: string
          debt_id: string | null
          eligible_categories: string[]
          id: string
          name: string
          rate_pct: number
          user_id: string
        }
        Insert: {
          account_id?: string | null
          accrued_estimate?: number
          created_at?: string
          debt_id?: string | null
          eligible_categories?: string[]
          id?: string
          name: string
          rate_pct?: number
          user_id: string
        }
        Update: {
          account_id?: string | null
          accrued_estimate?: number
          created_at?: string
          debt_id?: string | null
          eligible_categories?: string[]
          id?: string
          name?: string
          rate_pct?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_cards_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_cards_debt_id_fkey"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_redemptions: {
        Row: {
          amount: number
          card_id: string
          id: string
          redeemed_at: string
        }
        Insert: {
          amount: number
          card_id: string
          id?: string
          redeemed_at?: string
        }
        Update: {
          amount?: number
          card_id?: string
          id?: string
          redeemed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_redemptions_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cashback_cards"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          id: string
          name: string
          user_id: string
        }
        Insert: {
          id?: string
          name: string
          user_id: string
        }
        Update: {
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      comments: {
        Row: {
          author_id: string
          author_name: string
          body: string
          created_at: string
          id: string
          mentions: string[]
          read: boolean
          subject_id: string
          subject_type: string
        }
        Insert: {
          author_id: string
          author_name: string
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          read?: boolean
          subject_id: string
          subject_type: string
        }
        Update: {
          author_id?: string
          author_name?: string
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          read?: boolean
          subject_id?: string
          subject_type?: string
        }
        Relationships: []
      }
      consents: {
        Row: {
          id: string
          purpose: string
          status: string
          ts: string
          user_id: string
          version: string
        }
        Insert: {
          id?: string
          purpose: string
          status: string
          ts?: string
          user_id: string
          version?: string
        }
        Update: {
          id?: string
          purpose?: string
          status?: string
          ts?: string
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      daily_plans: {
        Row: {
          approved: boolean
          approved_at: string | null
          created_at: string
          id: string
          local_date: string
          one_thing: string
          one_thing_project_id: string | null
          one_thing_task_id: string | null
          task_ids: string[]
          user_id: string
        }
        Insert: {
          approved?: boolean
          approved_at?: string | null
          created_at?: string
          id?: string
          local_date: string
          one_thing?: string
          one_thing_project_id?: string | null
          one_thing_task_id?: string | null
          task_ids?: string[]
          user_id: string
        }
        Update: {
          approved?: boolean
          approved_at?: string | null
          created_at?: string
          id?: string
          local_date?: string
          one_thing?: string
          one_thing_project_id?: string | null
          one_thing_task_id?: string | null
          task_ids?: string[]
          user_id?: string
        }
        Relationships: []
      }
      debts: {
        Row: {
          balance: number
          created_at: string
          due_day: number
          id: string
          min_payment: number
          name: string
          rate: number
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          due_day?: number
          id?: string
          min_payment?: number
          name: string
          rate?: number
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          due_day?: number
          id?: string
          min_payment?: number
          name?: string
          rate?: number
          user_id?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          created_at: string
          id: string
          member_type: string
          name: string
          relationship: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          member_type?: string
          name: string
          relationship: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          member_type?: string
          name?: string
          relationship?: string
          user_id?: string
        }
        Relationships: []
      }
      financial_goals: {
        Row: {
          account_ids: string[]
          created_at: string
          current_amount: number
          family_member_id: string | null
          horizon: string | null
          id: string
          name: string
          priority: string
          target: number
          user_id: string
        }
        Insert: {
          account_ids?: string[]
          created_at?: string
          current_amount?: number
          family_member_id?: string | null
          horizon?: string | null
          id?: string
          name: string
          priority?: string
          target?: number
          user_id: string
        }
        Update: {
          account_ids?: string[]
          created_at?: string
          current_amount?: number
          family_member_id?: string | null
          horizon?: string | null
          id?: string
          name?: string
          priority?: string
          target?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_goals_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          workspace_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          position?: number
          workspace_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      habit_logs: {
        Row: {
          completed_at: string
          habit_id: string
          id: string
          log_date: string
        }
        Insert: {
          completed_at?: string
          habit_id: string
          id?: string
          log_date: string
        }
        Update: {
          completed_at?: string
          habit_id?: string
          id?: string
          log_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "habit_logs_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
        ]
      }
      habits: {
        Row: {
          category: string
          created_at: string
          frequency: string
          id: string
          name: string
          occupation_id: string | null
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          frequency?: string
          id?: string
          name: string
          occupation_id?: string | null
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          frequency?: string
          id?: string
          name?: string
          occupation_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "habits_occupation_id_fkey"
            columns: ["occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["id"]
          },
        ]
      }
      investments: {
        Row: {
          as_of: string
          broker: string
          created_at: string
          currency: string
          family_member_id: string | null
          id: string
          institution: string
          kind: string
          name: string
          principal: number
          rate: number
          source: string
          user_id: string
          valuation: number
        }
        Insert: {
          as_of?: string
          broker?: string
          created_at?: string
          currency?: string
          family_member_id?: string | null
          id?: string
          institution?: string
          kind: string
          name: string
          principal?: number
          rate?: number
          source?: string
          user_id: string
          valuation?: number
        }
        Update: {
          as_of?: string
          broker?: string
          created_at?: string
          currency?: string
          family_member_id?: string | null
          id?: string
          institution?: string
          kind?: string
          name?: string
          principal?: number
          rate?: number
          source?: string
          user_id?: string
          valuation?: number
        }
        Relationships: [
          {
            foreignKeyName: "investments_family_member_id_fkey"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          role: string
          status: string
          token: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          role?: string
          status?: string
          token?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          role?: string
          status?: string
          token?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          category: string | null
          counterparty: string
          created_at: string
          debt_id: string | null
          dedupe_key: string
          effective_at: string
          entry_date: string
          family_member_id: string | null
          id: string
          memo: string
          reconciled: boolean
          source: string
          status: string
          type: string
          user_id: string
          version: number
        }
        Insert: {
          category?: string | null
          counterparty?: string
          created_at?: string
          debt_id?: string | null
          dedupe_key: string
          effective_at: string
          entry_date: string
          family_member_id?: string | null
          id?: string
          memo: string
          reconciled?: boolean
          source?: string
          status?: string
          type: string
          user_id: string
          version?: number
        }
        Update: {
          category?: string | null
          counterparty?: string
          created_at?: string
          debt_id?: string | null
          dedupe_key?: string
          effective_at?: string
          entry_date?: string
          family_member_id?: string | null
          id?: string
          memo?: string
          reconciled?: boolean
          source?: string
          status?: string
          type?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_journal_entries_debt"
            columns: ["debt_id"]
            isOneToOne: false
            referencedRelation: "debts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_journal_entries_family_member"
            columns: ["family_member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          amount: number
          entry_id: string
          id: string
        }
        Insert: {
          account_id: string
          amount: number
          entry_id: string
          id?: string
        }
        Update: {
          account_id?: string
          amount?: number
          entry_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      key_results: {
        Row: {
          created_at: string
          goal_id: string
          id: string
          manual_current: number
          position: number
          source_id: string | null
          source_kind: string
          target: number
          title: string
          unit: string
        }
        Insert: {
          created_at?: string
          goal_id: string
          id?: string
          manual_current?: number
          position?: number
          source_id?: string | null
          source_kind?: string
          target?: number
          title: string
          unit?: string
        }
        Update: {
          created_at?: string
          goal_id?: string
          id?: string
          manual_current?: number
          position?: number
          source_id?: string | null
          source_kind?: string
          target?: number
          title?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "key_results_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "personal_goals"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_items: {
        Row: {
          created_at: string
          id: string
          note: string
          project_id: string | null
          title: string
          type: string
          url: string
          user_id: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string
          project_id?: string | null
          title: string
          type: string
          url?: string
          user_id: string
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          note?: string
          project_id?: string | null
          title?: string
          type?: string
          url?: string
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_items_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      liabilities: {
        Row: {
          as_of: string
          created_at: string
          currency: string
          id: string
          name: string
          source: string
          user_id: string
          value: number
        }
        Insert: {
          as_of?: string
          created_at?: string
          currency?: string
          id?: string
          name: string
          source?: string
          user_id: string
          value?: number
        }
        Update: {
          as_of?: string
          created_at?: string
          currency?: string
          id?: string
          name?: string
          source?: string
          user_id?: string
          value?: number
        }
        Relationships: []
      }
      logbook: {
        Row: {
          created_at: string
          id: string
          project_id: string | null
          text: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id?: string | null
          text: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string | null
          text?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "logbook_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          created_at: string
          id: string
          role: string
          status: string
          user_id: string
          user_name: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: string
          status?: string
          user_id: string
          user_name: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: string
          status?: string
          user_id?: string
          user_name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      memory_items: {
        Row: {
          created_at: string
          id: string
          origin: string
          scope: string
          text: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          origin?: string
          scope: string
          text: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          origin?: string
          scope?: string
          text?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      milestones: {
        Row: {
          created_at: string
          done: boolean
          id: string
          project_id: string
          title: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          project_id: string
          title: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      net_worth_snapshots: {
        Row: {
          as_of: string
          assets: number
          created_at: string
          id: string
          liabilities: number
          method_version: string
          net: number
          user_id: string
        }
        Insert: {
          as_of?: string
          assets: number
          created_at?: string
          id?: string
          liabilities: number
          method_version?: string
          net: number
          user_id: string
        }
        Update: {
          as_of?: string
          assets?: number
          created_at?: string
          id?: string
          liabilities?: number
          method_version?: string
          net?: number
          user_id?: string
        }
        Relationships: []
      }
      occupations: {
        Row: {
          category: string
          created_at: string
          days: number[]
          end_time: string
          id: string
          occ_date: string | null
          recurring: boolean
          source: string
          start_time: string
          title: string
          user_id: string
        }
        Insert: {
          category?: string
          created_at?: string
          days?: number[]
          end_time: string
          id?: string
          occ_date?: string | null
          recurring?: boolean
          source?: string
          start_time: string
          title: string
          user_id: string
        }
        Update: {
          category?: string
          created_at?: string
          days?: number[]
          end_time?: string
          id?: string
          occ_date?: string | null
          recurring?: boolean
          source?: string
          start_time?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      personal_goals: {
        Row: {
          achieved_at: string | null
          area: string
          created_at: string
          description: string
          horizon: string | null
          id: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          achieved_at?: string | null
          area?: string
          created_at?: string
          description?: string
          horizon?: string | null
          id?: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          achieved_at?: string | null
          area?: string
          created_at?: string
          description?: string
          horizon?: string | null
          id?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          activity_window_end: string
          activity_window_start: string
          ai_domains: string[]
          created_at: string
          currency: string
          cycle: string
          locale: string
          name: string
          onboarded: boolean
          quincenal_income: number
          theme: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_window_end?: string
          activity_window_start?: string
          ai_domains?: string[]
          created_at?: string
          currency?: string
          cycle?: string
          locale?: string
          name?: string
          onboarded?: boolean
          quincenal_income?: number
          theme?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_window_end?: string
          activity_window_start?: string
          ai_domains?: string[]
          created_at?: string
          currency?: string
          cycle?: string
          locale?: string
          name?: string
          onboarded?: boolean
          quincenal_income?: number
          theme?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_shares: {
        Row: {
          access_level: string
          created_at: string
          id: string
          project_id: string
          workspace_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          id?: string
          project_id: string
          workspace_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          id?: string
          project_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_shares_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          area: string
          created_at: string
          dependencies: string
          description: string
          folder_id: string | null
          id: string
          notes: string
          objective: string
          owner_id: string
          owner_name: string
          priority: string
          resources: string
          results: string
          risks: string
          status: string
          tags: string[]
          target_date: string | null
          title: string
          version: number
          workspace_id: string | null
        }
        Insert: {
          area?: string
          created_at?: string
          dependencies?: string
          description?: string
          folder_id?: string | null
          id?: string
          notes?: string
          objective?: string
          owner_id: string
          owner_name?: string
          priority?: string
          resources?: string
          results?: string
          risks?: string
          status?: string
          tags?: string[]
          target_date?: string | null
          title: string
          version?: number
          workspace_id?: string | null
        }
        Update: {
          area?: string
          created_at?: string
          dependencies?: string
          description?: string
          folder_id?: string | null
          id?: string
          notes?: string
          objective?: string
          owner_id?: string
          owner_name?: string
          priority?: string
          resources?: string
          results?: string
          risks?: string
          status?: string
          tags?: string[]
          target_date?: string | null
          title?: string
          version?: number
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendations: {
        Row: {
          actions: Json
          assumptions: Json
          confidence: string
          created_at: string
          domain: string
          evidence: Json
          fingerprint: string | null
          id: string
          impact: string
          requires_confirmation: boolean
          status: string
          text: string
          type: string
          user_id: string
        }
        Insert: {
          actions?: Json
          assumptions?: Json
          confidence: string
          created_at?: string
          domain: string
          evidence?: Json
          fingerprint?: string | null
          id?: string
          impact?: string
          requires_confirmation?: boolean
          status?: string
          text: string
          type: string
          user_id: string
        }
        Update: {
          actions?: Json
          assumptions?: Json
          confidence?: string
          created_at?: string
          domain?: string
          evidence?: Json
          fingerprint?: string | null
          id?: string
          impact?: string
          requires_confirmation?: boolean
          status?: string
          text?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      routine_runs: {
        Row: {
          completed_at: string | null
          completed_step_ids: string[]
          id: string
          local_date: string
          routine_id: string
          started_at: string
        }
        Insert: {
          completed_at?: string | null
          completed_step_ids?: string[]
          id?: string
          local_date: string
          routine_id: string
          started_at?: string
        }
        Update: {
          completed_at?: string | null
          completed_step_ids?: string[]
          id?: string
          local_date?: string
          routine_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_runs_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routine_steps: {
        Row: {
          duration_min: number
          habit_id: string | null
          id: string
          position: number
          routine_id: string
          title: string
        }
        Insert: {
          duration_min?: number
          habit_id?: string | null
          id?: string
          position?: number
          routine_id: string
          title: string
        }
        Update: {
          duration_min?: number
          habit_id?: string | null
          id?: string
          position?: number
          routine_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "routine_steps_habit_id_fkey"
            columns: ["habit_id"]
            isOneToOne: false
            referencedRelation: "habits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routine_steps_routine_id_fkey"
            columns: ["routine_id"]
            isOneToOne: false
            referencedRelation: "routines"
            referencedColumns: ["id"]
          },
        ]
      }
      routines: {
        Row: {
          active: boolean
          created_at: string
          frequency: string
          id: string
          name: string
          occupation_id: string | null
          position: number
          user_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          frequency?: string
          id?: string
          name: string
          occupation_id?: string | null
          position?: number
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          frequency?: string
          id?: string
          name?: string
          occupation_id?: string | null
          position?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routines_occupation_id_fkey"
            columns: ["occupation_id"]
            isOneToOne: false
            referencedRelation: "occupations"
            referencedColumns: ["id"]
          },
        ]
      }
      savings_goals: {
        Row: {
          created_at: string
          current_amount: number
          id: string
          monthly: number
          name: string
          priority: string
          target: number
          target_date: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_amount?: number
          id?: string
          monthly?: number
          name: string
          priority?: string
          target?: number
          target_date?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_amount?: number
          id?: string
          monthly?: number
          name?: string
          priority?: string
          target?: number
          target_date?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      task_assignees: {
        Row: {
          task_id: string
          user_name: string
        }
        Insert: {
          task_id: string
          user_name: string
        }
        Update: {
          task_id?: string
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_files: {
        Row: {
          content_type: string
          created_at: string
          file_name: string
          id: string
          size_bytes: number
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          file_name: string
          id?: string
          size_bytes?: number
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string
          created_at?: string
          file_name?: string
          id?: string
          size_bytes?: number
          storage_path?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_files_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_groups: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          position: number
          project_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          project_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          position?: number
          project_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_groups_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          from_state: string | null
          id: string
          task_id: string
          to_state: string
          ts: string
        }
        Insert: {
          from_state?: string | null
          id?: string
          task_id: string
          to_state: string
          ts?: string
        }
        Update: {
          from_state?: string | null
          id?: string
          task_id?: string
          to_state?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          deps: string[]
          description: string
          due: string | null
          est: number
          group_id: string | null
          id: string
          impact: boolean
          parent_task_id: string | null
          position: number
          priority: string
          project_id: string
          start_date: string | null
          status: string
          title: string
          urgent: boolean
          version: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          deps?: string[]
          description?: string
          due?: string | null
          est?: number
          group_id?: string | null
          id?: string
          impact?: boolean
          parent_task_id?: string | null
          position?: number
          priority?: string
          project_id: string
          start_date?: string | null
          status?: string
          title: string
          urgent?: boolean
          version?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          deps?: string[]
          description?: string
          due?: string | null
          est?: number
          group_id?: string | null
          id?: string
          impact?: boolean
          parent_task_id?: string | null
          position?: number
          priority?: string
          project_id?: string
          start_date?: string | null
          status?: string
          title?: string
          urgent?: boolean
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_reviews: {
        Row: {
          blocked_count: number
          completed_count: number
          created_at: string
          id: string
          progress_pct: number
          review_date: string
          user_id: string
        }
        Insert: {
          blocked_count?: number
          completed_count?: number
          created_at?: string
          id?: string
          progress_pct?: number
          review_date?: string
          user_id: string
        }
        Update: {
          blocked_count?: number
          completed_count?: number
          created_at?: string
          id?: string
          progress_pct?: number
          review_date?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_activity: {
        Row: {
          actor: string
          created_at: string
          id: string
          project_id: string | null
          text: string
          type: string
          workspace_id: string
        }
        Insert: {
          actor: string
          created_at?: string
          id?: string
          project_id?: string | null
          text: string
          type: string
          workspace_id: string
        }
        Update: {
          actor?: string
          created_at?: string
          id?: string
          project_id?: string | null
          text?: string
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_activity_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_activity_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          owner_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invitation: {
        Args: { p_token: string }
        Returns: {
          message: string
          ok: boolean
          workspace_id: string
        }[]
      }
      can_edit_project: { Args: { p_project_id: string }; Returns: boolean }
      debug_rls_policies: {
        Args: never
        Returns: {
          cmd: string
          policyname: string
          qual: string
          tablename: string
          with_check: string
        }[]
      }
      has_project_access: { Args: { p_project_id: string }; Returns: boolean }
      invitation_preview: {
        Args: { p_token: string }
        Returns: {
          email_hint: string
          expires_at: string
          role: string
          state: string
          workspace_name: string
        }[]
      }
      is_workspace_member: {
        Args: { p_workspace_id: string }
        Returns: boolean
      }
      list_workspace_members: {
        Args: { p_workspace_id: string }
        Returns: {
          created_at: string
          id: string
          role: string
          status: string
          user_id: string
          user_name: string
          workspace_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "memberships"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      workspace_role: { Args: { p_workspace_id: string }; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
          versioning_status: string
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      iceberg_namespaces: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          metadata: Json
          name: string
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_namespaces_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
        ]
      }
      iceberg_tables: {
        Row: {
          bucket_name: string
          catalog_id: string
          created_at: string
          id: string
          location: string
          name: string
          namespace_id: string
          remote_table_id: string | null
          shard_id: string | null
          shard_key: string | null
          updated_at: string
        }
        Insert: {
          bucket_name: string
          catalog_id: string
          created_at?: string
          id?: string
          location: string
          name: string
          namespace_id: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Update: {
          bucket_name?: string
          catalog_id?: string
          created_at?: string
          id?: string
          location?: string
          name?: string
          namespace_id?: string
          remote_table_id?: string | null
          shard_id?: string | null
          shard_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "iceberg_tables_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "buckets_analytics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "iceberg_tables_namespace_id_fkey"
            columns: ["namespace_id"]
            isOneToOne: false
            referencedRelation: "iceberg_namespaces"
            referencedColumns: ["id"]
          },
        ]
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          archived_at: string | null
          bucket_id: string | null
          created_at: string | null
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: never
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          levels?: number
          limits?: number
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          created_at: string
          id: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          levels?: number
          limits?: number
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const

