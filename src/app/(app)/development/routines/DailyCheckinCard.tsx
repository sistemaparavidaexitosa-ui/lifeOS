"use client";

import { useState, useTransition } from "react";
import { Card } from "@/components/ui";
import { CardHeader, Field } from "../FormSheet";
import ScalePicker from "./ScalePicker";
import { saveDailyReflection } from "./reflection-actions";

export interface CheckinLite {
  mood: number | null;
  energy: number | null;
  sleepHours: number | null;
  reflectionPrompt: string;
  reflection: string;
  wins: string;
}

/**
 * El check-in del día: ánimo, energía, sueño y dos preguntas.
 *
 * Es la otra mitad de los datos. Los hábitos dicen QUÉ hiciste; esto dice CÓMO
 * estabas, y sin las dos cosas no hay forma de ver «omites el ejercicio cuando
 * duermes menos de seis horas». Por eso cuesta diez segundos: tres toques y
 * guardar. Las preguntas son opcionales y van debajo.
 *
 * `prompt` es la pregunta de reflexión del día. En F1 es fija; cuando llegue el
 * brief de identidad (F4) vendrá de ahí, y se guarda copiada para que la
 * respuesta siga teniendo sentido aunque la pregunta cambie.
 */
export default function DailyCheckinCard({ initial, prompt }: { initial: CheckinLite | null; prompt: string }) {
  const [mood, setMood] = useState<number | null>(initial?.mood ?? null);
  const [energy, setEnergy] = useState<number | null>(initial?.energy ?? null);
  const [sleep, setSleep] = useState<string>(initial?.sleepHours != null ? String(initial.sleepHours) : "");
  const [reflection, setReflection] = useState(initial?.reflection ?? "");
  const [wins, setWins] = useState(initial?.wins ?? "");
  const [estado, setEstado] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const preguntaMostrada = initial?.reflection ? initial.reflectionPrompt || prompt : prompt;

  function guardar() {
    startTransition(async () => {
      const r = await saveDailyReflection({
        mood,
        energy,
        sleepHours: sleep === "" ? null : Number(sleep),
        reflectionPrompt: reflection.trim() ? preguntaMostrada : "",
        reflection,
        wins
      });
      setEstado(r.ok ? { ok: true, text: "Check-in guardado." } : { ok: false, text: r.reason ?? "No se pudo guardar." });
    });
  }

  return (
    <Card>
      <CardHeader
        title="Check-in de hoy"
        meta={
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Cómo estás pesa tanto como lo que haces.
          </span>
        }
      />

      <form
        className="flex flex-col gap-4 mt-3"
        onSubmit={(e) => {
          e.preventDefault();
          guardar();
        }}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <ScalePicker label="Ánimo" value={mood} onChange={setMood} hints={["Bajo", "Muy bien"]} />
          <ScalePicker label="Energía" value={energy} onChange={setEnergy} hints={["Agotado", "A tope"]} />
        </div>

        <Field label="Horas de sueño anoche">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            max={24}
            step={0.5}
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
            placeholder="Ej. 7.5"
          />
        </Field>

        <Field label={preguntaMostrada}>
          <textarea
            rows={3}
            maxLength={2000}
            value={reflection}
            onChange={(e) => setReflection(e.target.value)}
            autoCapitalize="sentences"
          />
        </Field>

        <Field label="Logros de hoy (opcional)">
          <textarea rows={2} maxLength={1000} value={wins} onChange={(e) => setWins(e.target.value)} autoCapitalize="sentences" />
        </Field>

        <div className="flex items-center gap-3 flex-wrap">
          <button type="submit" className="btn-primary btn-sm" disabled={pending}>
            {pending ? "…" : "Guardar check-in"}
          </button>
          {estado && (
            <span className="text-xs" role="status" style={{ color: estado.ok ? "var(--ok)" : "var(--danger)" }}>
              {estado.text}
            </span>
          )}
        </div>
      </form>
    </Card>
  );
}
