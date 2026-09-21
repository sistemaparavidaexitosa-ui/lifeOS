import type { Franja } from "@/lib/domain/centro/franja.ts";

export interface Apertura {
  saludo: string;
  contexto: string;
  pregunta: string;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const FRANJAS: Record<Franja, string> = {
  manana: "mañana",
  tarde: "tarde",
  noche: "noche"
};

function contextoDelMomento(diaSemana: number, franja: Franja): string {
  if (franja === "manana") {
    return diaSemana === 0 ? "El domingo empieza despacio." : "El día está por delante.";
  }

  if (franja === "tarde") {
    if (diaSemana === 0) return "El fin de semana sigue abierto.";
    if (diaSemana === 6) return "El sábado todavía da para algo tuyo.";
    if (diaSemana === 5) return "La semana se está cerrando.";
    return "Todavía puedes mover el día.";
  }

  if (diaSemana === 0) return "Mañana empieza la semana.";
  if (diaSemana === 5) return "Se acaba la semana.";
  if (diaSemana === 6) return "El fin de semana baja el ritmo.";
  return "El día ya puede quedar en orden.";
}

/** La primera voz del Centro: solo usa el momento y el estado que ya conocemos. */
export function aperturaDelCentro({
  nombre,
  franja,
  diaSemana,
  hayPlanDeManana,
  bloqueos
}: {
  nombre: string;
  franja: Franja;
  diaSemana: number;
  hayPlanDeManana: boolean;
  bloqueos: number;
}): Apertura {
  const dia = DIAS[diaSemana] ?? DIAS[0];
  const pregunta =
    bloqueos > 0
      ? "¿Quitamos lo que te frena?"
      : franja === "noche" && !hayPlanDeManana
        ? "¿Planeamos mañana?"
        : "¿Qué quieres hacer?";

  return {
    saludo: `${nombre}, es ${dia} por la ${FRANJAS[franja]}.`,
    contexto: contextoDelMomento(diaSemana, franja),
    pregunta
  };
}
