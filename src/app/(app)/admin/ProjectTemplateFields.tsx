"use client";
// Los campos de una plantilla de proyecto: grupos, tareas y subtareas.
//
// LO QUE NO SE PUEDE ESCRIBIR AQUÍ, Y ES A PROPÓSITO: fechas, «tarea de
// impacto» y dependencias. No es que el formulario se haya quedado corto — son
// las tres ausencias que documenta project-templates.ts:
//
//   - una fecha inventada deja medio tablero vencido al mes siguiente, y ese
//     atraso falso se cuela en Home y en el hecho `execution.overdue`;
//   - `impact` alimenta «tres tareas de impacto» del día, y cuáles lo son esta
//     semana es del usuario, no de la plantilla;
//   - las dependencias no resuelven nada que el orden de los grupos no diga ya.
//
// El horizonte se pone en el NOMBRE del grupo («Fase 1 · Grind (mes 1-4)»),
// que informa sin prometer.
//
// El color se elige de la paleta y no con un selector libre: un `#hex`
// inventado rompe el tema claro/oscuro, que se apoya en los tokens.

import {
  TEMPLATE_CATEGORIES,
  GROUP_COLORS,
  type ProjectTemplate,
  type ProjectTemplateGroup,
  type ProjectTemplateTask
} from "@/lib/domain/execution/project-templates.ts";

const PRIORIDADES = ["High", "Medium", "Low"] as const;

export default function ProjectTemplateFields({
  value,
  onChange
}: {
  value: ProjectTemplate;
  onChange: (v: ProjectTemplate) => void;
}) {
  const set = (parche: Partial<ProjectTemplate>) => onChange({ ...value, ...parche });

  const setGrupo = (i: number, parche: Partial<ProjectTemplateGroup>) =>
    set({ groups: value.groups.map((g, j) => (j === i ? { ...g, ...parche } : g)) });

  const setTarea = (gi: number, ti: number, parche: Partial<ProjectTemplateTask>) => {
    const grupo = value.groups[gi];
    if (!grupo) return;
    setGrupo(gi, { tasks: grupo.tasks.map((t, j) => (j === ti ? { ...t, ...parche } : t)) });
  };

  const moverGrupo = (i: number, delta: number) => {
    const destino = i + delta;
    const grupos = [...value.groups];
    const actual = grupos[i];
    const otro = grupos[destino];
    if (!actual || !otro) return;
    grupos[i] = otro;
    grupos[destino] = actual;
    set({ groups: grupos });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="field">
        <label className="block text-xs font-bold mb-1">Nombre</label>
        <input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="Producto de software · de la idea a la v1" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Categoría</label>
          <select value={value.category} onChange={(e) => set({ category: e.target.value as ProjectTemplate["category"] })}>
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <p className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
            Es lo que agrupa el selector.
          </p>
        </div>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Fuente (opcional)</label>
          <input
            value={value.source ?? ""}
            onChange={(e) => set({ source: e.target.value || undefined })}
            placeholder="El método Lean Startup, de Eric Ries"
          />
        </div>
      </div>

      <div className="field">
        <label className="block text-xs font-bold mb-1">Resumen</label>
        <textarea rows={2} value={value.summary} onChange={(e) => set({ summary: e.target.value })} />
        <p className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
          Una línea: qué proyecto es este y cuándo elegirlo. Se lee justo antes de aplicarlo.
        </p>
      </div>

      <div>
        <label className="block text-xs font-bold mb-1">Grupos</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {value.groups.map((grupo, gi) => (
            <div key={gi} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 8, borderLeft: `3px solid ${grupo.color}` }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: 6, alignItems: "end" }}>
                <div className="field">
                  <label className="block text-xs mb-1">Nombre del grupo</label>
                  <input
                    value={grupo.name}
                    onChange={(e) => setGrupo(gi, { name: e.target.value })}
                    placeholder="Fase 1 · Grind (mes 1-4)"
                  />
                </div>
                <div className="field">
                  <label className="block text-xs mb-1">Color</label>
                  <select value={grupo.color} onChange={(e) => setGrupo(gi, { color: e.target.value })}>
                    {GROUP_COLORS.map((c) => (
                      <option key={c} value={c}>
                        {c.replace("var(--c-", "").replace(")", "")}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => moverGrupo(gi, -1)} aria-label="Subir grupo">
                    ↑
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => moverGrupo(gi, 1)} aria-label="Bajar grupo">
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    onClick={() => set({ groups: value.groups.filter((_, j) => j !== gi) })}
                    aria-label="Quitar grupo"
                  >
                    ×
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {grupo.tasks.map((tarea, ti) => (
                  <div key={ti} style={{ paddingLeft: 8, borderLeft: "2px solid var(--border)" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "3fr 110px auto", gap: 6, alignItems: "end" }}>
                      <div className="field">
                        <label className="block text-xs mb-1">Tarea</label>
                        <input value={tarea.title} onChange={(e) => setTarea(gi, ti, { title: e.target.value })} />
                      </div>
                      <div className="field">
                        <label className="block text-xs mb-1">Prioridad</label>
                        <select
                          value={tarea.priority ?? "Medium"}
                          onChange={(e) => setTarea(gi, ti, { priority: e.target.value as ProjectTemplateTask["priority"] })}
                        >
                          {PRIORIDADES.map((p) => (
                            <option key={p} value={p}>
                              {p}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        onClick={() => setGrupo(gi, { tasks: grupo.tasks.filter((_, j) => j !== ti) })}
                        aria-label="Quitar tarea"
                      >
                        ×
                      </button>
                    </div>
                    <div className="field" style={{ marginTop: 4 }}>
                      <label className="block text-xs mb-1">Subtareas (una por línea)</label>
                      <textarea
                        rows={2}
                        value={(tarea.subtasks ?? []).join("\n")}
                        onChange={(e) => {
                          const lineas = e.target.value.split("\n").filter((l) => l.trim().length > 0);
                          setTarea(gi, ti, { subtasks: lineas.length ? lineas : undefined });
                        }}
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  style={{ alignSelf: "flex-start" }}
                  onClick={() => setGrupo(gi, { tasks: [...grupo.tasks, { title: "" }] })}
                >
                  + Añadir tarea
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm"
          style={{ marginTop: 8 }}
          onClick={() =>
            set({
              groups: [
                ...value.groups,
                { name: "", color: GROUP_COLORS[value.groups.length % GROUP_COLORS.length] ?? GROUP_COLORS[0], tasks: [{ title: "" }] }
              ]
            })
          }
        >
          + Añadir grupo
        </button>
      </div>
    </div>
  );
}
