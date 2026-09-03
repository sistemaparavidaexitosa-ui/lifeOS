"use client";
// El editor de una plantilla: armazón común y previsualización.
//
// FORMULARIO, NO UN CAMPO DE JSON. Un textarea con el payload sería mucho menos
// código y convertiría cada edición en un ejercicio de puntuación: una coma de
// más y la plantilla no se guarda, sin decir dónde. Los campos que existen son
// los que el esquema declara, y no hay forma de escribir uno que no exista.
//
// LA PREVISUALIZACIÓN USA LAS FUNCIONES DEL DOMINIO —`templateSummary`,
// `plannedRows`, `routineTemplateDuration`—, las mismas que ejecuta la acción
// que aplica la plantilla al tablero del usuario. Por eso lo que se ve aquí es
// literalmente lo que se va a insertar, y no una segunda implementación
// condenada a divergir de la primera al siguiente cambio.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Chip } from "@/components/ui";
import { saveTemplate, setTemplateStatus, deleteTemplate } from "./actions";
import { slugSchema, type TemplateKind, type TemplateStatus } from "@/lib/domain/templates/schema.ts";
import { templateSummary, plannedRows, type ProjectTemplate } from "@/lib/domain/execution/project-templates.ts";
import { routineTemplateDuration, type RoutineTemplate, type HabitTemplate } from "@/lib/domain/development/templates.ts";
import ProjectTemplateFields from "./ProjectTemplateFields";
import RoutineTemplateFields from "./RoutineTemplateFields";
import HabitTemplateFields from "./HabitTemplateFields";

export type Payload = ProjectTemplate | RoutineTemplate | HabitTemplate;

export default function TemplateEditor({
  kind,
  slug,
  status,
  inicial
}: {
  kind: TemplateKind;
  /** `null` cuando la plantilla todavía no existe. */
  slug: string | null;
  status: TemplateStatus | null;
  inicial: Payload;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<Payload>(inicial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  const esNueva = slug === null;
  const identificador = payload.id;

  function guardar(despues?: () => void) {
    setError(null);
    setGuardado(false);
    const s = slugSchema.safeParse(identificador);
    if (!s.success) {
      setError(s.error.issues[0]?.message ?? "El identificador no es válido.");
      return;
    }
    startTransition(async () => {
      const r = await saveTemplate(kind, identificador, payload);
      if (!r.ok) {
        setError(r.reason ?? "No se pudo guardar.");
        return;
      }
      setGuardado(true);
      if (despues) despues();
      // Una plantilla recién creada cambia de URL: /nueva pasa a ser la suya.
      if (esNueva) router.replace(`/admin/${kind}/${identificador}`);
      router.refresh();
    });
  }

  function publicar(nuevo: TemplateStatus) {
    setError(null);
    startTransition(async () => {
      const r = await setTemplateStatus(kind, identificador, nuevo);
      if (!r.ok) setError(r.reason ?? "No se pudo cambiar el estado.");
      else router.refresh();
    });
  }

  function borrar() {
    if (!confirm("Se borra del catálogo y deja de ofrecerse. Quien ya la aplicó conserva lo suyo. ¿Borrarla?")) return;
    setError(null);
    startTransition(async () => {
      const r = await deleteTemplate(kind, identificador);
      if (!r.ok) setError(r.reason ?? "No se pudo borrar.");
      else router.push(`/admin/${kind}`);
    });
  }

  return (
    <>
      <Card hero>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <h2 className="font-bold">{esNueva ? "Nueva plantilla" : payload.name || identificador}</h2>
          {status === "published" ? <Chip kind="ok">Publicada</Chip> : <Chip kind="warn">Borrador</Chip>}
        </div>
        <p className="text-xs" style={{ color: "var(--muted)", marginTop: 4 }}>
          {status === "published"
            ? "Está viva: lo que guardes aquí lo verá todo el mundo en cuanto guardes."
            : "Es un borrador: solo la ves tú, desde este panel, hasta que la publiques."}
        </p>
      </Card>

      <Card>
        <div className="field">
          <label className="block text-xs font-bold mb-1">Identificador</label>
          <input
            value={identificador}
            disabled={!esNueva}
            onChange={(e) => setPayload({ ...payload, id: e.target.value })}
            placeholder="rutina-de-manana"
          />
          <p className="text-xs" style={{ color: "var(--muted)", marginTop: 3 }}>
            {esNueva
              ? "Minúsculas, números y guiones. No se puede cambiar después: es lo que viaja al aplicar la plantilla."
              : "No se cambia. Renombrarlo rompería cualquier enlace guardado a esta plantilla."}
          </p>
        </div>

        {kind === "project" && (
          <ProjectTemplateFields value={payload as ProjectTemplate} onChange={setPayload} />
        )}
        {kind === "routine" && (
          <RoutineTemplateFields value={payload as RoutineTemplate} onChange={setPayload} />
        )}
        {kind === "habit" && <HabitTemplateFields value={payload as HabitTemplate} onChange={setPayload} />}
      </Card>

      <Card>
        <h3 className="font-bold mb-1 text-sm">Lo que va a crear</h3>
        <Previsualizacion kind={kind} payload={payload} />
      </Card>

      {error && (
        <Card>
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        </Card>
      )}

      <Card>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => guardar()}>
            {pending ? "Guardando…" : "Guardar"}
          </button>
          {!esNueva && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              disabled={pending}
              onClick={() => publicar(status === "published" ? "draft" : "published")}
            >
              {status === "published" ? "Retirar del selector" : "Publicar"}
            </button>
          )}
          {!esNueva && (
            <button type="button" className="btn-danger btn-sm" disabled={pending} onClick={borrar}>
              Borrar
            </button>
          )}
          {guardado && (
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              Guardado.
            </span>
          )}
        </div>
        <p className="text-xs" style={{ color: "var(--muted)", marginTop: 6 }}>
          Guardar y publicar son dos gestos distintos: guardar una plantilla ya viva la actualiza, pero una que nunca se
          publicó sigue sin verse hasta que la publiques.
        </p>
      </Card>
    </>
  );
}

/**
 * El resumen de lo que se insertaría, con las funciones del dominio.
 *
 * Si la plantilla todavía está a medio escribir, esto se queda corto en vez de
 * fallar: es una vista previa, no una validación. Quien valida es el esquema al
 * guardar, que además dice qué campo falla.
 */
function Previsualizacion({ kind, payload }: { kind: TemplateKind; payload: Payload }) {
  if (kind === "project") {
    const t = payload as ProjectTemplate;
    const { groups, tasks, subtasks } = templateSummary(t);
    return (
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        <p>
          Crea {groups} grupos y {tasks} tareas{subtasks > 0 ? `, con ${subtasks} subtareas` : ""}. Sin fechas: las pone
          el usuario.
        </p>
        <ul style={{ marginTop: 6, paddingLeft: 16 }}>
          {plannedRows(t).map((g) => (
            <li key={g.position}>
              <b>{g.name || "(grupo sin nombre)"}</b> — {g.tasks.length} tareas
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (kind === "routine") {
    const t = payload as RoutineTemplate;
    return (
      <div className="text-xs" style={{ color: "var(--muted)" }}>
        <p>
          {t.steps.length} pasos · {routineTemplateDuration(t)} minutos en total · {t.frequency}
        </p>
        <p style={{ marginTop: 4 }}>
          Los pasos que coincidan con un hábito que el usuario ya lleva quedan ligados a él, para no partirle la racha.
        </p>
      </div>
    );
  }
  const t = payload as HabitTemplate;
  return (
    <div className="text-xs" style={{ color: "var(--muted)" }}>
      <p>
        Prellena el formulario de hábito: {t.category} · {t.frequency}.
      </p>
      <p style={{ marginTop: 4 }}>No lo crea en silencio — la señal es personal y el usuario la reescribe antes de guardar.</p>
    </div>
  );
}
