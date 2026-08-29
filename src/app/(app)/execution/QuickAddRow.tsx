"use client";
// Fila de alta rápida ("+ Agregar tarea" / "+ Agregar subtarea"), equivalente
// a "+ Add item"/"+ Add subitem" de monday.com. Llama a createTask
// (execution/actions.ts) directamente para poder insertar la fila creada en
// el estado local de MondayBoard sin recargar la página.
//
// FIX (retrofit de Groups): ahora acepta un groupId opcional — cuando se usa
// dentro de una sección de Group en MondayBoard, la nueva tarea raíz se crea
// DENTRO de ese grupo (en vez de caer al primero por defecto). Para
// subtareas (parentTaskId presente) el groupId se ignora del lado del
// servidor: siempre hereda el grupo del padre (ver actions.ts).
import { useRef, useState, useTransition } from "react";
import { IconPlus } from "@/components/icons";
import { createTask, type CreatedTaskRow } from "./actions";

export default function QuickAddRow({
  projectId,
  parentTaskId,
  groupId,
  placeholder = "+ Agregar tarea",
  indent = 0,
  onCreated
}: {
  projectId: string;
  parentTaskId?: string | null;
  groupId?: string | null;
  placeholder?: string;
  indent?: number;
  onCreated: (task: CreatedTaskRow) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    const title = value.trim();
    if (!title || pending) return;
    const fd = new FormData();
    fd.set("projectId", projectId);
    fd.set("title", title);
    if (parentTaskId) fd.set("parentTaskId", parentTaskId);
    if (groupId) fd.set("groupId", groupId);
    startTransition(async () => {
      const task = await createTask(fd);
      onCreated(task);
      setValue("");
      ref.current?.focus();
    });
  }

  const empty = !value.trim();

  return (
    <div className="mb-quickadd" style={{ marginLeft: indent * 26 }}>
      {/* El "+" era un icono decorativo: se veía como un botón y no hacía
          nada. Ahora es el botón de verdad — con el campo vacío le da el foco
          (que es lo que se espera al pulsarlo) y con algo escrito crea la
          tarea, igual que Enter. En táctil esto importa el doble: el teclado
          no siempre ofrece un Enter que envíe. */}
      <button
        type="button"
        className="mb-quickadd-btn"
        onClick={() => (empty ? ref.current?.focus() : submit())}
        disabled={pending}
        title={empty ? placeholder : "Crear"}
        aria-label={empty ? placeholder : "Crear"}
      >
        <IconPlus />
      </button>
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder={placeholder}
        disabled={pending}
        aria-label={placeholder}
        style={{ border: "none", background: "transparent", minHeight: "auto", padding: "4px 6px", width: "100%" }}
      />
      {/* Con texto escrito aparece la confirmación explícita: el "+" solo no
          dice que ya se puede crear. */}
      {!empty && (
        <button type="button" className="btn-primary btn-sm mb-quickadd-go" disabled={pending} onClick={submit}>
          {pending ? "…" : "Agregar"}
        </button>
      )}
    </div>
  );
}
