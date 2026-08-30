// Catálogo de plantillas de PROYECTO.
//
// POR QUÉ VIVE EN CÓDIGO Y NO EN LA BASE
// Mismo criterio que el catálogo de rutinas (D-044): esto es CONTENIDO, no
// datos del usuario. No tiene dueño, no lleva RLS y no cambia por persona. En
// código va versionado en git, se prueba sin levantar Postgres y no puede
// divergir entre entornos — que es justo lo que pasaría con un catálogo
// sembrado que alguien edita en producción.
//
// Al usar una plantilla se COPIA a las tablas del usuario. A partir de ahí es
// suya: editarla no toca el catálogo, y cambiar el catálogo no le reescribe
// nada a nadie.
//
// SOBRE LOS LIBROS EN LOS QUE SE APOYA
// Se usa su ESTRUCTURA, que es un hecho comprobable —que Lean Startup se
// organiza alrededor del bucle Construir-Medir-Aprender, o que Moran divide el
// camino en tres fases que llama Grind, Growth y Gold—, y todo lo que aquí se
// lee está escrito con nuestras palabras. No se reproduce texto de ninguna obra.
//
// QUÉ NO TRAE UNA PLANTILLA, Y POR QUÉ
//
//   - FECHAS. El horizonte va en el NOMBRE del grupo («Fase 1 · Grind (mes
//     1-4)»), que es honesto porque no promete nada. Poner `due` sería inventar
//     un ritmo que no es de nadie, y al mes medio tablero aparecería vencido —
//     contando como atraso en Home y en el hecho `execution.overdue` del motor.
//   - `impact`. Ese flag alimenta «tres tareas de impacto» en Home y los
//     minutos comprometidos del día. Cuáles lo son ESTA semana es del usuario;
//     una plantilla que marca ocho lo rompe.
//   - `deps`. Exigen los ids de las tareas ya insertadas y no resuelven nada
//     que el orden de los grupos no diga ya. `suggestProjectSequence` sigue
//     estando para eso.

import type { Priority } from "../types.ts";

export interface ProjectTemplateTask {
  title: string;
  /** Sin declarar = `Medium`, el mismo default que `taskSchema`. */
  priority?: Priority;
  /** Heredan el grupo del padre al insertarse, como exige createTask. */
  subtasks?: string[];
}

export interface ProjectTemplateGroup {
  name: string;
  /** Token de color del design system, como `task_groups.color` (0019). */
  color: string;
  tasks: ProjectTemplateTask[];
}

export interface ProjectTemplate {
  id: string;
  name: string;
  /** Una línea: qué proyecto es este y cuándo elegirlo. */
  summary: string;
  /** Libro y autor de los que sale la estructura, si los hay. Se atribuye. */
  source?: string;
  groups: ProjectTemplateGroup[];
}

const PURPLE = "var(--c-purple)";
const BLUE = "var(--c-blue)";
const TEAL = "var(--c-teal)";
const GREEN = "var(--c-green)";
const ORANGE = "var(--c-orange)";
const PINK = "var(--c-pink)";

export const PROJECT_TEMPLATES: readonly ProjectTemplate[] = [
  // ===========================================================================
  {
    id: "software-v1",
    name: "Producto de software · de la idea a la v1",
    summary: "Para construir y sacar la primera versión de algo. Termina donde empieza el uso real, no en el despliegue.",
    groups: [
      {
        name: "Descubrimiento",
        color: PURPLE,
        tasks: [
          { title: "Escribir el problema en una sola frase", priority: "High" },
          {
            title: "Hablar con cinco personas que lo tengan",
            priority: "High",
            subtasks: ["Preparar las preguntas", "Hacer las cinco conversaciones", "Escribir qué se repitió"]
          },
          { title: "Listar lo que ya existe y por qué no basta" },
          { title: "Decidir el alcance de la v1: qué NO entra", priority: "High" }
        ]
      },
      {
        name: "Diseño",
        color: BLUE,
        tasks: [
          { title: "Dibujar el recorrido principal de punta a punta", priority: "High" },
          { title: "Definir el modelo de datos" },
          { title: "Elegir la pila y escribir por qué esa" }
        ]
      },
      {
        name: "Construcción",
        color: TEAL,
        tasks: [
          {
            title: "Montar el esqueleto y el despliegue",
            priority: "High",
            subtasks: ["Repositorio y estructura", "Integración continua", "Entorno de producción vacío, ya desplegado"]
          },
          { title: "Construir el recorrido principal", priority: "High" },
          { title: "Construir lo que lo rodea (altas, ajustes, errores)" }
        ]
      },
      {
        name: "Calidad",
        color: ORANGE,
        tasks: [
          { title: "Pruebas del camino crítico", priority: "High" },
          { title: "Revisar en móvil y con teclado" },
          { title: "Repasar estados vacíos y mensajes de error" }
        ]
      },
      {
        name: "Lanzamiento",
        color: GREEN,
        tasks: [
          { title: "Lista de comprobación previa", priority: "High" },
          { title: "Publicar" },
          { title: "Avisar a las primeras personas" }
        ]
      },
      {
        name: "Después",
        color: PINK,
        tasks: [
          { title: "Recoger lo que dicen quienes lo usaron", priority: "High" },
          { title: "Decidir qué entra en la v2 y qué se descarta" }
        ]
      }
    ]
  },

  // ===========================================================================
  {
    id: "lean-startup",
    name: "Validar una idea · Lean Startup",
    source: "El método Lean Startup, de Eric Ries",
    summary:
      "Una vuelta completa del bucle Construir-Medir-Aprender. Termina en una decisión explícita: pivotar o perseverar.",
    groups: [
      {
        name: "Hipótesis",
        color: PURPLE,
        tasks: [
          { title: "Escribir la hipótesis de valor: por qué alguien lo querría", priority: "High" },
          { title: "Escribir la hipótesis de crecimiento: cómo llegaría a más gente", priority: "High" },
          { title: "Nombrar al cliente concreto, no a un segmento" },
          { title: "Definir por adelantado qué resultado refutaría la hipótesis", priority: "High" }
        ]
      },
      {
        name: "Construir · el MVP más pequeño",
        color: TEAL,
        tasks: [
          { title: "Elegir el experimento más barato que responda la pregunta", priority: "High" },
          { title: "Construir solo eso, y nada más" },
          { title: "Dejar la medición puesta ANTES de lanzar", priority: "High" }
        ]
      },
      {
        name: "Medir",
        color: BLUE,
        tasks: [
          {
            title: "Elegir las métricas que sostienen una decisión",
            priority: "High",
            subtasks: ["Escribir cuáles son", "Escribir cuáles se descartan por ser de vanidad"]
          },
          { title: "Separar a los usuarios por cohortes, no por totales acumulados" },
          { title: "Montar el panel donde se van a mirar" }
        ]
      },
      {
        name: "Aprender",
        color: ORANGE,
        tasks: [
          { title: "Reunión de resultados con los números delante", priority: "High" },
          { title: "Preguntar cinco veces «por qué» sobre lo que falló" },
          { title: "Decidir: pivotar o perseverar", priority: "High" }
        ]
      },
      {
        name: "Siguiente vuelta",
        color: GREEN,
        tasks: [{ title: "Escribir la hipótesis de la siguiente iteración", priority: "High" }]
      }
    ]
  },

  // ===========================================================================
  {
    id: "doce-meses",
    name: "De cero a un millón · negocio de producto",
    source: "12 Months to $1 Million, de Ryan Daniel Moran",
    summary:
      "Las tres fases del libro: aguantar hasta sostener 25 ventas al día, crecer con la gama y la audiencia, y cosechar.",
    groups: [
      {
        name: "Antes de empezar",
        color: PURPLE,
        tasks: [
          { title: "Elegir a UNA persona a la que servir", priority: "High" },
          { title: "Escribir qué le duele y qué compra hoy para resolverlo", priority: "High" },
          { title: "Decidir la categoría en la que vas a jugar" }
        ]
      },
      {
        name: "Fase 1 · Grind — llegar a 25 ventas al día",
        color: ORANGE,
        tasks: [
          { title: "Elegir de tres a cinco productos para esa misma persona", priority: "High" },
          {
            title: "Lanzar el primero",
            priority: "High",
            subtasks: ["Fabricación o proveedor", "Ficha y fotos", "Precio y márgenes", "Publicar"]
          },
          { title: "Conseguir las primeras reseñas reales" },
          { title: "Ajustar hasta SOSTENER 25 ventas diarias", priority: "High" }
        ]
      },
      {
        name: "Fase 2 · Growth — la gama y la audiencia",
        color: TEAL,
        tasks: [
          { title: "Lanzar el resto de la gama" },
          {
            title: "Construir audiencia propia, no alquilada",
            priority: "High",
            subtasks: ["Lista de correo", "Publicar con constancia", "Sitio donde la gente se junte"]
          },
          { title: "Medir margen y flujo de caja, no solo facturación", priority: "High" }
        ]
      },
      {
        name: "Fase 3 · Gold — ordenar y decidir",
        color: GREEN,
        tasks: [
          { title: "Poner las cuentas en orden" },
          { title: "Documentar cómo se opera sin ti", priority: "High" },
          { title: "Decidir: vender o quedártela", priority: "High" }
        ]
      }
    ]
  },

  // ===========================================================================
  {
    id: "servicios",
    name: "Negocio de servicios · los primeros 10 clientes",
    summary: "Para vender tu trabajo. Termina cuando tienes diez clientes y sabes qué parte del proceso se repite.",
    groups: [
      {
        name: "La oferta",
        color: PURPLE,
        tasks: [
          { title: "Definir el RESULTADO que vendes, no las horas", priority: "High" },
          { title: "Poner precio y escribir por qué ese" },
          { title: "Escribir a quién NO le sirve esto", priority: "High" }
        ]
      },
      {
        name: "El canal",
        color: BLUE,
        tasks: [
          { title: "Elegir UN canal y descartar el resto por ahora", priority: "High" },
          { title: "Preparar el mensaje de acercamiento" },
          { title: "Reunir la prueba social que ya tengas" }
        ]
      },
      {
        name: "Los primeros diez",
        color: ORANGE,
        tasks: [
          { title: "Lista de cincuenta candidatos con nombre", priority: "High" },
          { title: "Contactar a los primeros veinte", priority: "High" },
          { title: "Hacer las conversaciones de venta" },
          { title: "Cerrar los tres primeros" }
        ]
      },
      {
        name: "Entrega y repetición",
        color: GREEN,
        tasks: [
          { title: "Definir el proceso de entrega, paso a paso" },
          { title: "Pedir testimonio al terminar cada uno" },
          { title: "Decidir qué se puede estandarizar o delegar", priority: "High" }
        ]
      }
    ]
  },

  // ===========================================================================
  {
    id: "lanzamiento",
    name: "Lanzamiento o campaña",
    summary: "Para sacar algo al mundo en una fecha. Corto y con un número que decide si salió bien.",
    groups: [
      {
        name: "Antes",
        color: PURPLE,
        tasks: [
          { title: "Definir el objetivo en UN número", priority: "High" },
          { title: "Definir a quién le hablas" },
          { title: "Fijar la fecha y trabajar hacia atrás desde ella", priority: "High" }
        ]
      },
      {
        name: "Materiales",
        color: BLUE,
        tasks: [
          { title: "Escribir el mensaje principal", priority: "High" },
          { title: "Adaptar las piezas a cada canal" },
          { title: "Preparar la página de destino" }
        ]
      },
      {
        name: "La semana",
        color: ORANGE,
        tasks: [
          { title: "Publicar", priority: "High" },
          { title: "Responder a todo el mundo el mismo día" },
          { title: "Vigilar el número a diario" }
        ]
      },
      {
        name: "Después",
        color: GREEN,
        tasks: [
          { title: "Medir contra el objetivo que se fijó", priority: "High" },
          { title: "Escribir qué se repetiría y qué no" }
        ]
      }
    ]
  },

  // ===========================================================================
  {
    id: "contratar",
    name: "Contratar a alguien",
    summary: "Del hueco a la primera semana. La prueba práctica va pagada, porque trabajar gratis filtra a quien no lo necesita.",
    groups: [
      {
        name: "Definir",
        color: PURPLE,
        tasks: [
          { title: "Escribir qué problema resuelve este puesto", priority: "High" },
          { title: "Definir las señales de un buen candidato, y las de descarte", priority: "High" },
          { title: "Fijar el rango salarial antes de hablar con nadie" }
        ]
      },
      {
        name: "Buscar",
        color: BLUE,
        tasks: [
          { title: "Publicar la oferta con el rango dentro" },
          { title: "Pedir referidos a gente de confianza", priority: "High" },
          { title: "Revisar candidaturas" }
        ]
      },
      {
        name: "Evaluar",
        color: ORANGE,
        tasks: [
          { title: "Primera conversación, la misma para todos" },
          { title: "Prueba práctica pagada, acotada en tiempo", priority: "High" },
          { title: "Pedir referencias y llamarlas de verdad" }
        ]
      },
      {
        name: "Cerrar",
        color: GREEN,
        tasks: [
          { title: "Hacer la oferta", priority: "High" },
          {
            title: "Preparar los primeros treinta días",
            priority: "High",
            subtasks: ["Accesos y herramientas", "A quién conoce la primera semana", "Qué entrega el primer mes"]
          }
        ]
      }
    ]
  }
];

export function getProjectTemplate(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((t) => t.id === id);
}

export interface TemplateSummary {
  groups: number;
  tasks: number;
  subtasks: number;
}

/** Qué va a crear, para poder decirlo ANTES de crearlo. */
export function templateSummary(template: ProjectTemplate): TemplateSummary {
  let tasks = 0;
  let subtasks = 0;
  for (const group of template.groups) {
    tasks += group.tasks.length;
    for (const task of group.tasks) subtasks += task.subtasks?.length ?? 0;
  }
  return { groups: template.groups.length, tasks, subtasks };
}

export interface PlannedGroup {
  name: string;
  color: string;
  position: number;
  tasks: { title: string; priority: Priority; position: number; subtasks: string[] }[];
}

/**
 * Los grupos y tareas con su `position` ya calculada.
 *
 * `fromGroupPosition` es lo que hace correcto el «añadir al final»: aplicar una
 * plantilla sobre un proyecto que ya tiene grupos debe empezar DESPUÉS del
 * último, no en cero — si no, dos grupos comparten posición y el orden del
 * tablero pasa a depender de cuál devuelva antes la base.
 *
 * Las tareas, en cambio, siempre empiezan en 0: su posición es dentro de su
 * grupo, y el grupo es nuevo.
 */
export function plannedRows(template: ProjectTemplate, options: { fromGroupPosition?: number } = {}): PlannedGroup[] {
  const from = options.fromGroupPosition ?? 0;
  return template.groups.map((group, groupIndex) => ({
    name: group.name,
    color: group.color,
    position: from + groupIndex,
    tasks: group.tasks.map((task, taskIndex) => ({
      title: task.title,
      priority: task.priority ?? "Medium",
      position: taskIndex,
      subtasks: task.subtasks ?? []
    }))
  }));
}
