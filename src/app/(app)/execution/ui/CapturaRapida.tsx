"use client";

// Capturar es escribir y Enter. Mientras se escribe, unas fichas dicen lo que
// se entendió («Mañana», «Alta», «Urgente»): así nadie descubre después que
// «viernes» se tomó como fecha. Ver interpretarCaptura (captura.ts).
//
// La variante «fila» es la misma captura vestida de fila de la Lista: el
// «+ Añadir subtarea» al pie de cada rama. Es un campo desde el principio (no
// un botón que se convierte en campo) porque Safari solo abre el teclado si el
// foco llega dentro del propio toque.

import { useMemo, useRef, useState } from "react";
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
  onCreated,
  variante,
  nivel = 0,
  alSalirVacio
}: {
  projectId: string;
  groupId?: string | null;
  parentTaskId?: string | null;
  today: string;
  placeholder?: string;
  onCreated: (task: CreatedTaskRow) => void;
  variante?: "fila";
  /** Sangría de la variante «fila»: el nivel de la subtarea que se crea. */
  nivel?: number;
  /** El foco se va y no se escribió nada (para cerrar una captura abierta a propósito). */
  alSalirVacio?: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [valor, setValor] = useState("");
  // Cuántas se están creando. No bloquea la siguiente: planear es escribir
  // cinco subtareas seguidas, y la respuesta del servidor (que además refresca
  // la página) tarda más que el pulgar en escribir la segunda.
  const [enVuelo, setEnVuelo] = useState(0);
  const pendiente = enVuelo > 0;
  const cola = useRef<Promise<void>>(Promise.resolve());
  const lectura = useMemo(() => interpretarCaptura(valor, today), [valor, today]);
  const vacio = !valor.trim();

  function enviar() {
    if (vacio) return;
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
    setEnVuelo((n) => n + 1);
    // En cola, una detrás de otra: el servidor pone cada una al final de sus
    // hermanas, y dos a la vez podían quedar con la misma posición.
    const crear = cola.current.then(() => createTask(fd));
    cola.current = crear.then(
      () => undefined,
      () => undefined
    );
    crear
      .then(onCreated)
      .catch((e) => {
        // Vuelve el texto, salvo que ya se esté escribiendo otra.
        setValor((actual) => (actual.trim() ? actual : texto));
        aviso({ tono: "error", mensaje: "No se pudo crear la tarea", detalle: e instanceof Error ? e.message : undefined });
      })
      .finally(() => setEnVuelo((n) => n - 1));
    ref.current?.focus();
  }

  const fichas: string[] = [];
  if (!vacio) {
    if (lectura.due) fichas.push(lectura.due === today ? "Hoy" : fcorta(lectura.due, today));
    if (lectura.priority) fichas.push(PRIORITY_META[lectura.priority].label);
    if (lectura.urgent) fichas.push("Urgente");
  }

  return (
    <form
      className={variante === "fila" ? "xr-captura xr-captura-fila" : "xr-captura"}
      data-pendiente={pendiente || undefined}
      data-captura-de={parentTaskId ?? undefined}
      style={variante === "fila" ? ({ "--nivel": nivel } as React.CSSProperties) : undefined}
      onBlur={(e) => {
        if (!alSalirVacio || valor.trim() || pendiente) return;
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) alSalirVacio();
      }}
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
        <IconPlus width={variante === "fila" ? 14 : 16} height={variante === "fila" ? 14 : 16} />
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
