// Tipos de dominio puro, sin dependencias de Next/React/Supabase.
// Espejo de las entidades de la Master Spec (§35, §60-62) y del objeto DOMAIN
// del HTML de referencia. Deliberadamente framework-agnostic para poder
// probarse con `node --experimental-strip-types --test` sin instalar nada.

export type TaskStatus =
  | "Pending"
  | "InProgress"
  | "Blocked"
  | "Rescheduled"
  | "Completed"
  | "Cancelled";

export type EffectiveTaskStatus = TaskStatus | "Overdue";

export type Priority = "High" | "Medium" | "Low";

/** Estado de un PROYECTO (enum distinto al de una tarea, ver projects.status). */
export type ProjectStatus = "Draft" | "Active" | "OnHold" | "Completed" | "Cancelled" | "Archived";

export interface TaskLike {
  id: string;
  status: TaskStatus;
  priority: Priority;
  urgent: boolean;
  due: string | null; // ISO date (yyyy-mm-dd)
  deps: string[];
  est: number; // minutos
  parentTaskId?: string | null; // subtareas estilo Monday (auto-referencia)
  startDate?: string | null; // inicio del rango para la columna Timeline
}

export type EisenhowerQuadrant = "do" | "plan" | "delegate" | "drop";

export interface BudgetLine {
  id: string;
  category: string;
  monthlyCost: number;
  q1Amount: number;
  q2Amount: number;
}

export interface JournalLine {
  account: string;
  amount: number;
}

export interface JournalEntryLike {
  id: string;
  type: "income" | "expense" | "transfer";
  date: string;
  category: string | null;
  status: "Posted" | "Reconciled" | "Reversed";
  lines: JournalLine[];
  debtId?: string | null;
}

export interface DebtLike {
  id: string;
  name: string;
  balance: number;
  rate: number; // % anual
  minPayment: number;
}

export interface OccupationLike {
  id: string;
  title: string;
  start: string; // "HH:MM"
  end: string; // "HH:MM"
}

export interface ActivityWindow {
  start: string;
  end: string;
}

export interface HabitLogLike {
  habitId: string;
  date: string; // ISO date
}
