"use client";
// FASE 3 (Drawer lateral — Descripción). Autosave al perder foco (blur),
// mismo patrón que el título editable inline en MondayRow.tsx: sin botón
// "Guardar" explícito, revierte el valor si la Server Action falla.
import { useState } from "react";
import { updateTaskDescription } from "./task-detail-actions";

export default function TaskDescriptionField({
  taskId,
  description,
  onSaved
}: {
  taskId: string;
  description: string;
  onSaved: () => void;
}) {
  const [value, setValue] = useState(description);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  async function save() {
    if (value === description) return;
    setSaving(true);
    try {
      await updateTaskDescription(taskId, value);
      setSavedMsg("Descripción guardada");
      onSaved();
    } catch {
      setValue(description);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <label className="text-xs" style={{ color: "var(--muted)", fontWeight: 700 }}>
        Descripción
      </label>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSavedMsg(null);
        }}
        onBlur={save}
        rows={5}
        placeholder="Agrega una descripción para esta tarea..."
        disabled={saving}
        style={{ marginTop: 4 }}
      />
      {savedMsg && (
        <div className="chip ok" style={{ marginTop: 4 }}>
          {savedMsg}
        </div>
      )}
    </div>
  );
}
