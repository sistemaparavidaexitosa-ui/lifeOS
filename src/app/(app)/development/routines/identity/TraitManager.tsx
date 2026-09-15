"use client";

import { useState, useTransition } from "react";
import FormSheet, { Field, FormActions } from "../../FormSheet";
import { deleteTrait, upsertTrait } from "@/lib/identity/actions";
import type { TraitRow } from "@/lib/identity/score-inputs";

const AREAS = ["Salud", "Carrera", "Relaciones", "Finanzas", "Aprendizaje", "Espiritual", "Personal"] as const;

/** Crear o editar un rasgo de identidad, en su panel. */
export default function TraitSheet({ trait, label }: { trait?: TraitRow; label: string }) {
  return (
    <FormSheet label={label} title={trait ? "Editar rasgo" : "Nuevo rasgo de identidad"} variant={trait ? "ghost" : "primary"}>
      {(close) => <Campos trait={trait} close={close} />}
    </FormSheet>
  );
}

function Campos({ trait, close }: { trait?: TraitRow; close: () => void }) {
  const [name, setName] = useState(trait?.name ?? "");
  const [statement, setStatement] = useState(trait?.statement ?? "");
  const [area, setArea] = useState<(typeof AREAS)[number]>((trait?.area as (typeof AREAS)[number]) ?? "Personal");
  const [active, setActive] = useState(trait?.active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        startTransition(async () => {
          const r = await upsertTrait(trait?.id ?? null, { name, statement, area, active });
          if (!r.ok) return setError(r.reason ?? "No se pudo guardar.");
          close();
        });
      }}
    >
      <Field label="Rasgo">
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} required placeholder="Disciplinado" />
      </Field>
      <Field label="En primera persona (opcional)">
        <input
          value={statement}
          onChange={(e) => setStatement(e.target.value)}
          maxLength={160}
          placeholder="Soy alguien que cumple lo que se promete a sí mismo"
          autoCapitalize="sentences"
        />
      </Field>
      <Field label="Área de vida">
        <select value={area} onChange={(e) => setArea(e.target.value as (typeof AREAS)[number])}>
          {AREAS.map((a) => (
            <option key={a}>{a}</option>
          ))}
        </select>
      </Field>
      {trait && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
          Activo: cuenta para el Identity Score
        </label>
      )}
      {error && (
        <div className="text-xs" role="alert" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
      <FormActions
        pending={pending}
        onCancel={close}
        onDelete={
          trait
            ? () =>
                startTransition(async () => {
                  const r = await deleteTrait(trait.id);
                  if (!r.ok) return setError(r.reason ?? "No se pudo borrar.");
                  close();
                })
            : undefined
        }
      />
    </form>
  );
}
