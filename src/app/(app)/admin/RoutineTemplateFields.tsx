"use client";
// Los campos de una plantilla de rutina, con sus pasos.
//
// La duración total no se escribe: se suma. Una plantilla que se llama «de 60
// minutos» y suma 55 no la revisa nadie a mano, y ese error solo se ve
// contando — que es justo lo que hace `routineTemplateDuration` en la
// previsualización.

import { type RoutineTemplate, type RoutineTemplateStep } from "@/lib/domain/development/templates.ts";

const FRECUENCIAS = ["Diario", "Semanal", "Entre semana", "Fin de semana"] as const;

const PASO_NUEVO: RoutineTemplateStep = { title: "", durationMin: 10, detail: "" };

export default function RoutineTemplateFields({
  value,
  onChange
}: {
  value: RoutineTemplate;
  onChange: (v: RoutineTemplate) => void;
}) {
  const set = (parche: Partial<RoutineTemplate>) => onChange({ ...value, ...parche });

  const setPaso = (i: number, parche: Partial<RoutineTemplateStep>) =>
    set({ steps: value.steps.map((p, j) => (j === i ? { ...p, ...parche } : p)) });

  const mover = (i: number, delta: number) => {
    const destino = i + delta;
    if (destino < 0 || destino >= value.steps.length) return;
    const pasos = [...value.steps];
    const actual = pasos[i];
    const otro = pasos[destino];
    if (!actual || !otro) return;
    pasos[i] = otro;
    pasos[destino] = actual;
    set({ steps: pasos });
  };

  return (
    <div className="flex flex-col gap-2" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="field">
        <label className="block text-xs font-bold mb-1">Nombre</label>
        <input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="Mañana Milagrosa · S.A.V.E.R.S." />
      </div>

      <div className="field">
        <label className="block text-xs font-bold mb-1">Fuente</label>
        <input value={value.source} onChange={(e) => set({ source: e.target.value })} placeholder="Mañana Milagrosa, de Hal Elrod" />
        <p className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
          El libro del que sale la ESTRUCTURA. Se muestra como atribución. Escribe las descripciones con tus palabras: no
          se reproduce texto de ninguna obra.
        </p>
      </div>

      <div className="grid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Resumen</label>
          <input value={value.summary} onChange={(e) => set({ summary: e.target.value })} />
        </div>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Frecuencia</label>
          <select value={value.frequency} onChange={(e) => set({ frequency: e.target.value as RoutineTemplate["frequency"] })}>
            {FRECUENCIAS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold mb-1">Pasos</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {value.steps.map((paso, i) => (
            <div key={i} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 8 }}>
              <div style={{ display: "grid", gridTemplateColumns: "2fr 80px auto", gap: 6, alignItems: "end" }}>
                <div className="field">
                  <label className="block text-xs mb-1">Título</label>
                  <input value={paso.title} onChange={(e) => setPaso(i, { title: e.target.value })} />
                </div>
                <div className="field">
                  <label className="block text-xs mb-1">Minutos</label>
                  <input
                    type="number"
                    min={1}
                    value={paso.durationMin}
                    onChange={(e) => setPaso(i, { durationMin: Number(e.target.value) || 0 })}
                  />
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => mover(i, -1)} aria-label="Subir">
                    ↑
                  </button>
                  <button type="button" className="btn-ghost btn-sm" onClick={() => mover(i, 1)} aria-label="Bajar">
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-danger btn-sm"
                    onClick={() => set({ steps: value.steps.filter((_, j) => j !== i) })}
                    aria-label="Quitar paso"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="field" style={{ marginTop: 6 }}>
                <label className="block text-xs mb-1">Qué se hace</label>
                <input value={paso.detail} onChange={(e) => setPaso(i, { detail: e.target.value })} />
              </div>
              <div className="field" style={{ marginTop: 6 }}>
                <label className="block text-xs mb-1">Hábito con el que ligarlo (opcional)</label>
                <input
                  value={paso.habitHint ?? ""}
                  onChange={(e) => setPaso(i, { habitHint: e.target.value || undefined })}
                  placeholder="leer"
                />
                <p className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
                  Si el usuario ya lleva un hábito parecido, el paso se liga al suyo en vez de duplicarlo: así la racha no
                  se parte en dos. La comparación es laxa, basta una palabra.
                </p>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn-ghost btn-sm"
          style={{ marginTop: 8 }}
          onClick={() => set({ steps: [...value.steps, { ...PASO_NUEVO }] })}
        >
          + Añadir paso
        </button>
      </div>
    </div>
  );
}
