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

/**
 * Para agrupar el selector. Con once plantillas, una lista plana obliga a
 * leerla entera para descartar diez; agrupada se salta al bloque que toca.
 */
export type ProjectTemplateCategory = "Trabajo y producto" | "Negocio" | "Marketing" | "Personal";

export const TEMPLATE_CATEGORIES: readonly ProjectTemplateCategory[] = [
  "Trabajo y producto",
  "Negocio",
  "Marketing",
  "Personal"
];

export interface ProjectTemplate {
  id: string;
  name: string;
  category: ProjectTemplateCategory;
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
    category: "Trabajo y producto",
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
    category: "Negocio",
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
    category: "Negocio",
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
    category: "Negocio",
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
    category: "Marketing",
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
    category: "Trabajo y producto",
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
  },

  // ===========================================================================
  {
    id: "contenido",
    category: "Marketing",
    name: "Motor de contenido · construir audiencia propia",
    summary:
      "Para dejar de alquilar la atención. No tiene fecha de fin: termina cuando publicar dejó de depender de la inspiración.",
    groups: [
      {
        name: "Posicionamiento",
        color: PURPLE,
        tasks: [
          { title: "Escribir sobre qué vas a ser la referencia", priority: "High" },
          { title: "Elegir de tres a cinco temas y no salirte de ellos", priority: "High" },
          { title: "Decidir a quién le hablas y qué ya sabe" }
        ]
      },
      {
        name: "El sistema de publicación",
        color: TEAL,
        tasks: [
          { title: "Fijar una frecuencia que puedas sostener el peor mes del año", priority: "High" },
          {
            title: "Montar el proceso de una pieza",
            subtasks: ["De dónde salen las ideas", "Cómo se escribe", "Quién la revisa", "Cómo se publica"]
          },
          { title: "Escribir con antelación para no publicar contra el reloj" }
        ]
      },
      {
        name: "Distribución",
        color: BLUE,
        tasks: [
          { title: "Elegir el canal principal, y uno de reparto", priority: "High" },
          { title: "Abrir la lista de correo: es la única audiencia que es tuya", priority: "High" },
          { title: "Reaprovechar cada pieza en los otros formatos" }
        ]
      },
      {
        name: "Medir y ajustar",
        color: ORANGE,
        tasks: [
          { title: "Elegir UNA métrica que de verdad importe" },
          { title: "Revisar cada mes qué funcionó y repetir esa forma", priority: "High" },
          { title: "Podar los temas que no llevan a ninguna parte" }
        ]
      }
    ]
  },

  // ===========================================================================
  {
    id: "embudo",
    category: "Marketing",
    name: "Embudo de captación · de desconocido a cliente",
    source: "las cinco etapas AARRR de Dave McClure",
    summary:
      "Ordena el camino completo en cinco etapas y obliga a medir cada una. Sirve para encontrar dónde se está perdiendo la gente.",
    groups: [
      {
        name: "Adquisición · cómo llegan",
        color: PURPLE,
        tasks: [
          { title: "Listar por dónde llega hoy la gente, con números", priority: "High" },
          { title: "Elegir el canal que vas a trabajar en serio" },
          { title: "Medir cuánto cuesta traer a una persona" }
        ]
      },
      {
        name: "Activación · la primera vez",
        color: TEAL,
        tasks: [
          { title: "Definir qué es un buen primer uso, en una frase", priority: "High" },
          { title: "Quitar todo lo que estorba antes de ese momento", priority: "High" },
          { title: "Medir cuántos llegan a él" }
        ]
      },
      {
        name: "Retención · si vuelven",
        color: BLUE,
        tasks: [
          { title: "Medir cuántos vuelven a la semana y al mes", priority: "High" },
          { title: "Hablar con tres que se fueron" },
          { title: "Arreglar el motivo que más se repita" }
        ]
      },
      {
        name: "Recomendación · si lo cuentan",
        color: GREEN,
        tasks: [
          { title: "Preguntar a quien ya volvió si lo recomendaría" },
          { title: "Ponérselo fácil a quien quiera contarlo" }
        ]
      },
      {
        name: "Ingreso · si paga",
        color: ORANGE,
        tasks: [
          { title: "Medir cuántos de los activados acaban pagando", priority: "High" },
          { title: "Comparar lo que cuesta traerlos con lo que dejan", priority: "High" }
        ]
      }
    ]
  },

  // ===========================================================================
  {
    id: "mudanza",
    category: "Personal",
    name: "Mudanza",
    summary: "De decidir el sitio a la primera noche durmiendo bien. Lo que se olvida siempre son los trámites.",
    groups: [
      {
        name: "Decidir y buscar",
        color: PURPLE,
        tasks: [
          { title: "Fijar el presupuesto máximo, todo incluido", priority: "High" },
          { title: "Escribir lo innegociable y lo que sí se negocia" },
          { title: "Ver sitios" },
          { title: "Elegir y firmar", priority: "High" }
        ]
      },
      {
        name: "Contratar y papeles",
        color: ORANGE,
        tasks: [
          { title: "Pedir tres presupuestos de transporte", priority: "High" },
          {
            title: "Dar de alta y de baja los suministros",
            priority: "High",
            subtasks: ["Luz", "Agua y gas", "Internet — pedirlo con semanas de margen"]
          },
          { title: "Cambiar la dirección donde haga falta" }
        ]
      },
      {
        name: "Empacar",
        color: TEAL,
        tasks: [
          { title: "Tirar o donar antes de empacar: no se muda lo que no se usa", priority: "High" },
          { title: "Empacar por habitación y etiquetar por dónde va" },
          { title: "Preparar la caja del primer día aparte", priority: "High" }
        ]
      },
      {
        name: "El día y después",
        color: GREEN,
        tasks: [
          { title: "Estado del piso viejo y devolución de llaves" },
          { title: "Mudanza" },
          { title: "Montar primero la cama y el baño", priority: "High" },
          { title: "Revisar que todo llegó entero" }
        ]
      }
    ]
  },

  // ===========================================================================
  {
    id: "empleo",
    category: "Personal",
    name: "Buscar trabajo o cambiar de carrera",
    summary: "Tratarlo como un proyecto y no como una espera. Termina con una decisión, no con una oferta.",
    groups: [
      {
        name: "Enfocar",
        color: PURPLE,
        tasks: [
          { title: "Escribir qué quieres de verdad del siguiente puesto", priority: "High" },
          { title: "Escribir lo que NO vuelves a aceptar", priority: "High" },
          { title: "Listar de veinte a treinta sitios donde te verías" }
        ]
      },
      {
        name: "Materiales",
        color: BLUE,
        tasks: [
          { title: "Currículum contando resultados, no responsabilidades", priority: "High" },
          { title: "Perfil público al día" },
          { title: "Preparar la respuesta a «háblame de ti»" }
        ]
      },
      {
        name: "Buscar y contactar",
        color: ORANGE,
        tasks: [
          { title: "Avisar a quien ya te conoce: por ahí salen la mayoría", priority: "High" },
          { title: "Aplicar a los de la lista" },
          { title: "Escribir a una persona concreta, no al buzón general" }
        ]
      },
      {
        name: "Procesos",
        color: TEAL,
        tasks: [
          {
            title: "Preparar cada entrevista",
            priority: "High",
            subtasks: ["Qué hace la empresa y cómo gana dinero", "Tus tres ejemplos con números", "Tus preguntas para ellos"]
          },
          { title: "Escribir después de cada una qué salió mal" },
          { title: "Llevar la cuenta de en qué punto está cada proceso" }
        ]
      },
      {
        name: "Decidir",
        color: GREEN,
        tasks: [
          { title: "Negociar la oferta", priority: "High" },
          { title: "Comparar contra lo que escribiste al principio", priority: "High" },
          { title: "Salir bien del sitio anterior" }
        ]
      }
    ]
  },

  // ===========================================================================
  {
    id: "certificacion",
    category: "Personal",
    name: "Certificación o examen",
    summary: "Para una fecha fija que no se mueve. El bloque de práctica va antes de terminar el temario, no después.",
    groups: [
      {
        name: "Planear",
        color: PURPLE,
        tasks: [
          { title: "Inscribirse y pagar: la fecha en firme cambia todo", priority: "High" },
          { title: "Conseguir el temario oficial y saber cómo puntúa" },
          { title: "Repartir el temario en las semanas que quedan", priority: "High" },
          { title: "Reservar el hueco de estudio en la agenda, no el rato que sobre", priority: "High" }
        ]
      },
      {
        name: "Estudiar",
        color: TEAL,
        tasks: [
          { title: "Primera pasada completa al temario" },
          { title: "Repaso espaciado de lo que ya diste", priority: "High" },
          { title: "Apuntar aparte lo que se resiste" }
        ]
      },
      {
        name: "Practicar",
        color: ORANGE,
        tasks: [
          { title: "Primer simulacro completo, cronometrado", priority: "High" },
          { title: "Corregir y volver solo sobre los fallos" },
          { title: "Dos simulacros más en condiciones reales" }
        ]
      },
      {
        name: "La semana del examen",
        color: GREEN,
        tasks: [
          { title: "Repasar solo lo marcado, nada nuevo" },
          { title: "Comprobar sede, hora y qué hay que llevar", priority: "High" },
          { title: "Dormir: el último día no se gana estudiando" }
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
