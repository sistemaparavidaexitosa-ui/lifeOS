"use client";
// Ribbon del tablero, al estilo de monday.com: una fila de acciones planas
// (buscar / persona / filtro / ordenar / status / fechas) debajo de las
// pestañas de vista.
//
// POR QUÉ ASÍ
//   - Antes la barra apilaba TRES bloques: pestañas, una fila con input +
//     botones sueltos, y un resumen de 6 chips de estado. Ocupaba media
//     pantalla antes de mostrar una sola tarea, y el resumen repetía lo que
//     el propio tablero ya dice (cada fila lleva su estado y su fecha).
//   - Ahora cada control es un botón plano con ícono que abre su popover.
//     Los filtros activos se ven en el propio botón (tinte + contador), así
//     que no hace falta un panel siempre abierto ni una fila de estadísticas.
//
// El filtro sigue siendo UNO solo para las 4 vistas: BoardShell filtra con
// filterTaskTree() y les pasa el resultado ya filtrado.
import { useEffect, useRef, useState, type ReactNode } from "react";
import MenuSurface, { useMenuAnchor } from "./MenuSurface";
import { STATUS_META, STATUS_ORDER, PRIORITY_META, PRIORITY_ORDER } from "./status-meta";
import { VIEW_LABELS, type ExecutionView } from "./board-types";
import { EMPTY_FILTERS, type BoardFilters, type DateBucket, type SortKey } from "@/lib/domain/board.ts";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";
import {
  IconCalendar,
  IconChevronDown,
  IconClose,
  IconFilter,
  IconSearch,
  IconSort,
  IconStatus,
  IconUser,
  type IconProps
} from "@/components/icons";

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
  filtersActive
}: {
  view: ExecutionView;
  onViewChange: (v: ExecutionView) => void;
  filters: BoardFilters;
  onFiltersChange: (f: BoardFilters) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  members: string[];
  filtersActive: boolean;
}) {
  function toggleIn<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  }

  // "Filtro" recoge lo que no tiene botón propio en el ribbon.
  const extraFilters = (filters.priorities.length ? 1 : 0) + (filters.hideDone ? 1 : 0);

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

      <div className="ex-ribbon" role="toolbar" aria-label="Herramientas del tablero">
        <RibbonSearch value={filters.text} onChange={(text) => onFiltersChange({ ...filters, text })} />

        <RibbonMenu icon={IconUser} label="Persona" count={filters.people.length} width={230}>
          {() => (
            <div className="ex-menu-list">
              <span className="ex-menu-title">Responsables</span>
              {members.length === 0 ? (
                <span className="ex-menu-empty">Este tablero todavía no tiene responsables.</span>
              ) : (
                <div className="ex-menu-scroll">
                  {members.map((m) => (
                    <label key={m} className="ex-menu-check">
                      <input
                        type="checkbox"
                        checked={filters.people.includes(m)}
                        onChange={() => onFiltersChange({ ...filters, people: toggleIn(filters.people, m) })}
                      />
                      <span className="ex-rib-avatar" aria-hidden>
                        {initials(m)}
                      </span>
                      {m}
                    </label>
                  ))}
                </div>
              )}
              {filters.people.length > 0 && (
                <div className="ex-menu-actions">
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => onFiltersChange({ ...filters, people: [] })}
                  >
                    Limpiar
                  </button>
                </div>
              )}
            </div>
          )}
        </RibbonMenu>

        <RibbonMenu icon={IconFilter} label="Filtro" count={extraFilters} caret width={264}>
          {(close) => (
            <div className="ex-menu-list">
              <span className="ex-menu-title">Prioridad</span>
              <div className="ex-filter-row">
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
              </div>

              <label className="ex-menu-check">
                <input
                  type="checkbox"
                  checked={filters.hideDone}
                  onChange={() => onFiltersChange({ ...filters, hideDone: !filters.hideDone })}
                />
                Solo trabajo vivo
              </label>

              <div className="ex-menu-actions">
                <button type="button" className="btn-ghost btn-sm" onClick={() => onFiltersChange(EMPTY_FILTERS)}>
                  Limpiar todo
                </button>
                <button type="button" className="btn-primary btn-sm" onClick={close}>
                  Listo
                </button>
              </div>
            </div>
          )}
        </RibbonMenu>

        <RibbonMenu icon={IconSort} label="Ordenar" value={sort === "manual" ? null : sortLabel(sort)} width={232}>
          {(close) => (
            <div className="ex-menu-list">
              <span className="ex-menu-title">Ordenar por</span>
              <div className="ex-menu-scroll">
                {SORTS.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className={`ex-menu-opt${sort === s.key ? " active" : ""}`}
                    onClick={() => {
                      onSortChange(s.key);
                      close();
                    }}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </RibbonMenu>

        <RibbonMenu icon={IconStatus} label="Status" count={filters.statuses.length} width={214}>
          {() => (
            <div className="ex-menu-list">
              <span className="ex-menu-title">Estado</span>
              <div className="ex-menu-scroll">
                {STATUS_ORDER.map((status: TaskStatus) => (
                  <label key={status} className="ex-menu-check">
                    <input
                      type="checkbox"
                      checked={filters.statuses.includes(status)}
                      onChange={() => onFiltersChange({ ...filters, statuses: toggleIn(filters.statuses, status) })}
                    />
                    <span className="ex-rib-dot" style={{ background: STATUS_META[status].color }} aria-hidden />
                    {STATUS_META[status].label}
                  </label>
                ))}
              </div>
            </div>
          )}
        </RibbonMenu>

        <RibbonMenu
          icon={IconCalendar}
          label="Fechas"
          value={filters.date === "all" ? null : dateLabel(filters.date)}
          width={206}
        >
          {(close) => (
            <div className="ex-menu-list">
              <span className="ex-menu-title">Vencimiento</span>
              <div className="ex-menu-scroll">
                {DATE_BUCKETS.map((bucket) => (
                  <button
                    key={bucket.key}
                    type="button"
                    className={`ex-menu-opt${filters.date === bucket.key ? " active" : ""}`}
                    onClick={() => {
                      onFiltersChange({ ...filters, date: bucket.key });
                      close();
                    }}
                  >
                    {bucket.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </RibbonMenu>

        {filtersActive && (
          <button
            type="button"
            className="ex-rib-btn ex-rib-clear"
            onClick={() => onFiltersChange(EMPTY_FILTERS)}
            title="Quitar todos los filtros"
          >
            <IconClose aria-hidden />
            <span>Limpiar</span>
          </button>
        )}
      </div>
    </div>
  );
}

/** Buscador estilo monday: es un botón hasta que lo pulsas; ahí se abre el campo. */
function RibbonSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  // Con texto escrito se queda abierto: cerrar el campo escondería un filtro activo.
  const expanded = open || value.trim().length > 0;

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!expanded) {
    return (
      <button type="button" className="ex-rib-btn" onClick={() => setOpen(true)}>
        <IconSearch aria-hidden />
        <span>Buscar</span>
      </button>
    );
  }

  return (
    <div className="ex-rib-search">
      <IconSearch aria-hidden />
      <input
        ref={inputRef}
        type="text"
        value={value}
        placeholder="Buscar tarea…"
        aria-label="Buscar tarea"
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value.trim()) setOpen(false);
        }}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          onChange("");
          setOpen(false);
        }}
      />
      {value.length > 0 && (
        <button
          type="button"
          className="ex-rib-x"
          aria-label="Limpiar búsqueda"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
        >
          <IconClose aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * Botón plano del ribbon + su popover. Cada control lleva su propio anclaje,
 * así que abrir uno cierra el anterior sin coordinación entre ellos (el
 * backdrop de MenuSurface se encarga).
 */
function RibbonMenu({
  icon: Icon,
  label,
  count = 0,
  value = null,
  caret = false,
  width,
  children
}: {
  icon: (p: IconProps) => ReactNode;
  label: string;
  /** Nº de opciones marcadas: pinta el botón como activo y muestra la cifra. */
  count?: number;
  /** Alternativa al contador para controles de opción única (orden, fechas). */
  value?: string | null;
  caret?: boolean;
  width?: number;
  children: (close: () => void) => ReactNode;
}) {
  const menu = useMenuAnchor();
  const active = count > 0 || value !== null;

  return (
    <>
      <button
        type="button"
        className={`ex-rib-btn${active ? " active" : ""}${menu.open ? " open" : ""}`}
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
      >
        <Icon aria-hidden />
        <span>{label}</span>
        {count > 0 && <span className="ex-rib-count">{count}</span>}
        {value !== null && <span className="ex-rib-value">{value}</span>}
        {caret && <IconChevronDown className="ex-rib-caret" aria-hidden />}
      </button>
      {menu.open && (
        <MenuSurface anchor={menu.anchor} onClose={menu.close} align="start" width={width} label={label}>
          {children(menu.close)}
        </MenuSurface>
      )}
    </>
  );
}

function sortLabel(sort: SortKey): string {
  return SORTS.find((s) => s.key === sort)?.label ?? "";
}

function dateLabel(bucket: DateBucket): string {
  return DATE_BUCKETS.find((b) => b.key === bucket)?.label ?? "";
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
