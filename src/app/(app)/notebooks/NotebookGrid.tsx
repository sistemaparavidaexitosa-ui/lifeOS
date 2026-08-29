"use client";
// Estantería de cuadernos del espacio.
//
// Tarjetas y no filas de tablero: un cuaderno no tiene estado, prioridad ni
// fecha meta que alinear en columnas — tiene nombre e icono, y se reconoce de
// un vistazo. Es también lo que mejor se toca con el pulgar, que es como se va
// a usar la mitad del tiempo.
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createNotebook } from "./actions";

export interface NotebookCard {
  id: string;
  title: string;
  icon: string;
  noteCount: number;
  createdByName: string;
  updatedAt: string;
}

/** Iconos de cuaderno. Un emoji distingue mejor que un color en una rejilla. */
const ICONOS = ["📓", "📗", "📘", "📙", "🗒️", "📎", "💡", "🎯", "🧭", "🧪"] as const;
const ICONO_POR_DEFECTO = ICONOS[0];

export default function NotebookGrid({
  notebooks,
  workspaceId,
  workspaceName,
  isPersonal,
  canWrite
}: {
  notebooks: NotebookCard[];
  workspaceId: string;
  workspaceName: string;
  isPersonal: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string>(ICONO_POR_DEFECTO);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function create() {
    const trimmed = title.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await createNotebook(workspaceId, trimmed, icon);
      if (!result.ok || !result.id) {
        setError(result.reason ?? "No se pudo crear el cuaderno.");
        return;
      }
      setTitle("");
      setCreating(false);
      setError(null);
      // Directo dentro: crear un cuaderno y quedarse fuera obliga a buscarlo
      // en la rejilla para empezar a escribir.
      router.push(`/notebooks?ws=${workspaceId}&notebook=${result.id}`);
      router.refresh();
    });
  }

  return (
    <>
      <div className="nb-section-head">
        <h3 className="font-bold">Cuadernos</h3>
        {canWrite && !creating && (
          <button type="button" className="btn-primary btn-sm" onClick={() => setCreating(true)}>
            + Nuevo cuaderno
          </button>
        )}
      </div>

      {creating && (
        <div className="card flex flex-col gap-2">
          <b className="text-sm">+ Nuevo cuaderno</b>
          <span className="text-xs" style={{ color: "var(--muted)" }}>
            {isPersonal ? (
              <>En tu espacio personal: solo tú lo verás.</>
            ) : (
              <>
                En <b>{workspaceName}</b>: todo el equipo podrá leerlo y escribir en él.
              </>
            )}
          </span>
          <div className="nb-icon-picker" role="radiogroup" aria-label="Icono del cuaderno">
            {ICONOS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={icon === option}
                aria-label={`Icono ${option}`}
                className={`nb-icon-option${icon === option ? " active" : ""}`}
                onClick={() => setIcon(option)}
              >
                {option}
              </button>
            ))}
          </div>
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                create();
              }
              if (e.key === "Escape") setCreating(false);
            }}
            placeholder="Nombre del cuaderno"
            aria-label="Nombre del cuaderno"
            enterKeyHint="done"
          />
          {error && (
            <div className="text-xs" style={{ color: "var(--danger)" }}>
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setCreating(false)} disabled={pending} style={{ flex: 1 }}>
              Cancelar
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={create} disabled={pending || !title.trim()} style={{ flex: 1 }}>
              {pending ? "Creando…" : "Crear cuaderno"}
            </button>
          </div>
        </div>
      )}

      {!notebooks.length && !creating ? (
        <div className="card">
          <div className="text-center py-6" style={{ color: "var(--muted)" }}>
            <div className="text-3xl mb-1.5">📓</div>
            {isPersonal
              ? "Tus cuadernos personales van aquí: apuntes, borradores, lo que no es de nadie más."
              : `«${workspaceName}» todavía no tiene cuadernos. Aquí van las actas, las decisiones y todo lo que el equipo escribe.`}
          </div>
        </div>
      ) : (
        <div className="nb-grid">
          {notebooks.map((n) => (
            <Link key={n.id} href={`/notebooks?ws=${workspaceId}&notebook=${n.id}`} className="nb-card">
              <span className="nb-card-icon" aria-hidden>
                {n.icon}
              </span>
              <span className="nb-card-title">{n.title}</span>
              <span className="nb-card-meta">
                {n.noteCount === 0 ? "Sin notas" : `${n.noteCount} nota${n.noteCount === 1 ? "" : "s"}`}
                {n.createdByName ? ` · ${n.createdByName}` : ""}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
