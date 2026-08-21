"use client";
// Barra de herramientas del tablero (equivalente a la barra de monday.com:
// buscar / persona / filtro / ordenar) + pestañas de vista.
//
// Es la pieza que faltaba en el flujo anterior: la única forma de "encontrar"
// una tarea era leer el tablero completo. Ahora el mismo filtro aplica a las
// 4 vistas porque BoardShell filtra UNA vez con filterTaskTree() y les pasa
// el resultado.
import { useState } from "react";
import { STATUS_META, STATUS_ORDER, PRIORITY_META, PRIORITY_ORDER } from "./status-meta";
import { VIEW_LABELS, type ExecutionView } from "./board-types";
import { EMPTY_FILTERS, type BoardFilters, type BoardStats, type DateBucket, type SortKey } from "@/lib/domain/board.ts";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";

const DATE_BUCKETS: { key: DateBucket; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "overdue", label: "Vencidas" },
  { key: "today", label: "Hoy" },
  { key: "week", label: "Próx. 7 días" },
  { key: "nodate", label: "Sin fecha" }
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "manual", label: "Manual (arrastrar)" },
  { key: "due", label: "Fecha de vencimiento" },
  { key: "priority", label: "Prioridad" },
  { key: "status", label: "Estado" },
  { key: "title", label: "Título (A-Z)" }
];

export default function BoardToolbar({
  view,
  onViewChange,
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  members,
  stats,
  filteredCount,
  filtersActive
}: {
  view: ExecutionView;
  onViewChange: (v: ExecutionView) => void;
  filters: BoardFilters;
  onFiltersChange: (f: BoardFilters) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  members: string[];
  stats: BoardStats;
  filteredCount: number;
  filtersActive: boolean;
}) {
  const [panelOpen, setPanelOpen] = useState(false);

  function toggleIn<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  }

  return (
    <div className="ex-toolbar">
      <div className="ex-tabs" role="tablist" aria-label="Vistas del tablero">
        {(Object.keys(VIEW_LABELS) as ExecutionView[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            className={`ex-tab${view === key ? " active" : ""}`}
            onClick={() => onViewChange(key)}
          >
            <span aria-hidden>{VIEW_LABELS[key].icon}</span>
            {VIEW_LABELS[key].label}
          </button>
        ))}
      </div>

      <div className="ex-toolbar-controls">
        <input
          className="ex-search"
          type="search"
          value={filters.text}
          onChange={(e) => onFiltersChange({ ...filters, text: e.target.value })}
          placeholder="Buscar tarea…"
          aria-label="Buscar tarea"
        />
        <button
          type="button"
          className={filtersActive ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
          onClick={() => setPanelOpen((v) => !v)}
          aria-expanded={panelOpen}
        >
          Filtros{filtersActive ? ` · ${filteredCount}/${stats.total}` : ""}
        </button>
        <label className="ex-sort">
          <span className="text-xs">Ordenar</span>
          <select value={sort} onChange={(e) => onSortChange(e.target.value as SortKey)} aria-label="Ordenar tareas">
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className={filters.hideDone ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
          onClick={() => onFiltersChange({ ...filters, hideDone: !filters.hideDone })}
          title="Oculta tareas Hechas y Canceladas"
        >
          Solo trabajo vivo
        </button>
      </div>

      <div className="ex-chips">
        <StatChip label="Total" value={stats.total} color="var(--muted)" />
        <StatChip label={STATUS_META.InProgress.label} value={stats.inProgress} color={STATUS_META.InProgress.color} />
        <StatChip label={STATUS_META.Blocked.label} value={stats.blocked} color={STATUS_META.Blocked.color} />
        <StatChip label="Vencidas" value={stats.overdue} color="var(--danger)" />
        <StatChip label="Vencen ≤3d" value={stats.dueSoon} color="var(--warn)" />
        <StatChip label={STATUS_META.Completed.label} value={stats.done} color={STATUS_META.Completed.color} />
      </div>

      {panelOpen && (
        <div className="ex-filter-panel">
          <FilterGroup title="Estado">
            {STATUS_ORDER.map((status: TaskStatus) => (
              <button
                key={status}
                type="button"
                className={`ex-filter-pill${filters.statuses.includes(status) ? " active" : ""}`}
                style={{ borderColor: STATUS_META[status].color, color: STATUS_META[status].color }}
                onClick={() => onFiltersChange({ ...filters, statuses: toggleIn(filters.statuses, status) })}
              >
                {STATUS_META[status].label}
              </button>
            ))}
          </FilterGroup>

          <FilterGroup title="Prioridad">
            {PRIORITY_ORDER.map((priority: Priority) => (
              <button
                key={priority}
                type="button"
                className={`ex-filter-pill${filters.priorities.includes(priority) ? " active" : ""}`}
                style={{ borderColor: PRIORITY_META[priority].color, color: PRIORITY_META[priority].color }}
                onClick={() => onFiltersChange({ ...filters, priorities: toggleIn(filters.priorities, priority) })}
              >
                {PRIORITY_META[priority].label}
              </button>
            ))}
          </FilterGroup>

          <FilterGroup title="Fechas">
            {DATE_BUCKETS.map((bucket) => (
              <button
                key={bucket.key}
                type="button"
                className={`ex-filter-pill${filters.date === bucket.key ? " active" : ""}`}
                onClick={() => onFiltersChange({ ...filters, date: bucket.key })}
              >
                {bucket.label}
              </button>
            ))}
          </FilterGroup>

          {members.length > 0 && (
            <FilterGroup title="Personas">
              {members.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`ex-filter-pill${filters.people.includes(m) ? " active" : ""}`}
                  onClick={() => onFiltersChange({ ...filters, people: toggleIn(filters.people, m) })}
                >
                  {m}
                </button>
              ))}
            </FilterGroup>
          )}

          <div className="ex-filter-actions">
            <button type="button" className="btn-ghost btn-sm" onClick={() => onFiltersChange(EMPTY_FILTERS)}>
              Limpiar filtros
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setPanelOpen(false)}>
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <span className="ex-stat-chip" style={{ "--chip-color": color } as React.CSSProperties}>
      <b>{value}</b> {label}
    </span>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ex-filter-group">
      <span className="ex-filter-title">{title}</span>
      <div className="ex-filter-row">{children}</div>
    </div>
  );
}
