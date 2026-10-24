"use client";

// La barra de un proyecto. Arriba, fija: las vistas, la lupa y «Mostrar».
// Debajo, las fichas rápidas (Todo · Mías · Hoy · Vencidas · Semana).
//
// Se separa QUÉ se ve de CÓMO se ve, como en Linear:
//   - las fichas filtran, con un toque y sin hojas. Son excluyentes: en el
//     teléfono casi nunca se combinan filtros. Cada una dice cuántas tareas
//     vivas tiene, para saber antes de tocar;
//   - «Mostrar» (⋯) decide la forma de la Lista: agrupar, ordenar, ver lo
//     hecho. Al final lleva el filtro fino (prioridad, personas), que se usa
//     poco y por eso no ocupa la barra.
// Buscar ya no filtra: abre su propia pantalla (Busqueda.tsx).
//
// El selector de vistas usa la técnica de las pestañas duplicadas: debajo, la
// fila normal; encima, una copia pintada como «activa» y recortada con
// `clip-path` justo sobre la pestaña elegida. Al cambiar, el recorte se
// desliza, y el color del texto cambia exactamente en el borde del indicador
// —algo que animar colores por separado nunca consigue—.

import { useLayoutEffect, useRef, useState } from "react";
import { IconClose, IconSearch } from "@/components/icons";
import { EMPTY_FILTERS, type BoardFilters } from "@/lib/domain/board.ts";
import {
  PRESENTACION_INICIAL,
  RAPIDOS,
  type Agrupacion,
  type OrdenLista,
  type Presentacion,
  type Rapido
} from "@/lib/domain/execution/arbol.ts";
import type { Priority } from "@/lib/domain/types.ts";
import { PRIORITY_META, PRIORITY_ORDER } from "./status-meta";
import { VIEW_LABELS, type ExecutionView } from "./board-types";
import Sheet from "./ui/Sheet";

const AGRUPAR: { clave: Agrupacion; etiqueta: string }[] = [
  { clave: "principal", etiqueta: "Tarea" },
  { clave: "estado", etiqueta: "Estado" },
  { clave: "fecha", etiqueta: "Fecha" },
  { clave: "ninguno", etiqueta: "Nada" }
];
const ORDENAR: { clave: OrdenLista; etiqueta: string }[] = [
  { clave: "manual", etiqueta: "Manual" },
  { clave: "fecha", etiqueta: "Fecha" },
  { clave: "prioridad", etiqueta: "Prioridad" }
];

/** Filtros finos activos (los de la hoja, no las fichas). */
export function filtrosFinos(f: BoardFilters): number {
  return (f.priorities.length ? 1 : 0) + (f.people.length ? 1 : 0);
}

export default function BoardToolbar({
  view,
  views,
  onViewChange,
  rapido,
  onRapidoChange,
  cuentas,
  conMias,
  filters,
  onFiltersChange,
  members,
  presentacion,
  onPresentacionChange,
  onBuscar
}: {
  view: ExecutionView;
  /** Qué pestañas se ofrecen. Ver VIEWS_CON_HILO/VIEWS_SIN_HILO en board-types. */
  views: ExecutionView[];
  onViewChange: (v: ExecutionView) => void;
  rapido: Rapido;
  onRapidoChange: (r: Rapido) => void;
  /** Tareas vivas por ficha. */
  cuentas: Partial<Record<Rapido, number>>;
  /** «Mías» solo con equipo: en el espacio personal todo es de uno. */
  conMias: boolean;
  /** Solo los filtros finos (prioridad, personas). */
  filters: BoardFilters;
  onFiltersChange: (f: BoardFilters) => void;
  members: string[];
  presentacion: Presentacion;
  onPresentacionChange: (p: Presentacion) => void;
  /** Debe abrir y enfocar la búsqueda en el mismo toque (ver Busqueda.tsx). */
  onBuscar: () => void;
}) {
  const [hojaAbierta, setHojaAbierta] = useState(false);
  const finos = filtrosFinos(filters);
  const enLista = view === "lista";
  const cambiada =
    enLista &&
    (presentacion.agrupar !== PRESENTACION_INICIAL.agrupar ||
      presentacion.orden !== PRESENTACION_INICIAL.orden ||
      presentacion.hechas !== PRESENTACION_INICIAL.hechas);
  // Las fichas no aplican al hilo: es una conversación, no tareas.
  const conFichas = view !== "hilo";

  return (
    <>
      <div className="xr-barra">
        <SelectorDeVistas views={views} view={view} onChange={onViewChange} />
        <div className="xr-barra-acciones">
          <button type="button" className="xr-icono-btn" onClick={onBuscar} aria-label="Buscar">
            <IconSearch width={18} height={18} />
          </button>
          <button
            type="button"
            className="xr-icono-btn"
            data-activo={finos > 0 || cambiada || undefined}
            onClick={() => setHojaAbierta(true)}
            aria-label={finos ? `Mostrar y filtrar (${finos} filtros)` : "Mostrar y filtrar"}
          >
            <IconoMas />
            {finos > 0 && <span className="xr-contador">{finos}</span>}
          </button>
        </div>
      </div>

      {conFichas && (
        <div className="xr-rapidos" role="toolbar" aria-label="Filtrar tareas">
          {RAPIDOS.filter((r) => conMias || r.clave !== "mias").map((r) => {
            const n = cuentas[r.clave];
            return (
              <button
                key={r.clave}
                type="button"
                className="xr-ficha-btn"
                aria-pressed={rapido === r.clave}
                data-alerta={(r.clave === "vencidas" && n) || undefined}
                onClick={() => onRapidoChange(r.clave)}
              >
                {r.etiqueta}
                {r.clave !== "todo" && n ? <span className="xr-ficha-cuenta">{n}</span> : null}
              </button>
            );
          })}
          {finos > 0 && (
            <button
              type="button"
              className="xr-ficha-btn"
              aria-pressed="true"
              onClick={() => onFiltersChange(EMPTY_FILTERS)}
              aria-label="Quitar los filtros de prioridad y personas"
            >
              {finos === 1 ? "1 filtro" : `${finos} filtros`}
              <IconClose width={13} height={13} />
            </button>
          )}
        </div>
      )}

      <Sheet
        open={hojaAbierta}
        onClose={() => setHojaAbierta(false)}
        title={enLista ? "Mostrar" : "Filtrar"}
        size="sm"
        footer={
          <div className="xr-pie-acciones">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => {
                onFiltersChange(EMPTY_FILTERS);
                if (enLista) onPresentacionChange(PRESENTACION_INICIAL);
              }}
              disabled={!finos && !cambiada}
            >
              Restablecer
            </button>
            <button type="button" className="btn-primary" onClick={() => setHojaAbierta(false)}>
              Listo
            </button>
          </div>
        }
      >
        <div className="xr-filtros">
          {enLista && (
            <>
              <section className="xr-ajuste">
                <h3 className="xr-etiqueta">Agrupar por</h3>
                <Segmentos
                  opciones={AGRUPAR}
                  valor={presentacion.agrupar}
                  onChange={(agrupar) => onPresentacionChange({ ...presentacion, agrupar })}
                  etiqueta="Agrupar por"
                />
              </section>
              <section className="xr-ajuste">
                <h3 className="xr-etiqueta">Ordenar</h3>
                <Segmentos
                  opciones={ORDENAR}
                  valor={presentacion.orden}
                  onChange={(orden) => onPresentacionChange({ ...presentacion, orden })}
                  etiqueta="Ordenar"
                />
              </section>
              <label className="xr-interruptor-fila">
                <span>Mostrar lo hecho en su sitio</span>
                <Interruptor checked={presentacion.hechas} onChange={(hechas) => onPresentacionChange({ ...presentacion, hechas })} />
              </label>
            </>
          )}
          <FiltrosFinos filters={filters} onChange={onFiltersChange} members={members} />
        </div>
      </Sheet>
    </>
  );
}

function IconoMas() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="4" cy="9" r="1.5" fill="currentColor" />
      <circle cx="9" cy="9" r="1.5" fill="currentColor" />
      <circle cx="14" cy="9" r="1.5" fill="currentColor" />
    </svg>
  );
}

function Segmentos<T extends string>({
  opciones,
  valor,
  onChange,
  etiqueta
}: {
  opciones: { clave: T; etiqueta: string }[];
  valor: T;
  onChange: (v: T) => void;
  etiqueta: string;
}) {
  return (
    <div className="xr-segmentos xr-segmentos-ancho" role="radiogroup" aria-label={etiqueta}>
      {opciones.map((o) => (
        <button
          key={o.clave}
          type="button"
          role="radio"
          aria-checked={valor === o.clave}
          className="xr-segmento"
          onClick={() => onChange(o.clave)}
        >
          {o.etiqueta}
        </button>
      ))}
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
    // Hasta medir (antes de hidratar) no hay recorte: la pestaña activa se
    // pinta sola por CSS para que nunca se vea el selector sin elegida.
    <div className="xr-vistas" ref={contenedor} role="tablist" aria-label="Vistas del proyecto" data-medido={Boolean(recorte) || undefined}>
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

function FiltrosFinos({ filters, onChange, members }: { filters: BoardFilters; onChange: (f: BoardFilters) => void; members: string[] }) {
  function alternar<T>(lista: T[], valor: T): T[] {
    return lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor];
  }

  return (
    <>
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
    </>
  );
}

export function Interruptor({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className="xr-interruptor" onClick={() => onChange(!checked)}>
      <span className="xr-interruptor-bola" />
    </button>
  );
}
