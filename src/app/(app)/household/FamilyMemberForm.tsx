"use client";

import { useState, useTransition } from "react";
import { upsertFamilyMember, deleteFamilyMember } from "./actions";

interface MemberLite {
  id: string;
  name: string;
  relationship: string;
  memberType: string;
}

export default function FamilyMemberForm({ member }: { member?: MemberLite }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); setOpen(true); }}>
        {member ? "Editar" : "+ Miembro"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }} onClick={(e) => e.stopPropagation()}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertFamilyMember(member?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="name" placeholder="Nombre" defaultValue={member?.name} required />
        <div className="grid grid-cols-2 gap-2">
          <select name="relationship" defaultValue={member?.relationship ?? "Hijo/a"}>
            <option>Cónyuge</option>
            <option>Hijo/a</option>
            <option>Padre</option>
            <option>Madre</option>
            <option>Otro</option>
          </select>
          <select name="memberType" defaultValue={member?.memberType ?? "Dependiente"}>
            <option>Adulto</option>
            <option>Dependiente</option>
          </select>
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Este perfil no tiene inicio de sesión propio; tú administras sus datos financieros (ADR-011).
        </p>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {member && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await deleteFamilyMember(member.id); setOpen(false); })}
            >
              Eliminar
            </button>
          )}
          <span className="grow" />
          <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>
            Cancelar
          </button>
          <button type="submit" className="btn-primary btn-sm" disabled={pending}>
            {pending ? "…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
