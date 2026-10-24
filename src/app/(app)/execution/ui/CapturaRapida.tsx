"use client";

// Capturar es escribir y Enter. Mientras se escribe, unas fichas dicen lo que
// se entendió («Mañana», «Alta», «Urgente»): así nadie descubre después que
// «viernes» se tomó como fecha. Ver interpretarCaptura (captura.ts).

import { useMemo, useRef, useState, useTransition } from "react";
import { IconPlus } from "@/components/icons";
import { fcorta } from "@/lib/format";
import { interpretarCaptura } from "@/lib/domain/execution/captura.ts";
import { createTask, type CreatedTaskRow } from "../actions";
import { PRIORITY_META } from "../status-meta";
import { aviso } from "./avisos";

export default function CapturaRapida({
  projectId,
  groupId,
  parentTaskId,
  today,
  placeholder = "Nueva tarea",
  onCreated
}: {
  projectId: string;
  groupId?: string | null;
  parentTaskId?: string | null;
  today: string;
  placeholder?: string;
  onCreated: (task: CreatedTaskRow) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [valor, setValor] = useState("");
  const [pendiente, start] = useTransition();
  const lectura = useMemo(() => interpretarCaptura(valor, today), [valor, today]);
  const vacio = !valor.trim();

  function enviar() {
    if (vacio || pendiente) return;
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("title", lectura.titulo);
    if (lectura.due) fd.set("due", lectura.due);
    if (lectura.priority) fd.set("priority", lectura.priority);
    if (lectura.urgent) fd.set("urgent", "on");
    if (parentTaskId) fd.set("parentTaskId", parentTaskId);
    if (groupId) fd.set("groupId", groupId);
    const texto = valor;
    // Se vacía antes de que conteste el servidor: la siguiente tarea se puede
    // ir escribiendo. Si falla, el texto vuelve.
    setValor("");
    start(async () => {
      try {
        onCreated(await createTask(fd));
      } catch (e) {
        setValor(texto);
        aviso({ tono: "error", mensaje: "No se pudo crear la tarea", detalle: e instanceof Error ? e.message : undefined });
      }
      ref.current?.focus();
    });
  }

  const fichas: string[] = [];
  if (!vacio) {
    if (lectura.due) fichas.push(lectura.due === today ? "Hoy" : fcorta(lectura.due, today));
    if (lectura.priority) fichas.push(PRIORITY_META[lectura.priority].label);
    if (lectura.urgent) fichas.push("Urgente");
  }

  return (
    <form
      className="xr-captura"
      data-pendiente={pendiente || undefined}
      onSubmit={(e) => {
        e.preventDefault();
        enviar();
      }}
    >
      <button
        type={vacio ? "button" : "submit"}
        className="xr-captura-mas"
        onClick={vacio ? () => ref.current?.focus() : undefined}
        aria-label={vacio ? placeholder : "Crear tarea"}
      >
        <IconPlus width={16} height={16} />
      </button>
      <input
        ref={ref}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="done"
        autoComplete="off"
      />
      {fichas.length > 0 && (
        <span className="xr-captura-fichas" aria-live="polite">
          {fichas.map((f) => (
            <span key={f} className="xr-ficha">
              {f}
            </span>
          ))}
        </span>
      )}
    </form>
  );
}
