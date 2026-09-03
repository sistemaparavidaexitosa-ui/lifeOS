// tests/domain/templates-catalogo.test.ts
//
// La mudanza del catálogo de código a base (migración 0044) es la clase de
// cambio que puede perder contenido en silencio: nadie cuenta veinticuatro
// plantillas a mano, y una que se caiga del `insert` no rompe ninguna pantalla
// — simplemente deja de ofrecerse, y quizá se note meses después.
//
// Estas pruebas son el recibo de la mudanza. Y siguen sirviendo después de
// ella: la semilla es el catálogo con el que arranca cualquier entorno nuevo,
// así que editarla mal es un despliegue con el catálogo roto.

import { test } from "node:test";
import assert from "node:assert/strict";
import { FILAS_SEMBRADAS } from "./seed-catalogo.ts";
import { TEMPLATE_SCHEMA_BY_KIND, slugSchema } from "../../src/lib/domain/templates/schema.ts";

// Los identificadores que tenía el catálogo en código, escritos a mano aquí a
// propósito: si algún día uno desaparece del `insert`, esta lista es la única
// que puede protestar. Los ids son además lo que viaja en las acciones de
// aplicar, así que renombrar uno rompería un enlace guardado.
const ESPERADOS = {
  project: [
    "software-v1", "lean-startup", "doce-meses", "servicios", "lanzamiento", "contratar",
    "contenido", "embudo", "mudanza", "empleo", "certificacion"
  ],
  routine: ["savers-60", "savers-6", "club-5am"],
  habit: [
    "moverme", "agua", "hora-de-dormir", "leer", "apuntar-lo-aprendido", "tres-tareas",
    "cierre-del-dia", "gratitud", "meditar", "llamar"
  ]
} as const;

for (const [kind, esperados] of Object.entries(ESPERADOS) as [keyof typeof ESPERADOS, readonly string[]][]) {
  test(`la semilla trae exactamente las plantillas de ${kind} que había en código`, () => {
    const sembrados = FILAS_SEMBRADAS.filter((f) => f.kind === kind).map((f) => f.slug);
    assert.deepStrictEqual(sembrados, [...esperados]);
  });
}

test("toda plantilla sembrada pasa el esquema con el que se lee y se guarda", () => {
  // Es la misma validación que corre `parseTemplate` al leer la tabla. Si una
  // fila sembrada no la pasara, la capa de datos la descartaría y la plantilla
  // sería invisible en producción sin que nada fallara ruidosamente.
  for (const fila of FILAS_SEMBRADAS) {
    const r = TEMPLATE_SCHEMA_BY_KIND[fila.kind].safeParse(fila.payload);
    assert.ok(r.success, `${fila.kind}/${fila.slug} no pasa el esquema: ${JSON.stringify(r.error?.issues)}`);
  }
});

test("el slug de la columna y el id de dentro del payload son el mismo", () => {
  // La columna es por dónde se busca; el `id` del payload es lo que la interfaz
  // devuelve al aplicar. Si se separaran, el selector ofrecería una plantilla
  // cuyo identificador no encuentra nadie.
  for (const fila of FILAS_SEMBRADAS) {
    assert.strictEqual((fila.payload as { id: string }).id, fila.slug);
  }
});

test("todo slug sembrado es un identificador válido y único dentro de su tipo", () => {
  for (const fila of FILAS_SEMBRADAS) {
    assert.ok(slugSchema.safeParse(fila.slug).success, `slug inválido: ${fila.slug}`);
  }
  for (const kind of ["project", "routine", "habit"] as const) {
    const slugs = FILAS_SEMBRADAS.filter((f) => f.kind === kind).map((f) => f.slug);
    assert.strictEqual(new Set(slugs).size, slugs.length, `slug repetido en ${kind}`);
  }
});

test("la semilla nace publicada y en el orden en que estaba el array", () => {
  // Sembrarla en borrador dejaría la aplicación sin catálogo el día del
  // despliegue, con los selectores vacíos y sin ningún error que lo explique.
  for (const kind of ["project", "routine", "habit"] as const) {
    const filas = FILAS_SEMBRADAS.filter((f) => f.kind === kind);
    assert.ok(filas.every((f) => f.status === "published"), `alguna de ${kind} nace en borrador`);
    assert.deepStrictEqual(filas.map((f) => f.position), filas.map((_, i) => i));
  }
});

test("una fecha o un impact que se cuelen en una tarea NUNCA llegan a guardarse", () => {
  // Las dos ausencias que documenta project-templates.ts —sin `due`, sin
  // `impact`— dejaron de estar garantizadas por el compilador cuando el
  // catálogo salió del código. Quien las garantiza ahora es este esquema, y lo
  // hace DESCARTÁNDOLAS, no rechazando la plantilla entera: zod no admite
  // claves que no declara, y la acción del panel guarda lo que sale del parseo,
  // nunca lo que entró. Así una fecha inventada no puede llegar a la tabla ni
  // aunque alguien la escriba en el formulario a mano.
  //
  // Rechazar en vez de descartar sería peor en el otro extremo: al LEER, una
  // clave de sobra escondería la plantilla entera del selector.
  const base = {
    id: "prueba", name: "Prueba", category: "Personal", summary: "Una plantilla de prueba",
    groups: [
      { name: "G", color: "var(--c-purple)", tasks: [{ title: "T", due: "2026-01-01", impact: true }] }
    ]
  };
  const r = TEMPLATE_SCHEMA_BY_KIND.project.safeParse(base);
  assert.ok(r.success, "la plantilla en sí es válida");
  const tarea = r.data!.groups[0].tasks[0];
  assert.ok(!("due" in tarea), "`due` tendría que haberse quedado fuera");
  assert.ok(!("impact" in tarea), "`impact` tendría que haberse quedado fuera");
});

test("un color que no sale del design system NO pasa el esquema", () => {
  // Un `#hex` inventado rompe el tema claro/oscuro, que se apoya en los tokens.
  const malo = {
    id: "prueba", name: "Prueba", category: "Personal", summary: "Una plantilla de prueba",
    groups: [{ name: "G", color: "#ff0000", tasks: [{ title: "T" }] }]
  };
  assert.ok(!TEMPLATE_SCHEMA_BY_KIND.project.safeParse(malo).success);
});
