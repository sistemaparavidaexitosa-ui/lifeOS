"use client";
// Encabezado de grupo del tablero. Antes era solo "nombre + contador +
// borrar"; ahora concentra lo que monday.com pone en la cabecera de un
// grupo: colapsar, seleccionar todo, progreso real, distribución de estados,
// color y reordenar el grupo.
import { useState } from "react";
import { computeStats } from "@/lib/domain/board.ts";
import { STATUS_META, STATUS_ORDER, GROUP_COLORS } from "./status-meta";
import type { BoardGroup, BoardTask } from "./board-types";
import { IconChevronDown, IconChevronRight, IconTrash } from "@/components/icons";

export default function GroupHeader({
  group,
  today,
  tasks,
  rootCount,
  collapsed,
  allSelected,
  canDelete,
  canMoveUp,
  canMoveDown,
  onToggleCollapsed,
  onRename,
  onColor,
  onDelete,
  onMove,
  onSelectAll
}: {
  group: BoardGroup;
  /** "Hoy" del perfil — mismo valor en todas las vistas. */
  today: string;
  tasks: BoardTask[];
  rootCount: number;
  collapsed: boolean;
  allSelected: boolean;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onToggleCollapsed: () => void;
  onRename: (name: string) => void;
  onColor: (color: string) => void;
  onDelete: () => void;
  onMove: (direction: -1 | 1) => void;
  onSelectAll: (next: boolean) => void;
}) {
  const [name, setName] = useState(group.name);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const stats = computeStats(tasks, today);

  function saveName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === group.name) {
      setName(group.name);
      return;
    }
    onRename(trimmed);
  }

  return (
    <header className="mb-group-head">
      <button
        type="button"
        className="mb-expand"
        onClick={onToggleCollapsed}
        aria-expanded={!collapsed}
        aria-label={collapsed ? `Expandir grupo ${group.name}` : `Colapsar grupo ${group.name}`}
      >
        {collapsed ? <IconChevronRight /> : <IconChevronDown />}
      </button>

      <input
        type="checkbox"
        className="mb-check"
        checked={allSelected}
        onChange={(e) => onSelectAll(e.target.checked)}
        aria-label={`Seleccionar todas las tareas de ${group.name}`}
        disabled={!tasks.length}
      />

      <input
        className="mb-group-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        aria-label="Nombre del grupo"
      />

      <span className="mb-badge-count">{rootCount}</span>

      {stats.total > 0 && (
        <>
          <span className="mb-statusbar" title={`${stats.done} de ${stats.total} completadas`} aria-hidden>
            {STATUS_ORDER.filter((s) => stats.byStatus[s] > 0).map((s) => (
              <i
                key={s}
                style={{ width: `${(stats.byStatus[s] / stats.total) * 100}%`, background: STATUS_META[s].color }}
              />
            ))}
          </span>
          <span className="mb-group-pct">{stats.pct}%</span>
          {stats.overdue > 0 && (
            <span className="chip bad" title="Tareas vencidas en este grupo">
              {stats.overdue} vencida{stats.overdue > 1 ? "s" : ""}
            </span>
          )}
        </>
      )}

      <div className="mb-group-actions">
        <div className="mb-color-wrap">
          <button
            type="button"
            className="mb-color-dot"
            style={{ background: group.color }}
            onClick={() => setPaletteOpen((v) => !v)}
            aria-label="Color del grupo"
            aria-expanded={paletteOpen}
          />
          {paletteOpen && (
            <>
              <div className="ex-backdrop" onClick={() => setPaletteOpen(false)} />
              <div className="mb-palette card">
                {GROUP_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="mb-color-dot"
                    style={{ background: color }}
                    aria-label={`Usar color ${color}`}
                    onClick={() => {
                      onColor(color);
                      setPaletteOpen(false);
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          className="mb-icon-btn"
          onClick={() => onMove(-1)}
          disabled={!canMoveUp}
          aria-label="Subir grupo"
          title="Subir grupo"
        >
          ↑
        </button>
        <button
          type="button"
          className="mb-icon-btn"
          onClick={() => onMove(1)}
          disabled={!canMoveDown}
          aria-label="Bajar grupo"
          title="Bajar grupo"
        >
          ↓
        </button>
        {canDelete && (
          <button
            type="button"
            className="mb-icon-btn danger"
            onClick={onDelete}
            aria-label={`Eliminar grupo ${group.name}`}
            title="Eliminar grupo"
          >
            <IconTrash />
          </button>
        )}
      </div>
    </header>
  );
}
