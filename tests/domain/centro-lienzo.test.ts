// tests/domain/centro-lienzo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { tarjetasDelCentro, MAX_TARJETAS, type EntradaLienzo } from "../../src/lib/domain/centro/lienzo.ts";

// El centro dice QUÉ HACER, una cosa a la vez (D-169). Aquí se fija el orden
// —por lo que caduca antes— y la regla de siempre: ninguna tarjeta sin su dato.

function entrada(e: Partial<EntradaLienzo> = {}): EntradaLienzo {
  return {
    resumen: "",
    proximoHabito: null,
    propuestas: [],
    unicaCosa: null,
    vencidas: 0,
    diasParaFinDeQuincena: 10,
    presupuestoEnRojo: false,
    ...e
  };
}

const habito = {
  routineId: "r1",
  routineName: "Mañana",
  habitId: "h1",
  nombre: "Tomar agua",
  durationMin: 2
};

const propuesta = { id: "pr1", tipo: "foco", titulo: "Sigue con Rediseño", motivo: "12 movimientos", href: "/execution" };

const kinds = (e: EntradaLienzo, pospuestas: string[] = []) => tarjetasDelCentro(e, pospuestas).map((t) => t.kind);

test("Un día vacío abre directamente en el cierre, que sigue sirviendo", () => {
  assert.deepStrictEqual(kinds(entrada()), ["cierre"]);
});

test("El cierre es SIEMPRE la última", () => {
  const e = entrada({ resumen: "vas bien", proximoHabito: habito, vencidas: 2 });
  const t = tarjetasDelCentro(e, []);
  assert.strictEqual(t[t.length - 1]?.kind, "cierre");
  assert.strictEqual(t.filter((x) => x.kind === "cierre").length, 1);
});

test("El orden es por lo que caduca antes", () => {
  const e = entrada({
    resumen: "Llevas dos días sin tocar Rediseño.",
    proximoHabito: habito,
    propuestas: [propuesta],
    unicaCosa: "Cerrar la propuesta",
    vencidas: 3,
    diasParaFinDeQuincena: 1
  });
  assert.deepStrictEqual(kinds(e), [
    "apertura",
    "habito",
    "propuesta",
    "unicaCosa",
    "dinero",
    "vencidas",
    "cierre"
  ]);
});

test("Sin resumen no hay apertura: un hueco se lee como un error", () => {
  assert.ok(!kinds(entrada({ proximoHabito: habito })).includes("apertura"));
});

test("Sin hábito pendiente no hay tarjeta de hábito", () => {
  assert.ok(!kinds(entrada({ vencidas: 1 })).includes("habito"));
});

test("La tarjeta del hábito lleva lo necesario para marcarlo sin salir", () => {
  const [t] = tarjetasDelCentro(entrada({ proximoHabito: habito }), []);
  assert.strictEqual(t?.kind, "habito");
  assert.strictEqual(t.kind === "habito" && t.routineId, "r1");
  assert.strictEqual(t.kind === "habito" && t.habitId, "h1");
  assert.ok(t.titulo.includes("Tomar agua"));
});

test("Una propuesta conserva su id y usa su motivo como voz", () => {
  const [t] = tarjetasDelCentro(entrada({ propuestas: [propuesta] }), []);
  assert.strictEqual(t?.kind, "propuesta");
  assert.strictEqual(t.kind === "propuesta" && t.propuestaId, "pr1");
  assert.strictEqual(t.voz, "12 movimientos");
  assert.strictEqual(t.titulo, "Sigue con Rediseño");
});

test("Un `foco` invita a ir; lo que crea, a añadir", () => {
  const [ir] = tarjetasDelCentro(entrada({ propuestas: [propuesta] }), []);
  assert.strictEqual(ir.kind === "propuesta" && ir.accion, "Ir");
  const [anadir] = tarjetasDelCentro(entrada({ propuestas: [{ ...propuesta, tipo: "tarea", href: null }] }), []);
  assert.strictEqual(anadir.kind === "propuesta" && anadir.accion, "Añadir");
});

test("La Única Cosa solo si existe", () => {
  assert.ok(!kinds(entrada({ unicaCosa: null })).includes("unicaCosa"));
  assert.ok(kinds(entrada({ unicaCosa: "Cerrar la propuesta" })).includes("unicaCosa"));
});

test("Dinero solo cuando aprieta", () => {
  assert.ok(!kinds(entrada({ diasParaFinDeQuincena: 9 })).includes("dinero"));
  assert.ok(kinds(entrada({ diasParaFinDeQuincena: 2 })).includes("dinero"));
  assert.ok(kinds(entrada({ diasParaFinDeQuincena: 12, presupuestoEnRojo: true })).includes("dinero"));
});

test("Las vencidas solo si las hay, y lo dicen en plural o singular", () => {
  assert.ok(!kinds(entrada({ vencidas: 0 })).includes("vencidas"));
  const [t] = tarjetasDelCentro(entrada({ vencidas: 1 }), []);
  assert.ok(t.voz.includes("1 tarea"), `voz: «${t.voz}»`);
  const [t2] = tarjetasDelCentro(entrada({ vencidas: 4 }), []);
  assert.ok(t2.voz.includes("4 tareas"), `voz: «${t2.voz}»`);
});

test("Nunca más del tope antes del cierre: no es una bandeja", () => {
  const muchas = Array.from({ length: 12 }, (_, i) => ({ ...propuesta, id: `pr${i}`, titulo: `Cosa ${i}` }));
  const t = tarjetasDelCentro(entrada({ resumen: "x", proximoHabito: habito, propuestas: muchas, vencidas: 2 }), []);
  assert.ok(t.filter((x) => x.kind !== "cierre").length <= MAX_TARJETAS);
});

test("Lo pospuesto va al final, antes del cierre, y no se duplica", () => {
  const e = entrada({ proximoHabito: habito, propuestas: [propuesta], vencidas: 1 });
  const t = tarjetasDelCentro(e, ["r1:h1"]);
  const orden = t.map((x) => x.kind);
  assert.strictEqual(orden[0], "propuesta");
  assert.strictEqual(orden[orden.length - 2], "habito");
  assert.strictEqual(t.filter((x) => x.kind === "habito").length, 1);
});

test("Todo lo que no es el cierre lleva algo que hacer", () => {
  const e = entrada({ resumen: "x", proximoHabito: habito, propuestas: [propuesta], unicaCosa: "y", vencidas: 1, diasParaFinDeQuincena: 1 });
  for (const t of tarjetasDelCentro(e, [])) {
    if (t.kind === "cierre" || t.kind === "apertura") continue;
    assert.ok(t.titulo.length > 0, `«${t.kind}» salió sin título`);
  }
});
