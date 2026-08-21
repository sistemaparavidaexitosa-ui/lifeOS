"use client";
// Vista "Timeline" (Gantt ligero) — la que faltaba para responder de un
// vistazo "¿qué se traslapa y qué se me viene encima?".
//
// Dibuja una barra por tarea entre start_date y due (una tarea con solo
// `due` se ve como hito de 1 día), agrupadas por grupo del tablero, con la
// línea de HOY y escala de semanas. Todo el cálculo del rango y de la
// posición/ancho de cada barra es puro y está testeado: timelineRange() y
// timelineBar() en src/lib/domain/board.ts.
import { useMemo } from "react";
import { addDaysISO, diffDays, isOverdue, sortTasks, timelineBar, timelineRange } from "@/lib/domain/board.ts";
import { STATUS_META } from "./status-meta";
import type { BoardApi, BoardTask } from "./board-types";

function label(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("es-MX", { day: "2-digit", month: "short" });
}

export default function TimelineView({ api, tasks, today }: { api: BoardApi; tasks: BoardTask[]; today: string }) {
  const range = useMemo(() => timelineRange(tasks, today), [tasks, today]);
  const groupById = useMemo(() => new Map(api.groups.map((g) => [g.id, g])), [api.groups]);

  const scheduled = useMemo(() => sortTasks(tasks.filter((t) => t.due || t.startDate), "due"), [tasks]);
  const unscheduled = useMemo(() => tasks.filter((t) => !t.due && !t.startDate), [tasks]);

  // Marcas de semana: una etiqueta cada 7 días dentro del rango.
  const ticks = useMemo(() => {
    const out: { iso: string; offsetPct: number }[] = [];
    for (let day = 0; day < range.days; day += 7) {
      out.push({ iso: addDaysISO(range.start, day), offsetPct: (day / range.days) * 100 });
    }
    return out;
  }, [range]);

  const todayPct = ((diffDays(range.start, today) + 0.5) / range.days) * 100;

  const byGroup = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    for (const t of scheduled) {
      const key = t.groupId ?? "__ungrouped__";
      map.set(key, [...(map.get(key) ?? []), t]);
    }
    return map;
  }, [scheduled]);

  return (
    <div className="tl-wrap card">
      <div className="tl-head">
        <span className="tl-rowlabel text-xs">
          {label(range.start)} → {label(range.end)}
        </span>
        <div className="tl-track tl-ticks">
          {ticks.map((tick) => (
            <span key={tick.iso} className="tl-tick" style={{ left: `${tick.offsetPct}%` }}>
              {label(tick.iso)}
            </span>
          ))}
        </div>
      </div>

      {[...byGroup.entries()].map(([groupId, groupTasks]) => {
        const group = groupById.get(groupId);
        return (
          <div key={groupId} className="tl-group">
            <div className="tl-group-name" style={{ color: group?.color ?? "var(--muted)" }}>
              ● {group?.name ?? "Sin grupo"}
            </div>
            {groupTasks.map((t) => {
              const bar = timelineBar(t, range);
              if (!bar) return null;
              const late = isOverdue(t, today);
              return (
                <div key={t.id} className="tl-row">
                  <button type="button" className="tl-rowlabel" onClick={() => api.openDetail(t.id)} title={t.title}>
                    {t.parentTaskId ? "↳ " : ""}
                    {t.title}
                  </button>
                  <div className="tl-track">
                    {ticks.map((tick) => (
                      <span key={tick.iso} className="tl-gridline" style={{ left: `${tick.offsetPct}%` }} />
                    ))}
                    <span className="tl-today" style={{ left: `${todayPct}%` }} aria-hidden />
                    <button
                      type="button"
                      className={`tl-bar${late ? " overdue" : ""}`}
                      style={{
                        left: `${bar.offsetPct}%`,
                        width: `${bar.widthPct}%`,
                        background: STATUS_META[t.status].color
                      }}
                      onClick={() => api.openDetail(t.id)}
                      title={`${t.title} · ${label(bar.start)} → ${label(bar.end)} · ${STATUS_META[t.status].label}`}
                    >
                      <span>{label(bar.end)}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {!scheduled.length && <p className="tl-empty text-sm">Ninguna tarea tiene fechas todavía — asígnalas desde la columna “Fechas”.</p>}

      {unscheduled.length > 0 && (
        <div className="tl-unscheduled">
          <b className="text-xs">Sin fechas ({unscheduled.length})</b>
          <div className="tl-unscheduled-list">
            {unscheduled.map((t) => (
              <button key={t.id} type="button" className="chip" onClick={() => api.openDetail(t.id)}>
                {t.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
