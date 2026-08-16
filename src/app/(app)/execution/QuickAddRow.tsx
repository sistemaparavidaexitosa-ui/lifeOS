"use client";

// Fila de alta rápida ("+ Agregar tarea" / "+ Agregar subtarea"), equivalente
// a "+ Add item"/"+ Add subitem" de monday.com. Llama a createTask
// (execution/actions.ts) directamente (sin <form>, como requestProjectSequence
// ya hace en SequenceButton.tsx) para poder insertar la fila creada en el
// estado local de MondayBoard sin recargar la página.

import { useRef, useState, useTransition } from "react";
import { IconPlus } from "@/components/icons";
import { createTask, type CreatedTaskRow } from "./actions";

export default function QuickAddRow({
  projectId,
  parentTaskId,
  placeholder = "+ Agregar tarea",
  indent = 0,
  onCreated
}: {
  projectId: string;
  parentTaskId?: string | null;
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
    startTransition(async () => {
      const task = await createTask(fd);
      onCreated(task);
      setValue("");
      ref.current?.focus();
    });
  }

  return (
    <div className={`mb-quickadd${indent ? ` mb-indent-${indent}` : ""}`}>
      <IconPlus width={16} height={16} style={{ flexShrink: 0 }} />
      <input
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder={placeholder}
        disabled={pending}
        style={{ border: "none", background: "transparent", minHeight: "auto", padding: "4px 6px", width: "100%" }}
      />
    </div>
  );
}
