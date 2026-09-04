"use client";
// FIX: antes este formulario se renderizaba SIEMPRE visible (única
// inconsistencia del proyecto frente al resto de formularios — DebtForm,
// CashbackForm, GoalForm, HabitForm, etc. — que ya usan el patrón botón
// "+ X" que abre/cierra). Ahora sigue exactamente ese mismo patrón: botón
// que abre el formulario y se cierra solo al crear (o al cancelar).
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createProject } from "./actions";
import { TemplateSelect, TemplatePreview } from "./ProjectTemplatePicker";
import AiPlanPanel from "./AiPlanPanel";
import { planSummary, type AiPlanDraft } from "@/lib/domain/execution/ai-plan.ts";
import type { ProjectTemplate } from "@/lib/domain/execution/project-templates.ts";

export default function NewProjectForm({
  workspaceId,
  workspaceName,
  templates
}: {
  /**
   * Espacio donde nace el proyecto. Obligatorio desde la migración 0030:
   * `projects.workspace_id` es NOT NULL y ya no existe el proyecto "suelto".
   */
  workspaceId: string;
  workspaceName: string;
  /** El catálogo publicado, que desde 0044 lee la página del servidor. */
  templates: ProjectTemplate[];
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");

  // Objetivo y fecha pasan a ser controlados para poder PRELLENAR con ellos el
  // panel de IA. Es la única razón: el resto del formulario sigue siendo
  // campos sueltos que lee el FormData.
  const [objective, setObjective] = useState("");
  const [targetDate, setTargetDate] = useState("");

  // El plan de la IA, ya podado y confirmado. Viaja al servidor en un campo
  // oculto junto con el resto del formulario, así que el proyecto y su
  // estructura nacen en la MISMA llamada: no hay ventana en la que exista un
  // proyecto vacío porque la segunda petición falló.
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPlan, setAiPlan] = useState<{ draft: AiPlanDraft; selection: string[] } | null>(null);
  const aiCounts = aiPlan ? planSummary(aiPlan.draft, new Set(aiPlan.selection)) : null;

  function reset() {
    setTemplateId("");
    setObjective("");
    setTargetDate("");
    setAiOpen(false);
    setAiPlan(null);
  }

  if (!open) {
    return (
      <button type="button" className="btn-primary btn-sm" onClick={() => setOpen(true)}>
        + Nuevo proyecto
      </button>
    );
  }

  return (
    <form
      ref={ref}
      action={(fd) =>
        startTransition(async () => {
          try {
            const projectId = await createProject(fd);
            ref.current?.reset();
            reset();
            setOpen(false);
            setError(null);
            // Directo a su tablero: ahí ya está el grupo "General" y su
            // "+ Agregar tarea". Antes había que localizar el proyecto recién
            // creado en la cartera y abrirlo a mano para poder empezar.
            router.push(`/execution?project=${projectId}`);
          } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo crear el proyecto");
          }
        })
      }
      className="card flex flex-col gap-2"
    >
      <b>+ Nuevo proyecto</b>
      {/* Decir dónde va a caer el proyecto ANTES de crearlo: con varios
          espacios abiertos en pestañas distintas, crear a ciegas y descubrir
          después que el equipo entero lo ve (o que nadie lo ve) es el error
          caro de este formulario. */}
      <span className="text-xs" style={{ color: "var(--muted)" }}>
        En el espacio <b>{workspaceName}</b>
      </span>
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <input name="title" placeholder="Título del proyecto" required />
      <input
        name="objective"
        placeholder="Objetivo (opcional)"
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
      />
      <div style={{ display: "flex", gap: 8 }}>
        <select name="status" defaultValue="Active" style={{ flex: 1 }}>
          <option value="Draft">Borrador</option>
          <option value="Active">Activo</option>
          <option value="OnHold">En pausa</option>
        </select>
        <select name="priority" defaultValue="Medium" style={{ flex: 1 }}>
          <option value="High">Alta</option>
          <option value="Medium">Media</option>
          <option value="Low">Baja</option>
        </select>
      </div>
      <input name="targetDate" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />

      {/* La estructura va al final y no arriba: primero se decide QUÉ proyecto
          es, y solo entonces tiene sentido preguntar con qué estructura nace.
          Por defecto ninguna — un proyecto sigue pudiendo empezar en blanco.

          Plantilla y plan con IA son EXCLUYENTES: elegir uno limpia el otro.
          Aplicar los dos duplicaría la fase de arranque en casi todos los
          casos, y quien quiera esa mezcla puede aplicar la plantilla después
          desde el menú del proyecto, viendo ya lo que la IA propuso. */}
      <label className="text-xs font-bold">
        Plantilla
        <TemplateSelect
          name="templateId"
          templates={templates}
          value={templateId}
          onChange={(id) => {
            setTemplateId(id);
            if (id) {
              setAiPlan(null);
              setAiOpen(false);
            }
          }}
        />
      </label>
      <TemplatePreview templateId={templateId} templates={templates} />

      {!aiOpen && !aiPlan && (
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            setAiOpen(true);
            setTemplateId("");
          }}
        >
          🤖 O deja que la IA proponga el plan
        </button>
      )}

      {aiOpen && (
        <div className="card" style={{ background: "var(--surface-2, var(--surface))" }}>
          <AiPlanPanel
            projectId={null}
            defaultObjective={objective}
            targetDate={targetDate || null}
            confirmLabel="Usar este plan"
            onConfirm={async (draft, selection) => {
              setAiPlan({ draft, selection });
              const counts = planSummary(draft, new Set(selection));
              // No se escribe nada todavía: el plan se guarda aquí y se crea
              // junto con el proyecto al enviar el formulario. Por eso se
              // devuelven los conteos a mano en vez de los de la base.
              return { ok: true, created: { groups: counts.groups, tasks: counts.tasks + counts.subtasks } };
            }}
            onDone={() => setAiOpen(false)}
          />
        </div>
      )}

      {aiPlan && aiCounts && !aiOpen && (
        <div
          className="text-xs"
          style={{
            background: "color-mix(in srgb, var(--c-green) 12%, var(--surface))",
            borderLeft: "3px solid var(--c-green)",
            borderRadius: "0 10px 10px 0",
            padding: "8px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8
          }}
        >
          <span style={{ flex: 1 }}>
            Plan con IA listo: <b>{aiCounts.groups}</b> grupo{aiCounts.groups === 1 ? "" : "s"} y{" "}
            <b>{aiCounts.tasks}</b> tarea{aiCounts.tasks === 1 ? "" : "s"}. Se crearán con el proyecto.
          </span>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAiOpen(true)}>
            Ver
          </button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setAiPlan(null)}>
            Quitar
          </button>
        </div>
      )}

      <input type="hidden" name="aiPlan" value={aiPlan ? JSON.stringify(aiPlan) : ""} />

      {error && (
        <div className="text-xs" style={{ color: "var(--danger)" }}>
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          disabled={pending}
          style={{ flex: 1 }}
        >
          Cancelar
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={pending} style={{ flex: 1 }}>
          {pending ? "Creando…" : "Crear proyecto"}
        </button>
      </div>
    </form>
  );
}
