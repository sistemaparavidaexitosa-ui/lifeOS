"use client";
// El selector de plantilla, compartido por los dos sitios desde donde se elige:
// el formulario de nuevo proyecto y el panel de un proyecto ya existente.
//
// Vive en un componente propio para que la lista y su resumen no se escriban
// dos veces — si divergieran, una pantalla ofrecería plantillas que la otra no,
// o diría un número de tareas distinto para la misma.
//
// LA LISTA LLEGA POR PROPS, no de un import. Desde la migración 0044 el
// catálogo está en `template_catalog` y solo el servidor puede leerlo; esto es
// un componente cliente. Quien lo consulta es /execution, que ya es un Server
// Component, y lo baja hasta aquí. Es un `prop` más de recorrido largo, sí,
// pero la alternativa —pedirlo desde el navegador— añadiría un viaje de red
// para una lista que la página ya tenía en la mano al renderizar.

import {
  TEMPLATE_CATEGORIES,
  templateSummary,
  type ProjectTemplate
} from "@/lib/domain/execution/project-templates.ts";

export function TemplateSelect({
  value,
  onChange,
  name,
  templates
}: {
  value: string;
  onChange: (id: string) => void;
  /** Cuando se envía dentro de un `<form>` con Server Action. */
  name?: string;
  /** Las publicadas del catálogo, tal como las devolvió `listTemplates`. */
  templates: ProjectTemplate[];
}) {
  return (
    <select name={name} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Ninguna · empezar en blanco</option>
      {/* Agrupado por categoría: con once plantillas, una lista plana obliga a
          leerla entera para descartar diez. El orden de los grupos lo fija
          TEMPLATE_CATEGORIES, no el del array — así añadir una plantilla al
          final del catálogo no la manda al bloque equivocado. */}
      {TEMPLATE_CATEGORIES.map((category) => {
        const suyas = templates.filter((t) => t.category === category);
        if (!suyas.length) return null;
        return (
          <optgroup key={category} label={category}>
            {suyas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </optgroup>
        );
      })}
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
export function TemplatePreview({ templateId, templates }: { templateId: string; templates: ProjectTemplate[] }) {
  const template = templateId ? templates.find((t) => t.id === templateId) : undefined;
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
