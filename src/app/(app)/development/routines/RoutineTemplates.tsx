"use client";
// Plantillas de rutinas: Mañana Milagrosa y El Club de las 5 AM.
//
// Dos pasos en un mismo panel: elegir la plantilla y anclarla a un bloque
// horario. Lo segundo no es un extra — los dos libros tratan de UNA hora
// concreta del día, y si no se ancla al crearla nadie vuelve a abrir el
// formulario para hacerlo después.
//
// Al aceptar, la rutina se COPIA a tus tablas. A partir de ahí es tuya: los
// pasos se editan, se borran y se reordenan como en cualquier otra.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import FormSheet from "../FormSheet";
import { createRoutineFromTemplate } from "./actions";
import { routineTemplateDuration, type RoutineTemplate } from "@/lib/domain/development/templates.ts";

export interface OccupationLite {
  id: string;
  title: string;
  start: string;
  end: string;
}

/**
 * `templates` llega por props y no de un import: desde 0044 el catálogo vive en
 * `template_catalog` y solo el servidor lo lee. La página, que ya es un Server
 * Component, lo baja hasta aquí.
 */
export default function RoutineTemplates({
  occupations,
  templates
}: {
  occupations: OccupationLite[];
  templates: RoutineTemplate[];
}) {
  return (
    <FormSheet label="Plantillas" title="Plantillas de rutinas">
      {(close) => <Contenido occupations={occupations} templates={templates} close={close} />}
    </FormSheet>
  );
}

function Contenido({
  occupations,
  templates,
  close
}: {
  occupations: OccupationLite[];
  templates: RoutineTemplate[];
  close: () => void;
}) {
  const router = useRouter();
  const [elegida, setElegida] = useState<RoutineTemplate | null>(null);
  const [occupationId, setOccupationId] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Los hábitos que la plantilla NO sembró porque el usuario ya los tenía en
  // otra rutina. Es información, no un fallo: la rutina existe, solo que con
  // menos hábitos de los que se acaban de leer en la lista de arriba, y no
  // decirlo la haría parecer rota.
  const [saltados, setSaltados] = useState<string[] | null>(null);

  if (elegida) {
    const total = routineTemplateDuration(elegida);
    return (
      <div className="flex flex-col gap-3">
        <button
          type="button"
          className="nb-crumb-back"
          style={{ alignSelf: "flex-start" }}
          onClick={() => {
            // El aviso pertenece a la rutina que se acaba de crear: si se
            // vuelve al catálogo, arrastrarlo a la siguiente plantilla haría
            // que hablara de hábitos que esa no tiene.
            setElegida(null);
            setSaltados(null);
            setError(null);
          }}
        >
          ← Todas las plantillas
        </button>

        <div>
          <b>{elegida.name}</b>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>
            {elegida.source} · {total} min · {elegida.frequency.toLowerCase()}
          </p>
        </div>

        <ol className="rt-steps">
          {elegida.steps.map((paso, i) => (
            <li key={i}>
              <span className="rt-step-head">
                <b>{paso.title}</b>
                <span className="rt-step-min">{paso.durationMin} min</span>
              </span>
              <span className="rt-step-detail">{paso.detail}</span>
            </li>
          ))}
        </ol>

        <label className="text-xs flex flex-col gap-1" style={{ color: "var(--muted)" }}>
          Bloque de Autogestión del Tiempo
          <select value={occupationId} onChange={(e) => setOccupationId(e.target.value)}>
            <option value="">— sin ligar —</option>
            {occupations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.title} ({o.start}–{o.end})
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Anclarla a una hora concreta es la mitad del método en los dos libros. Puedes cambiarlo después.
        </p>

        {error && (
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}

        {saltados && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Rutina creada. Estos ya los tienes en otras rutinas, así que no se han duplicado:{" "}
            <b>{saltados.join(", ")}</b>. Un hábito solo puede vivir en una rutina a la vez.
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-2">
          {saltados ? (
            <>
              <span className="hidden sm:block grow" />
              <button type="button" className="btn-primary btn-sm w-full sm:w-auto" onClick={close}>
                Entendido
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn-ghost btn-sm w-full sm:w-auto" onClick={close} disabled={pending}>
                Cancelar
              </button>
              <span className="hidden sm:block grow" />
              <button
                type="button"
                className="btn-primary btn-sm w-full sm:w-auto"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await createRoutineFromTemplate(elegida.id, occupationId);
                    if (!result.ok) {
                      setError(result.reason ?? "No se pudo crear la rutina.");
                      return;
                    }
                    // Con hábitos saltados el panel se queda abierto: cerrarlo
                    // enseñaría la rutina incompleta sin haber contado por qué,
                    // y el aviso se perdería en el mismo clic que lo genera.
                    if (result.skipped && result.skipped.length > 0) {
                      setError(null);
                      setSaltados(result.skipped);
                      router.refresh();
                      return;
                    }
                    close();
                    router.refresh();
                  })
                }
              >
                {pending ? "Creando…" : "Crear esta rutina"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Se copian a tus rutinas: después las editas como cualquier otra. Si un paso es un hábito que ya llevas en otra
        rutina, se salta y te lo decimos: un hábito solo puede vivir en una, y duplicarlo partiría tu racha en dos.
      </p>

      {templates.map((t) => (
        <button key={t.id} type="button" className="ah-card" onClick={() => setElegida(t)}>
          <span className="ah-card-name">{t.name}</span>
          <span className="ah-card-cue">
            {t.steps.length} pasos · {routineTemplateDuration(t)} min
          </span>
          <span className="ah-card-two">{t.summary}</span>
        </button>
      ))}
    </div>
  );
}
