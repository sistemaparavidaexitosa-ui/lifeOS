"use client";
// Las filas de un catálogo, con las dos acciones que cambian lo que ve el resto
// del mundo: publicar y retirar.
//
// PUBLICAR Y RETIRAR ESTÁN AQUÍ, en la lista, y no escondidas dentro del
// editor. Son gestos sobre el catálogo, no sobre el contenido de una plantilla:
// lo que uno quiere al abrir esta pantalla es ver de un vistazo qué está vivo y
// poder apagarlo sin entrar a ningún formulario.
//
// Borrar, en cambio, está dentro del editor y detrás de una confirmación:
// retirar es reversible y borrar no.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { setTemplateStatus } from "./actions";
import type { TemplateKind, TemplateStatus } from "@/lib/domain/templates/schema.ts";

export interface AdminRow {
  slug: string;
  name: string;
  status: TemplateStatus;
  /** Qué crea, calculado con las mismas funciones que usa el usuario. */
  resumen: string;
}

export default function TemplateRows({ kind, rows }: { kind: TemplateKind; rows: AdminRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function cambiar(slug: string, status: TemplateStatus) {
    setError(null);
    startTransition(async () => {
      const r = await setTemplateStatus(kind, slug, status);
      if (!r.ok) setError(r.reason ?? "No se pudo cambiar el estado.");
      else router.refresh();
    });
  }

  return (
    <Card>
      {error && (
        <div className="text-xs" style={{ color: "var(--danger)", marginBottom: 8 }}>
          {error}
        </div>
      )}
      <div className="flex flex-col" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {rows.map((r) => (
          <div
            key={r.slug}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "8px 0",
              borderBottom: "1px solid var(--border)"
            }}
          >
            <div style={{ minWidth: 0 }}>
              <Link href={`/admin/${kind}/${r.slug}`} className="font-bold text-sm">
                {r.name}
              </Link>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {r.slug} · {r.resumen}
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {r.status === "published" ? <Chip kind="ok">Publicada</Chip> : <Chip kind="warn">Borrador</Chip>}
              <button
                type="button"
                className="btn-ghost btn-sm"
                disabled={pending}
                onClick={() => cambiar(r.slug, r.status === "published" ? "draft" : "published")}
              >
                {r.status === "published" ? "Retirar" : "Publicar"}
              </button>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs" style={{ color: "var(--muted)", marginTop: 8 }}>
        Retirar una plantilla la quita del selector, pero no la borra ni toca a quien ya la haya usado: al aplicarla se
        copió a sus tablas.
      </p>
    </Card>
  );
}
