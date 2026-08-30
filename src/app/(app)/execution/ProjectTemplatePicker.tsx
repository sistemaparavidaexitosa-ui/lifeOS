"use client";
// El selector de plantilla, compartido por los dos sitios desde donde se elige:
// el formulario de nuevo proyecto y el panel de un proyecto ya existente.
//
// Vive en un componente propio para que la lista y su resumen no se escriban
// dos veces — si divergieran, una pantalla ofrecería plantillas que la otra no,
// o diría un número de tareas distinto para la misma.

import { PROJECT_TEMPLATES, templateSummary, getProjectTemplate } from "@/lib/domain/execution/project-templates.ts";

export function TemplateSelect({
  value,
  onChange,
  name
}: {
  value: string;
  onChange: (id: string) => void;
  /** Cuando se envía dentro de un `<form>` con Server Action. */
  name?: string;
}) {
  return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Ninguna · empezar en blanco</option>
      {PROJECT_TEMPLATES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Qué va a crear la plantilla elegida, ANTES de crearla.
 *
 * Con seis grupos y veinticuatro tareas de por medio, elegir a ciegas y
 * descubrir el tamaño después obliga a borrar a mano. Y la atribución del libro
 * va aquí porque es donde se decide usarlo.
 */
export function TemplatePreview({ templateId }: { templateId: string }) {
  const template = templateId ? getProjectTemplate(templateId) : undefined;
  if (!template) return null;

  const { groups, tasks, subtasks } = templateSummary(template);

  return (
    <div className="text-xs" style={{ color: "var(--muted)" }}>
      <span className="block">{template.summary}</span>
      <span className="block" style={{ marginTop: 3 }}>
        Crea {groups} grupos y {tasks} tareas
        {subtasks > 0 ? `, con ${subtasks} subtareas` : ""}. Sin fechas: las pones tú.
      </span>
      {template.source && (
        <span className="block" style={{ marginTop: 3, fontStyle: "italic" }}>
          Estructura basada en {template.source}.
        </span>
      )}
    </div>
  );
}
