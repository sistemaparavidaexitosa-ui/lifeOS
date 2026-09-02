"use client";
// Plantillas de hábitos, basadas en «Hábitos atómicos» de James Clear.
//
// LA DECISIÓN QUE GOBIERNA ESTA PANTALLA
// La plantilla PRELLENA el formulario, no crea el hábito en silencio. La señal
// es personal —«después de *mi* café», no del café genérico— y si se guardara
// tal cual quedaría una frase que su dueño no reconoce y que por tanto no
// dispara nada. Elegir una plantilla es el primer paso de dos.
//
// Un solo panel para los dos pasos, y no un drawer dentro de otro: dos hojas
// apiladas en un móvil son una trampa, porque cerrar la de arriba parece
// cerrarlo todo y se pierde lo escrito.
//
// Desde 0045 hay un paso previo a los dos: elegir la rutina. Un hábito ya no
// vive suelto —siempre está dentro de una rutina— así que antes de prellenar
// el formulario hay que decidir a cuál se suma.
import { useState } from "react";
import FormSheet from "../FormSheet";
import { HabitFields, type HabitOption } from "./HabitForm";
import { habitTemplatesByCategory, type HabitTemplate } from "@/lib/domain/development/templates.ts";

export default function HabitTemplates({
  routines,
  otherHabits
}: {
  routines: { id: string; name: string }[];
  otherHabits: HabitOption[];
}) {
  return (
    <FormSheet label="Plantillas" title="Plantillas de hábitos">
      {(close) => <Contenido routines={routines} otherHabits={otherHabits} close={close} />}
    </FormSheet>
  );
}

function Contenido({
  routines,
  otherHabits,
  close
}: {
  routines: { id: string; name: string }[];
  otherHabits: HabitOption[];
  close: () => void;
}) {
  const [elegida, setElegida] = useState<HabitTemplate | null>(null);
  const [routineId, setRoutineId] = useState("");

  if (elegida) {
    if (!routineId) {
      return (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            className="nb-crumb-back"
            style={{ alignSelf: "flex-start" }}
            onClick={() => {
              setElegida(null);
              setRoutineId("");
            }}
          >
            ← Todas las plantillas
          </button>
          <div className="ah-why">{elegida.why}</div>
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            ¿A qué rutina se suma? Un hábito solo se sostiene dentro de una cadena: la rutina es la que decide cuándo
            toca y la que tira de él los días malos.
          </p>
          {routines.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--danger)" }}>
              Todavía no tienes ninguna rutina. Crea una primero —o parte de una plantilla de rutina— y vuelve aquí.
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {routines.map((r) => (
                <button key={r.id} type="button" className="ah-card" onClick={() => setRoutineId(r.id)}>
                  <span className="ah-card-name">{r.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3">
        <button type="button" className="nb-crumb-back" style={{ alignSelf: "flex-start" }} onClick={() => setRoutineId("")}>
          ← Otra rutina
        </button>
        <div className="ah-why">{elegida.why}</div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Cámbialo todo lo que haga falta antes de guardar: la señal solo funciona si describe <b>tu</b> día.
        </p>
        <HabitFields
          routineId={routineId}
          otherHabits={otherHabits}
          position={0}
          prefill={{
            name: elegida.name,
            category: elegida.category,
            cue: elegida.cue,
            twoMinVersion: elegida.twoMinVersion
          }}
          close={close}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Basadas en <b>Hábitos atómicos</b>, de James Clear. Cada una trae su señal («después de qué») y su versión de dos
        minutos, que son las dos piezas que deciden si el hábito se sostiene.
      </p>

      {habitTemplatesByCategory().map((grupo) => (
        <section key={grupo.category}>
          <h4 className="font-bold text-sm mb-1">{grupo.category}</h4>
          <div className="flex flex-col gap-1.5">
            {grupo.templates.map((t) => (
              <button key={t.id} type="button" className="ah-card" onClick={() => setElegida(t)}>
                <span className="ah-card-name">{t.name}</span>
                <span className="ah-card-cue">{t.cue}</span>
                <span className="ah-card-two">Dos minutos: {t.twoMinVersion}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
