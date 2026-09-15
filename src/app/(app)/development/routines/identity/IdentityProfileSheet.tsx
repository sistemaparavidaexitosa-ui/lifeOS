"use client";

import { useState, useTransition } from "react";
import FormSheet, { Field, FormActions } from "../../FormSheet";
import { upsertIdentityProfile } from "@/lib/identity/actions";
import type { IdentityProfileLite } from "@/lib/data/identity";

const INSPIRACIONES = [
  { value: "hill", label: "Napoleon Hill", hint: "Propósito definido, fe aplicada" },
  { value: "goddard", label: "Neville Goddard", hint: "Vivir desde el deseo cumplido" },
  { value: "clear", label: "James Clear", hint: "Cada acción es un voto; sistemas" },
  { value: "sharma", label: "Robin Sharma", hint: "Mañanas, maestría, mejoras diarias" }
] as const;

/**
 * Quién quieres ser, en un panel. Es lo primero que lee el brief diario (F4) y
 * lo que da sentido a los rasgos.
 *
 * `sugerencias` son las identidades que la persona ya escribió en sus rutinas:
 * empezar desde ahí es más fácil que desde una caja vacía.
 */
export default function IdentityProfileSheet({
  profile,
  sugerencias = [],
  label
}: {
  profile: IdentityProfileLite | null;
  sugerencias?: string[];
  label: string;
}) {
  return (
    <FormSheet label={label} title="Tu identidad" variant={profile ? "ghost" : "primary"}>
      {(close) => <Campos profile={profile} sugerencias={sugerencias} close={close} />}
    </FormSheet>
  );
}

function Campos({ profile, sugerencias, close }: { profile: IdentityProfileLite | null; sugerencias: string[]; close: () => void }) {
  const [identidad, setIdentidad] = useState(profile?.desiredIdentity ?? "");
  const [vision, setVision] = useState(profile?.visionStatement ?? "");
  const [valores, setValores] = useState((profile?.coreValues ?? []).join(", "));
  const [tono, setTono] = useState<IdentityProfileLite["motivationalTone"]>(profile?.motivationalTone ?? "directo");
  const [inspiraciones, setInspiraciones] = useState<string[]>(profile?.inspirations ?? INSPIRACIONES.map((i) => i.value));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function guardar() {
    startTransition(async () => {
      const r = await upsertIdentityProfile({
        desiredIdentity: identidad,
        visionStatement: vision,
        coreValues: valores.split(",").map((v) => v.trim()),
        motivationalTone: tono,
        inspirations: inspiraciones as ("hill" | "goddard" | "clear" | "sharma")[]
      });
      if (!r.ok) return setError(r.reason ?? "No se pudo guardar.");
      setError(null);
      close();
    });
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <Field label="¿En quién te estás convirtiendo?">
        <textarea
          rows={2}
          maxLength={280}
          required
          value={identidad}
          onChange={(e) => setIdentidad(e.target.value)}
          placeholder="Soy alguien disciplinado, libre financieramente y presente con los míos"
          autoCapitalize="sentences"
        />
      </Field>
      {!identidad && sugerencias.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            Ya lo escribiste en tus rutinas:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {sugerencias.slice(0, 4).map((s) => (
              <button key={s} type="button" className="chip" onClick={() => setIdentidad(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <Field label="Tu visión (opcional)">
        <textarea
          rows={4}
          maxLength={2000}
          value={vision}
          onChange={(e) => setVision(e.target.value)}
          placeholder="Cómo es un día normal de tu vida dentro de cinco años, contado en presente."
          autoCapitalize="sentences"
        />
      </Field>

      <Field label="Valores (separados por comas, hasta 10)">
        <input value={valores} onChange={(e) => setValores(e.target.value)} placeholder="Constancia, libertad, familia" />
      </Field>

      <Field label="¿Cómo quieres que te hable la IA?">
        <select value={tono} onChange={(e) => setTono(e.target.value as typeof tono)}>
          <option value="sereno">Sereno: calma y perspectiva</option>
          <option value="directo">Directo: claro y sin rodeos</option>
          <option value="intenso">Intenso: exigente y con energía</option>
        </select>
      </Field>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs mb-1" style={{ color: "var(--muted)" }}>
          Principios que inspiran tu brief diario
        </legend>
        {INSPIRACIONES.map((i) => (
          <label key={i.value} className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              className="mt-1"
              checked={inspiraciones.includes(i.value)}
              onChange={(e) =>
                setInspiraciones((xs) => (e.target.checked ? [...xs, i.value] : xs.filter((x) => x !== i.value)))
              }
            />
            <span>
              <b>{i.label}</b>
              <span className="block text-xs" style={{ color: "var(--muted)" }}>
                {i.hint}
              </span>
            </span>
          </label>
        ))}
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          La IA se inspira en sus principios con palabras propias: nunca copia ni atribuye citas.
        </p>
      </fieldset>

      {error && (
        <div className="text-xs" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
      <FormActions pending={pending} onCancel={close} />
    </form>
  );
}
