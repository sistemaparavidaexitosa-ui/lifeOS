"use client";

import { useState, useTransition } from "react";
import { Field, FormActions } from "../FormSheet";
import { upsertBodyProfile } from "./actions";

export interface PerfilActual {
  sex: string;
  birthDate: string;
  heightCm: number;
  weightKg: number;
  activityLevel: string;
  goal: string;
  proteinGPerKg: number;
  fatPct: number;
  kcalOverride: number | null;
}

const ACTIVIDADES: [string, string][] = [
  ["Sedentario", "Sedentario — oficina, sin ejercicio"],
  ["Ligero", "Ligero — 1 a 3 días de ejercicio"],
  ["Moderado", "Moderado — 3 a 5 días"],
  ["Alto", "Alto — 6 o 7 días"],
  ["Muy alto", "Muy alto — trabajo físico o dos sesiones"]
];

export default function BodyProfileForm({ perfil, close }: { perfil: PerfilActual | null; close: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={(fd) =>
        startTransition(async () => {
          const result = await upsertBodyProfile(fd);
          if (!result.ok) {
            setError(result.reason ?? "No se pudo guardar.");
            return;
          }
          close();
        })
      }
      className="flex flex-col gap-3"
    >
      <div className="flex gap-2">
        <Field label="Sexo" className="grow">
          <select name="sex" defaultValue={perfil?.sex ?? "Hombre"}>
            <option value="Hombre">Hombre</option>
            <option value="Mujer">Mujer</option>
          </select>
        </Field>
        <Field label="Fecha de nacimiento" className="grow">
          <input name="birthDate" type="date" required defaultValue={perfil?.birthDate ?? ""} />
        </Field>
      </div>

      <div className="flex gap-2">
        <Field label="Altura (cm)" className="grow">
          <input name="heightCm" type="number" min="80" max="250" step="0.5" required defaultValue={perfil?.heightCm ?? ""} />
        </Field>
        <Field label="Peso (kg)" className="grow">
          <input name="weightKg" type="number" min="25" max="400" step="0.1" required defaultValue={perfil?.weightKg ?? ""} />
        </Field>
      </div>

      <Field label="Nivel de actividad">
        <select name="activityLevel" defaultValue={perfil?.activityLevel ?? "Ligero"}>
          {ACTIVIDADES.map(([valor, texto]) => (
            <option key={valor} value={valor}>
              {texto}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Objetivo">
        <select name="goal" defaultValue={perfil?.goal ?? "Mantener"}>
          <option value="Perder">Perder peso (−500 kcal)</option>
          <option value="Mantener">Mantener</option>
          <option value="Ganar">Ganar (+300 kcal)</option>
        </select>
      </Field>

      <div className="flex gap-2">
        <Field label="Proteína (g por kg)" className="grow">
          <input name="proteinGPerKg" type="number" min="0.5" max="3" step="0.1" defaultValue={perfil?.proteinGPerKg ?? 1.6} />
        </Field>
        <Field label="Grasa (% de kcal)" className="grow">
          <input name="fatPct" type="number" min="15" max="45" step="1" defaultValue={perfil?.fatPct ?? 25} />
        </Field>
      </div>

      <Field label="Objetivo de kcal fijado a mano (opcional)">
        <input name="kcalOverride" type="number" min="1000" max="6000" step="10" defaultValue={perfil?.kcalOverride ?? ""} />
      </Field>
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        Si lo dejas vacío, el objetivo se calcula con Mifflin-St Jeor y tu nivel de actividad. Nunca baja de tu
        metabolismo basal: por debajo de ahí deja de ser un objetivo.
      </div>

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}

      <FormActions pending={pending} onCancel={close} />
    </form>
  );
}
