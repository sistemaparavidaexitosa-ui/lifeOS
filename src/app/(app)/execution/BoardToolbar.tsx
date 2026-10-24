"use client";

// La barra de un proyecto: vistas a la izquierda, buscar y filtrar a la derecha.
//
// El selector de vistas usa la técnica de las pestañas duplicadas: debajo, la
// fila normal; encima, una copia pintada como «activa» y recortada con
// `clip-path` justo sobre la pestaña elegida. Al cambiar, el recorte se
// desliza, y el color del texto cambia exactamente en el borde del indicador
// —algo que animar colores por separado nunca consigue—.
//
// Los filtros dejan de ser seis menús sueltos: una sola hoja con todo, que en
// el iPhone sube desde abajo. El botón dice cuántos hay activos.

import { useLayoutEffect, useRef, useState } from "react";
import { IconFilter, IconSearch, IconClose } from "@/components/icons";
import { EMPTY_FILTERS, activeFilterCount, type BoardFilters, type DateBucket } from "@/lib/domain/board.ts";
import type { TaskStatus, Priority } from "@/lib/domain/types.ts";
import { STATUS_META, STATUS_ORDER, PRIORITY_META, PRIORITY_ORDER } from "./status-meta";
import { VIEW_LABELS, type ExecutionView } from "./board-types";
import Sheet from "./ui/Sheet";
import { IconoEstado } from "./ui/iconos";

const FECHAS: { key: DateBucket; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "overdue", label: "Vencidas" },
  { key: "today", label: "Hoy" },
  { key: "week", label: "7 días" },
  { key: "nodate", label: "Sin fecha" }
];

export default function BoardToolbar({
  view,
  views,
  onViewChange,
  filters,
  onFiltersChange,
  members
}: {
  view: ExecutionView;
  /** Qué pestañas se ofrecen. Ver VIEWS_CON_HILO/VIEWS_SIN_HILO en board-types. */
  views: ExecutionView[];
  onViewChange: (v: ExecutionView) => void;
  filters: BoardFilters;
  onFiltersChange: (f: BoardFilters) => void;
  members: string[];
}) {
  const [buscando, setBuscando] = useState(Boolean(filters.text));
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const busqueda = useRef<HTMLInputElement>(null);
  // El texto tiene su propio campo; el contador del botón cuenta lo demás.
  const activos = activeFilterCount({ ...filters, text: "" });

  return (
    <div className="xr-barra">
      {/* Vistas: un toque, sin animación de contenido (se usa muchas veces). */}
      {!buscando && <SelectorDeVistas views={views} view={view} onChange={onViewChange} />}

      {buscando && (
        <div className="xr-buscar">
          <IconSearch width={16} height={16} aria-hidden />
          <input
            ref={busqueda}
            type="search"
            value={filters.text}
            onChange={(e) => onFiltersChange({ ...filters, text: e.target.value })}
            placeholder="Buscar en el proyecto"
            aria-label="Buscar en el proyecto"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onFiltersChange({ ...filters, text: "" });
                setBuscando(false);
              }
            }}
          />
          <button
            type="button"
            className="xr-icono-btn"
            aria-label="Cerrar búsqueda"
            onClick={() => {
              onFiltersChange({ ...filters, text: "" });
              setBuscando(false);
            }}
          >
            <IconClose width={16} height={16} />
          </button>
        </div>
      )}

      <div className="xr-barra-acciones">
        {!buscando && (
          <button type="button" className="xr-icono-btn" onClick={() => setBuscando(true)} aria-label="Buscar">
            <IconSearch width={18} height={18} />
          </button>
        )}
        <button
          type="button"
          className="xr-icono-btn"
          data-activo={activos > 0 || undefined}
          onClick={() => setHojaAbierta(true)}
          aria-label={activos ? `Filtros (${activos} activos)` : "Filtros"}
        >
          <IconFilter width={18} height={18} />
          {activos > 0 && <span className="xr-contador">{activos}</span>}
        </button>
      </div>

      <Sheet
        open={hojaAbierta}
        onClose={() => setHojaAbierta(false)}
        title="Filtros"
        size="sm"
        footer={
          <div className="xr-pie-acciones">
            <button type="button" className="btn-ghost" onClick={() => onFiltersChange({ ...EMPTY_FILTERS, text: filters.text })} disabled={!activos}>
              Limpiar
            </button>
            <button type="button" className="btn-primary" onClick={() => setHojaAbierta(false)}>
              Listo
            </button>
          </div>
        }
      >
        <Filtros filters={filters} onChange={onFiltersChange} members={members} />
      </Sheet>
    </div>
  );
}

function SelectorDeVistas({
  views,
  view,
  onChange
}: {
  views: ExecutionView[];
  view: ExecutionView;
  onChange: (v: ExecutionView) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const activa = useRef<HTMLButtonElement>(null);
  const [recorte, setRecorte] = useState<string | null>(null);

  // El recorte se mide antes de pintar para no ver un fotograma sin indicador.
  useLayoutEffect(() => {
    const c = contenedor.current;
    const a = activa.current;
    if (!c || !a) return;
    const medir = () => {
      const izq = a.offsetLeft;
      const der = c.offsetWidth - (a.offsetLeft + a.offsetWidth);
      setRecorte(`inset(3px ${der}px 3px ${izq}px round 999px)`);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    return () => ro.disconnect();
  }, [view, views]);

  // Una vista que ya no se ofrece (?view=table de un enlace viejo) no tiene
  // pestaña: el indicador se esconde en vez de señalar otra.
  const ofrecida = views.includes(view);

  return (
    <div className="xr-vistas" ref={contenedor} role="tablist" aria-label="Vistas del proyecto">
      {views.map((key) => (
        <button
          key={key}
          ref={key === view ? activa : undefined}
          type="button"
          role="tab"
          aria-selected={view === key}
          className="xr-vista"
          onClick={() => onChange(key)}
        >
          {VIEW_LABELS[key].label}
        </button>
      ))}
      {ofrecida && recorte && (
        <div className="xr-vistas-activa" aria-hidden style={{ clipPath: recorte }}>
          {views.map((key) => (
            <span key={key} className="xr-vista">
              {VIEW_LABELS[key].label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Filtros({ filters, onChange, members }: { filters: BoardFilters; onChange: (f: BoardFilters) => void; members: string[] }) {
  function alternar<T>(lista: T[], valor: T): T[] {
    return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
  }

  return (
    <div className="xr-filtros">
      <section>
        <h3 className="xr-etiqueta">Vencimiento</h3>
        <div className="xr-fichas">
          {FECHAS.map((f) => (
            <button
              key={f.key}
              type="button"
              className="xr-ficha-btn"
              aria-pressed={filters.date === f.key}
              onClick={() => onChange({ ...filters, date: f.key })}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h3 className="xr-etiqueta">Estado</h3>
        <div className="xr-fichas">
          {STATUS_ORDER.map((s: TaskStatus) => (
            <button
              key={s}
              type="button"
              className="xr-ficha-btn"
              aria-pressed={filters.statuses.includes(s)}
              onClick={() => onChange({ ...filters, statuses: alternar(filters.statuses, s) })}
            >
              <IconoEstado estado={s} size={14} />
              {STATUS_META[s].label}
            </button>
          ))}
        </div>
        <label className="xr-interruptor-fila">
          <span>Ocultar lo hecho y cancelado</span>
          <Interruptor checked={filters.hideDone} onChange={(hideDone) => onChange({ ...filters, hideDone })} />
        </label>
      </section>

      <section>
        <h3 className="xr-etiqueta">Prioridad</h3>
        <div className="xr-fichas">
          {PRIORITY_ORDER.map((p: Priority) => (
            <button
              key={p}
              type="button"
              className="xr-ficha-btn"
              aria-pressed={filters.priorities.includes(p)}
              onClick={() => onChange({ ...filters, priorities: alternar(filters.priorities, p) })}
            >
              <span className="xr-punto" style={{ background: PRIORITY_META[p].color }} />
              {PRIORITY_META[p].label}
            </button>
          ))}
        </div>
      </section>

      {members.length > 1 && (
        <section>
          <h3 className="xr-etiqueta">Responsables</h3>
          <div className="xr-fichas">
            {members.map((m) => (
              <button
                key={m}
                type="button"
                className="xr-ficha-btn"
                aria-pressed={filters.people.includes(m)}
                onClick={() => onChange({ ...filters, people: alternar(filters.people, m) })}
              >
                {m}
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function Interruptor({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="xr-interruptor" onClick={() => onChange(!checked)}>
      <span className="xr-interruptor-bola" />
    </button>
  );
}
