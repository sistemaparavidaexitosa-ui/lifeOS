"use client";
// Los campos de una plantilla de hábito.
//
// Los tres de abajo del nombre no son opcionales y no es un capricho del
// formulario: son las reglas que hacen que un hábito se sostenga, y por eso el
// esquema los exige. Una plantilla sin señal es una lista de buenos propósitos.

import { HABIT_CATEGORY_ORDER, type HabitTemplate } from "@/lib/domain/development/templates.ts";


export default function HabitTemplateFields({
  value,
  onChange
}: {
  value: HabitTemplate;
  onChange: (v: HabitTemplate) => void;
}) {
  const set = (parche: Partial<HabitTemplate>) => onChange({ ...value, ...parche });

  return (
    <div className="flex flex-col gap-2" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="field">
        <label className="block text-xs font-bold mb-1">Nombre</label>
        <input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="Moverme 20 minutos" />
      </div>

      <div className="grid grid-cols-2 gap-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Categoría</label>
          <select value={value.category} onChange={(e) => set({ category: e.target.value as HabitTemplate["category"] })}>
            {HABIT_CATEGORY_ORDER.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field">
        <label className="block text-xs font-bold mb-1">Señal</label>
        <input value={value.cue} onChange={(e) => set({ cue: e.target.value })} placeholder="Después de dejar el teléfono cargando" />
        <p className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
          Empieza por «Después de…». Un hábito sin momento no se ejecuta: se recuerda con culpa.
        </p>
      </div>

      <div className="field">
        <label className="block text-xs font-bold mb-1">Versión de dos minutos</label>
        <input value={value.twoMinVersion} onChange={(e) => set({ twoMinVersion: e.target.value })} placeholder="Ponerme los tenis" />
        <p className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
          La que se hace el día malo y no se puede fallar. Es la que sostiene la racha.
        </p>
      </div>

      <div className="field">
        <label className="block text-xs font-bold mb-1">En qué se apoya</label>
        <textarea value={value.why} rows={2} onChange={(e) => set({ why: e.target.value })} />
        <p className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
          Se muestra al elegir la plantilla, para que quien la use entienda la regla y pueda escribir la suya después.
        </p>
      </div>
    </div>
  );
}
