"use client";

import { useState, useTransition } from "react";
import { upsertAsset, deleteAsset } from "./actions";

interface AssetLite {
  id: string;
  name: string;
  kind: string;
  value: number;
  asOf: string;
  source: string;
}

export default function AssetForm({ asset }: { asset?: AssetLite }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        {asset ? "Editar" : "+ Activo"}
      </button>
    );
  }

  return (
    <div className="card mt-2" style={{ background: "var(--surface2)" }}>
      <form
        action={(fd) =>
          startTransition(async () => {
            try {
              await upsertAsset(asset?.id ?? null, fd);
              setOpen(false);
              setError(null);
            } catch (e) {
              setError(e instanceof Error ? e.message : "Error");
            }
          })
        }
        className="flex flex-col gap-2"
      >
        <input name="name" placeholder="Nombre" defaultValue={asset?.name} required />
        <div className="grid grid-cols-2 gap-2">
          <select name="kind" defaultValue={asset?.kind ?? "Bien inmueble"}>
            <option>Efectivo</option>
            <option>Bancos</option>
            <option>Inversión</option>
            <option>Bien inmueble</option>
            <option>Vehículo</option>
            <option>Negocio</option>
            <option>Otros</option>
          </select>
          <input name="value" type="number" step="0.01" placeholder="Valuación" defaultValue={asset?.value} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input name="asOf" type="date" defaultValue={asset?.asOf ?? new Date().toISOString().slice(0, 10)} />
          <input name="source" placeholder="Fuente" defaultValue={asset?.source ?? "Estimación"} />
        </div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>Toda valuación exige fecha y fuente.</p>
        {error && <div className="text-xs" style={{ color: "var(--danger)" }}>{error}</div>}
        <div className="flex gap-2">
          {asset && (
            <button
              type="button"
              className="btn-danger btn-sm"
              disabled={pending}
              onClick={() => startTransition(async () => { await deleteAsset(asset.id); setOpen(false); })}
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
