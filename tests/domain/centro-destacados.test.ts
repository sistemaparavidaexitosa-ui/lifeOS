// tests/domain/centro-destacados.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { destacadosDelCentro, MAX_DESTACADOS, type SenalesDelDia } from "../../src/lib/domain/centro/destacados.ts";

// «Sigue por aquí» (D-168): la fila que hace que el menú se sienta vivo. Se
// calcula SIN IA, con reglas, para que llegue con el primer HTML y sea siempre
// exacta. Lo que se fija aquí es qué merece estar y en qué orden.

function senales(s: Partial<SenalesDelDia> = {}): SenalesDelDia {
  return {
    proyectoActivo: null,
    vencidas: 0,
    habitosPendientes: 0,
    diasParaFinDeQuincena: 10,
    presupuestoEnRojo: false,
    ...s
  };
}

const hrefs = (s: SenalesDelDia, ya: string[] = []) => destacadosDelCentro(s, ya).map((d) => d.href);

test("Sin señales no hay fila: el menú completo sigue justo debajo", () => {
  assert.deepStrictEqual(destacadosDelCentro(senales(), []), []);
});

test("El proyecto con movimiento va primero, con su cifra", () => {
  const s = senales({ proyectoActivo: { id: "p1", title: "Rediseño", movimientos: 12 } });
  const [primero] = destacadosDelCentro(s, []);
  assert.strictEqual(primero?.href, "/execution?project=p1");
  assert.strictEqual(primero?.label, "Rediseño");
  assert.ok(primero?.motivo.includes("12"), `el motivo debería citar la cifra: «${primero?.motivo}»`);
});

test("Un proyecto sin movimiento no se destaca", () => {
  assert.deepStrictEqual(hrefs(senales({ proyectoActivo: { id: "p1", title: "Quieto", movimientos: 0 } })), []);
});

test("Las tareas vencidas llevan a Proyectos y Tareas", () => {
  assert.ok(hrefs(senales({ vencidas: 3 })).includes("/execution"));
});

test("Los hábitos pendientes llevan a Rutinas", () => {
  assert.ok(hrefs(senales({ habitosPendientes: 2 })).includes("/development/routines"));
});

test("Dinero aparece cuando la quincena está por cerrar", () => {
  assert.ok(!hrefs(senales({ diasParaFinDeQuincena: 9 })).includes("/money"));
  assert.ok(hrefs(senales({ diasParaFinDeQuincena: 2 })).includes("/money"));
});

test("Dinero aparece también con el presupuesto en rojo, aunque queden días", () => {
  assert.ok(hrefs(senales({ diasParaFinDeQuincena: 12, presupuestoEnRojo: true })).includes("/money"));
});

test("No se repite un destino que ya está en «Lo siguiente»", () => {
  const s = senales({ vencidas: 3, habitosPendientes: 1 });
  assert.ok(!hrefs(s, ["/execution"]).includes("/execution"));
  assert.ok(hrefs(s, ["/execution"]).includes("/development/routines"));
});

test("Nunca más de cinco", () => {
  const s = senales({
    proyectoActivo: { id: "p1", title: "Rediseño", movimientos: 12 },
    vencidas: 4,
    habitosPendientes: 3,
    diasParaFinDeQuincena: 1,
    presupuestoEnRojo: true
  });
  assert.ok(destacadosDelCentro(s, []).length <= MAX_DESTACADOS);
});

test("Todos llevan motivo: un destino sin porqué es un botón más", () => {
  const s = senales({ vencidas: 2, habitosPendientes: 1, diasParaFinDeQuincena: 1 });
  for (const d of destacadosDelCentro(s, [])) {
    assert.ok(d.motivo.length > 0, `«${d.label}» salió sin motivo`);
  }
});

test("El orden es estable: lo que caduca primero, primero", () => {
  const s = senales({
    proyectoActivo: { id: "p1", title: "Rediseño", movimientos: 5 },
    vencidas: 2,
    habitosPendientes: 1
  });
  // El proyecto en el que estabas manda; después lo que ya se pasó de fecha.
  assert.deepStrictEqual(hrefs(s), ["/execution?project=p1", "/execution", "/development/routines"]);
});
