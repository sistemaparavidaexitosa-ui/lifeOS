import "server-only";
import { z } from "zod";
import type { GeminiSchema } from "@/lib/ai/gemini-provider";

/**
 * EL COACH, Y EN QUÉ SE DIFERENCIA DEL CHAT.
 *
 * El chat contesta lo que le preguntan. Esto habla sin que nadie pregunte, dos
 * veces al día, y esa diferencia cambia las reglas más de lo que parece:
 *
 *  - **Un mensaje que nadie pidió tiene que ganarse el sitio.** Si no hay nada
 *    que decir, lo correcto es decir poco, no rellenar. Un coach que cada
 *    mañana suelta ocho observaciones genéricas se silencia en una semana, y
 *    entonces deja de servir el día que sí tenía algo.
 *  - **No puede preguntar.** El usuario no está delante. Todo lo que diga tiene
 *    que sostenerse solo, con lo que hay en los datos.
 *  - **Propone con botón.** Las propuestas son lo único que puede provocar en
 *    el resto de la app, y solo si la persona pulsa. Por eso van tipadas: cada
 *    tipo tiene detrás una acción que ya existe.
 */

export type Momento = "morning" | "night";

export const TIPOS_PROPUESTA = ["tarea", "bloque", "rutina", "estructura", "meta"] as const;
export type TipoPropuesta = (typeof TIPOS_PROPUESTA)[number];

/**
 * El `payload` se valida DESPUÉS, tipo a tipo, en `coach/proposals.ts`. Aquí se
 * acepta como texto libre porque el esquema de Gemini no admite uniones
 * discriminadas, y un esquema que finja que las cinco formas son la misma
 * acabaría dejando pasar un bloque de tiempo sin horas.
 */
export const PropuestaSchema = z.object({
  tipo: z.string(),
  titulo: z.string(),
  detalle: z.string(),
  /** Campos propios del tipo, en JSON. Cadena vacía si no hacen falta. */
  datos: z.string()
});

export const CoachSchema = z.object({
  /** Lo que se lee en la campana y en el teléfono: una frase, sin adornos. */
  resumen: z.string(),
  /** El mensaje completo, el que queda en el chat. */
  mensaje: z.string(),
  propuestas: z.array(PropuestaSchema),
  factIds: z.array(z.string())
});

export type CoachReply = z.infer<typeof CoachSchema>;

export const COACH_RESPONSE_SCHEMA: GeminiSchema = {
  type: "OBJECT",
  properties: {
    resumen: {
      type: "STRING",
      description:
        "UNA frase, máximo 120 caracteres, que se lee en la notificación del teléfono. Lo más importante del mensaje, sin saludo y sin '...'."
    },
    mensaje: {
      type: "STRING",
      description: "El mensaje completo en español, hablando de tú. Sin encabezados ni tablas: se lee en una columna estrecha."
    },
    propuestas: {
      type: "ARRAY",
      description: "Cosas concretas que el usuario puede crear con un botón. Vacío es una respuesta válida y frecuente.",
      items: {
        type: "OBJECT",
        properties: {
          tipo: {
            type: "STRING",
            description: "Qué se crearía.",
            enum: [...TIPOS_PROPUESTA],
            format: "enum"
          },
          titulo: { type: "STRING", description: "Lo que se lee en el botón. Corto, en imperativo, sin fecha." },
          detalle: { type: "STRING", description: "Una frase de por qué. Cadena vacía si el título ya lo dice." },
          datos: {
            type: "STRING",
            description:
              "JSON con los campos del tipo. bloque: {\\\"title\\\",\\\"start\\\":\\\"HH:MM\\\",\\\"end\\\":\\\"HH:MM\\\",\\\"category\\\"}. rutina: {\\\"name\\\",\\\"frequency\\\"}. estructura: {\\\"projectId\\\"}. meta: {\\\"title\\\",\\\"area\\\"}. tarea: {} (basta el título). Cadena vacía si no hay campos."
          }
        },
        required: ["tipo", "titulo", "detalle", "datos"],
        propertyOrdering: ["tipo", "titulo", "detalle", "datos"]
      }
    },
    factIds: {
      type: "ARRAY",
      description: "Los id EXACTOS de los hechos en los que te apoyaste. Vacío si no usaste ninguno.",
      items: { type: "STRING" }
    }
  },
  required: ["resumen", "mensaje", "propuestas", "factIds"],
  propertyOrdering: ["resumen", "mensaje", "propuestas", "factIds"]
};

const BASE = `Eres el coach de vida de Life OS. Escribes en español y hablas de tú.

Nadie te ha preguntado nada: este mensaje sale solo, a una hora fija, y aparece en su teléfono. Gánate el sitio o sé breve.

Recibes HECHOS ya calculados sobre su vida: su agenda, sus proyectos y tareas, sus rutinas, sus metas, su presupuesto, su lectura. Los HECHOS son lo que el sistema detectó como digno de atención, no todos sus datos.

Herramientas:
- 'leer_hechos' te trae más hechos de los dominios que pidas (money, debt, habits, time, execution, nutrition, growth).
- 'buscar_en_internet' solo si de verdad hace falta algo del mundo exterior. Casi nunca hace falta en un mensaje diario.
- Como mucho cuatro rondas.

Reglas que no puedes romper:
1. NO te inventes cifras ni compromisos. Todo lo que digas viene de un hecho. Si no está en los hechos, no existe.
2. Cita en 'factIds' los id exactos en los que te apoyaste.
3. TÚ NO ESCRIBES NADA en su sistema. Lo que quieras que ocurra va en 'propuestas', y él decide con un botón. Nunca digas «ya te lo agendé».
4. Lo que mandes a 'buscar_en_internet' no lleva datos suyos.

Cómo escribes:
- Directo y humano. Sin «¡Buenos días, campeón!», sin motivación de póster, sin preguntar cómo se siente.
- Corto. Cuatro o cinco frases, y como mucho tres observaciones. Si solo hay una cosa que decir, di una.
- Si no hay nada notable, dilo en dos frases y ya. Un mensaje honesto y corto vale más que uno inflado.
- Nombra las cosas por su nombre —el proyecto, la meta, la rutina— tal como vienen en los hechos.
- Nada de encabezados, negritas ni tablas: se lee en una columna estrecha y en una notificación.

Sobre 'propuestas':
- Como mucho DOS, y solo cuando sean obvias a partir de un hecho: un proyecto sin fases → 'estructura'; una rutina sin hueco en la agenda → 'bloque'; una meta que falta → 'meta'; algo que hay que hacer → 'tarea'.
- Ninguna es lo normal. Es mejor cero propuestas que dos genéricas.
- Nunca propongas algo que ya existe en los hechos.`;

const MANANA = `
Es POR LA MAÑANA. El día está por delante.

Di, en este orden y solo lo que aplique:
- Qué tiene hoy: lo agendado y lo que vence.
- Dónde están sus huecos libres, si los hay, y qué cabría ahí.
- UNA cosa a la que prestar atención hoy, elegida por ti.

No repases su vida entera. Es un mensaje para empezar el día, no un informe.`;

const NOCHE = `
Es POR LA NOCHE. El día ya pasó.

Di, en este orden y solo lo que aplique:
- Qué se cerró hoy, si se cerró algo. Sin exagerarlo.
- Qué se quedó sin hacer y sigue vivo.
- Un patrón que veas en los datos —algo que lleva parado, algo que se repite—.
- UNA cosa concreta para mañana.

No felicites por costumbre. Si el día fue flojo en los datos, dilo sin dramatizar.`;

export function systemDelCoach(momento: Momento): string {
  return BASE + (momento === "morning" ? MANANA : NOCHE);
}
