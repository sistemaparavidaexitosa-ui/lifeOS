"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { fdate, money0 } from "@/lib/format";
import HabitCheckbox from "@/components/habits/HabitCheckbox";
import VisualizationPlayer from "@/app/(app)/development/routines/brief/VisualizationPlayer";
import { marcarAccionDelDia } from "@/lib/identity/brief-actions";
import type { HabitLogEntry } from "@/lib/domain/development/habit-analytics.ts";
import type { HechoRitual, PasoRitual } from "@/lib/domain/ritual/types.ts";

/**
 * Un paso del arranque guiado, pintado.
 *
 * NUEVE PASOS EN UN ARCHIVO y no nueve archivos de quince líneas: son variantes
 * de la misma idea —un titular enorme y como mucho un control— y repartirlos
 * obligaría a saltar entre nueve pestañas para comprobar que la voz es la misma.
 *
 * Lo que sí vive fuera es todo lo que ya existía: la casilla del hábito
 * (`HabitCheckbox`) y el reproductor de la visualización
 * (`VisualizationPlayer`), que se usan tal cual.
 */

function Titulo({ children }: { children: React.ReactNode }) {
  // `tabIndex={-1}` y `data-ritual-title`: enfocable por código para que el
  // lector de pantalla lea el contenido al cambiar de paso, pero fuera del
  // recorrido del Tab. `abrirFoco()` lo busca por ese atributo.
  return (
    <h2 className="rit-title" tabIndex={-1} data-ritual-title>
      {children}
    </h2>
  );
}

function valorDelHecho(h: HechoRitual, currency: string, locale: string): string {
  if (h.unidad === "moneda") return money0(h.valor, currency, locale);
  if (h.unidad === "porcentaje") return `${h.valor}%`;
  if (h.unidad === "minutos") return `${h.valor} min`;
  return String(h.valor);
}

function AccionDelDia({ briefId, texto, hecha }: { briefId: string; texto: string; hecha: boolean }) {
  const [done, setDone] = useState(hecha);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <p className="rit-eyebrow">Tu acción de hoy</p>
      <Titulo>{texto}</Titulo>
      <button
        className="rit-skip"
        style={{ alignSelf: "flex-start", textDecoration: "none" }}
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const siguiente = !done;
            const r = await marcarAccionDelDia({ briefId, done: siguiente });
            if (r.ok) {
              setDone(siguiente);
              setError(null);
            } else {
              setError(r.reason ?? "No se pudo marcar.");
            }
          })
        }
        aria-pressed={done}
      >
        {done ? "✓ Hecha" : "Marcar como hecha"}
      </button>
      {error && (
        <p className="rit-muted" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

function HabitoDelDia({
  paso,
  today,
  inicial,
  onMarcado
}: {
  paso: Extract<PasoRitual, { kind: "routineStep" }>;
  today: string;
  /** Lo que ya se marcó en esta sesión del ritual, si se vuelve a este paso. */
  inicial: HabitLogEntry | null;
  onMarcado: (habitId: string, entry: HabitLogEntry | null) => void;
}) {
  const [entry, setEntry] = useState<HabitLogEntry | null>(inicial);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <p className="rit-eyebrow">{paso.routineName}</p>
      <Titulo>{paso.habit.name}</Titulo>
      <div className="rit-habit">
        <HabitCheckbox
          routineId={paso.routineId}
          habitId={paso.habit.id}
          today={today}
          entry={entry}
          size={72}
          onResult={(nuevo, err) => {
            setEntry(nuevo);
            setError(err);
            if (!err) onMarcado(paso.habit.id, nuevo);
          }}
        />
        <div className="min-w-0">
          <p className="rit-lead">{paso.habit.durationMin} min</p>
          {paso.habit.cue && <p className="rit-muted">{paso.habit.cue}</p>}
          {/* La versión de dos minutos solo mientras no esté hecho: una vez
              marcado, ofrecer la salida de emergencia sobra. */}
          {!entry && paso.habit.twoMinVersion && (
            <p className="rit-muted">Si hoy no puedes: {paso.habit.twoMinVersion}</p>
          )}
        </div>
      </div>
      {error && (
        <p className="rit-muted" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

/** A dónde lleva el cierre. Las rutas son las que ya existen, sin inventar ninguna. */
const DESTINOS = [
  { href: "/execution", label: "Proyectos y tareas" },
  { href: "/planning", label: "Planear el día" },
  { href: "/development/routines", label: "Rutinas" },
  { href: "/notebooks", label: "Notas" },
  { href: "/money", label: "Dinero" }
];

export default function RitualStep({
  paso,
  today,
  currency,
  locale,
  esperandoBrief,
  identidadDeclarada,
  marcados,
  onMarcado,
  onCerrar
}: {
  paso: PasoRitual;
  today: string;
  currency: string;
  locale: string;
  /** El respaldo del brief está generando: el paso de identidad aún no llegó. */
  esperandoBrief?: boolean;
  identidadDeclarada?: string | null;
  marcados: Record<string, HabitLogEntry | null>;
  onMarcado: (habitId: string, entry: HabitLogEntry | null) => void;
  onCerrar: () => void;
}) {
  switch (paso.kind) {
    case "greeting":
      return (
        <div className="rit-step">
          <Titulo>
            {paso.saludo}, {paso.nombre}.
          </Titulo>
          <p className="rit-muted">{fdate(paso.dateISO, locale)}</p>
          {/* Mientras el respaldo escribe el brief, se dice — y se dice con las
              palabras de la persona, no con texto generado. */}
          {esperandoBrief && identidadDeclarada && (
            <p className="rit-lead" style={{ marginTop: 18 }}>
              {identidadDeclarada}
            </p>
          )}
        </div>
      );

    case "affirmation":
      return (
        <div className="rit-step">
          <p className="rit-eyebrow">Comencemos con tu afirmación</p>
          <Titulo>{paso.items[0]?.text}</Titulo>
          {paso.items.length > 1 && (
            <ul className="rit-list" style={{ marginTop: 14 }}>
              {paso.items.slice(1, 5).map((a) => (
                <li key={a.id}>{a.text}</li>
              ))}
            </ul>
          )}
        </div>
      );

    case "mantra":
      return (
        <div className="rit-step">
          <p className="rit-eyebrow">Tu mantra de hoy</p>
          <Titulo>{paso.texto}</Titulo>
        </div>
      );

    case "visualization":
      return (
        <div className="rit-step">
          <p className="rit-eyebrow">Visualización · {paso.durationMin} min</p>
          <Titulo>{paso.titulo}</Titulo>
          {/* El reproductor que ya existe, con su temporizador y su vista en
              lista. No se reimplementa. */}
          <VisualizationPlayer visualization={{ title: paso.titulo, durationMin: paso.durationMin, steps: paso.steps }} />
        </div>
      );

    case "dailyAction":
      return (
        <div className="rit-step">
          <AccionDelDia briefId={paso.briefId} texto={paso.texto} hecha={paso.hecha} />
        </div>
      );

    case "routineStep":
      return (
        <div className="rit-step">
          <HabitoDelDia paso={paso} today={today} inicial={marcados[paso.habit.id] ?? null} onMarcado={onMarcado} />
        </div>
      );

    case "context":
      return (
        <div className="rit-step">
          <p className="rit-eyebrow">Tu día, en corto</p>
          <Titulo>Esto es lo que hay.</Titulo>
          <div className="rit-facts" style={{ marginTop: 18 }}>
            {paso.hechos.map((h) => (
              <div key={h.id} className="rit-fact" data-tono={h.tono}>
                <b>{valorDelHecho(h, currency, locale)}</b>
                <span>{h.etiqueta}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case "planToday":
      return (
        <div className="rit-step">
          <p className="rit-eyebrow">Lo que mueve el día</p>
          <Titulo>{paso.oneThing ?? "Tus tareas de impacto"}</Titulo>
          {paso.tareas.length > 0 && (
            <ul className="rit-list" style={{ marginTop: 18 }}>
              {paso.tareas.map((t) => (
                <li key={t.id}>{t.title}</li>
              ))}
            </ul>
          )}
        </div>
      );

    case "closing":
      return (
        <div className="rit-step">
          <Titulo>{paso.frase}</Titulo>
          <div className="flex flex-wrap gap-2" style={{ marginTop: 22 }}>
            {DESTINOS.map((d) => (
              <Link
                key={d.href}
                href={d.href}
                onClick={onCerrar}
                className="rit-skip"
                style={{
                  textDecoration: "none",
                  border: "1px solid var(--rit-line)",
                  borderRadius: 999,
                  padding: "10px 16px",
                  color: "var(--rit-text)"
                }}
              >
                {d.label}
              </Link>
            ))}
          </div>
        </div>
      );
  }
}
