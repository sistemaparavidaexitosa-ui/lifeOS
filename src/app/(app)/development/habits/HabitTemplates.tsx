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
import { useState } from "react";
import FormSheet from "../FormSheet";
import { HabitFields, type HabitOption } from "./HabitForm";
import { habitTemplatesByCategory, type HabitTemplate } from "@/lib/domain/development/templates.ts";

interface OccupationLite {
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
export default function HabitTemplates({
  occupations,
  otherHabits,
  templates
}: {
  occupations: OccupationLite[];
  otherHabits: HabitOption[];
  templates: HabitTemplate[];
}) {
  return (
    <FormSheet label="Plantillas" title="Plantillas de hábitos">
      {(close) => (
        <Contenido occupations={occupations} otherHabits={otherHabits} templates={templates} close={close} />
      )}
    </FormSheet>
  );
}

function Contenido({
  occupations,
  otherHabits,
  templates,
  close
}: {
  occupations: OccupationLite[];
  otherHabits: HabitOption[];
  templates: HabitTemplate[];
  close: () => void;
}) {
  const [elegida, setElegida] = useState<HabitTemplate | null>(null);

  if (elegida) {
    return (
      <div className="flex flex-col gap-3">
        <button type="button" className="nb-crumb-back" style={{ alignSelf: "flex-start" }} onClick={() => setElegida(null)}>
          ← Todas las plantillas
        </button>
        <div className="ah-why">{elegida.why}</div>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Cámbialo todo lo que haga falta antes de guardar: la señal solo funciona si describe <b>tu</b> día.
        </p>
        <HabitFields
          occupations={occupations}
          otherHabits={otherHabits}
          prefill={{
            name: elegida.name,
            category: elegida.category,
            frequency: elegida.frequency,
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

      {habitTemplatesByCategory(templates).map((grupo) => (
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
