import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparPlano,
  buscar,
  construirArbol,
  escribirPreferencias,
  filtrosDeRapido,
  leerPreferencias,
  PREFERENCIAS_INICIALES,
  padreListoParaCerrar,
  resaltar,
  type Nodo
} from "../../src/lib/domain/execution/arbol.ts";
import { caminoA } from "../../src/lib/domain/execution/avance.ts";
import { EMPTY_FILTERS, matchesFilters, type BoardTaskLike } from "../../src/lib/domain/board.ts";

const HOY = "2026-10-24";

let pos = 0;
function t(id: string, parent: string | null = null, extra: Partial<BoardTaskLike> = {}): BoardTaskLike {
  return {
    id,
    title: id,
    status: "Pending",
    priority: "Medium",
    urgent: false,
    due: null,
    startDate: null,
    parentTaskId: parent,
    groupId: null,
    position: pos++,
    ...extra
  };
}

const ids = (nodos: Nodo<BoardTaskLike>[]) => nodos.map((n) => n.tarea.id);

test("cada tarea principal lleva sus subtareas debajo, en orden manual", () => {
  const tareas = [t("web"), t("dominio", "web"), t("portada", "web"), t("contador")];
  const { abiertas, cerradas } = construirArbol(tareas, { orden: "manual", hechas: false });
  assert.deepEqual(ids(abiertas), ["web", "contador"]);
  assert.deepEqual(ids(abiertas[0]!.hijos), ["dominio", "portada"]);
  assert.equal(abiertas[0]!.hijos[0]!.nivel, 1);
  assert.deepEqual(cerradas, []);
});

test("lo hecho se pliega: subtareas en «hechas», principales al final", () => {
  const tareas = [
    t("web"),
    t("dominio", "web", { status: "Completed" }),
    t("portada", "web"),
    t("viejo", null, { status: "Completed" })
  ];
  const a = construirArbol(tareas, { orden: "manual", hechas: false });
  assert.deepEqual(ids(a.abiertas), ["web"]);
  assert.deepEqual(ids(a.abiertas[0]!.hijos), ["portada"]);
  assert.deepEqual(ids(a.abiertas[0]!.hechas), ["dominio"]);
  assert.deepEqual(ids(a.cerradas), ["viejo"]);
  assert.deepEqual(a.abiertas[0]!.avance, { hechas: 1, total: 2 });

  const b = construirArbol(tareas, { orden: "manual", hechas: true });
  assert.deepEqual(ids(b.abiertas), ["web", "viejo"]);
  assert.deepEqual(ids(b.abiertas[0]!.hijos), ["dominio", "portada"]);
});

test("una tarea cerrada con trabajo vivo debajo no se pliega", () => {
  const tareas = [t("fase", null, { status: "Completed" }), t("pendiente", "fase")];
  const a = construirArbol(tareas, { orden: "manual", hechas: false });
  assert.deepEqual(ids(a.abiertas), ["fase"]);
  assert.deepEqual(ids(a.abiertas[0]!.hijos), ["pendiente"]);
});

test("tres subniveles; lo más hondo se cuenta y no se dibuja", () => {
  const tareas = [t("n0"), t("n1", "n0"), t("n2", "n1"), t("n3", "n2"), t("n4", "n3"), t("n5", "n4")];
  const { abiertas } = construirArbol(tareas, { orden: "manual", hechas: false });
  const n3 = abiertas[0]!.hijos[0]!.hijos[0]!.hijos[0]!;
  assert.equal(n3.tarea.id, "n3");
  assert.equal(n3.nivel, 3);
  assert.deepEqual(n3.hijos, []);
  assert.equal(n3.masHondas, 2);
});

test("al filtrar, el padre queda como contexto y solo salen las hijas que coinciden", () => {
  const tareas = [t("web"), t("legal", "web", { due: "2026-10-20" }), t("portada", "web"), t("otra")];
  const { abiertas } = construirArbol(tareas, {
    orden: "manual",
    hechas: false,
    coincide: (x) => matchesFilters(x, filtrosDeRapido("vencidas", EMPTY_FILTERS, null), { today: HOY, assigneesByTask: {} })
  });
  assert.deepEqual(ids(abiertas), ["web"]);
  assert.equal(abiertas[0]!.contexto, true);
  assert.equal(abiertas[0]!.visibles, 1);
  assert.deepEqual(abiertas[0]!.avance, { hechas: 0, total: 2 });
  assert.deepEqual(ids(abiertas[0]!.hijos), ["legal"]);
  assert.equal(abiertas[0]!.hijos[0]!.contexto, false);
});

test("estadoDe manda: una tarea marcada con «Deshacer» pendiente no salta de sitio", () => {
  const tareas = [t("a")];
  const { abiertas } = construirArbol(tareas, { orden: "manual", hechas: false, estadoDe: () => "Pending" });
  assert.deepEqual(ids(abiertas), ["a"]);
});

test("orden por prioridad: urgente, luego alta, luego fecha", () => {
  const tareas = [
    t("baja", null, { priority: "Low" }),
    t("alta", null, { priority: "High", due: "2026-10-30" }),
    t("alta-antes", null, { priority: "High", due: "2026-10-25" }),
    t("urgente", null, { priority: "Low", urgent: true })
  ];
  const { abiertas } = construirArbol(tareas, { orden: "prioridad", hechas: false });
  assert.deepEqual(ids(abiertas), ["urgente", "alta-antes", "alta", "baja"]);
});

test("fichas rápidas", () => {
  const ctx = { today: HOY, assigneesByTask: { a: ["Luis"], b: ["Ana"] } };
  const pasa = (x: BoardTaskLike, r: Parameters<typeof filtrosDeRapido>[0]) =>
    matchesFilters(x, filtrosDeRapido(r, EMPTY_FILTERS, "Luis"), ctx);
  assert.equal(pasa(t("a"), "mias"), true);
  assert.equal(pasa(t("b"), "mias"), false);
  assert.equal(pasa(t("c", null, { due: HOY }), "hoy"), true);
  assert.equal(pasa(t("d", null, { due: "2026-10-31" }), "semana"), true);
  assert.equal(pasa(t("e", null, { due: "2026-11-02" }), "semana"), false);
  assert.equal(pasa(t("f", null, { due: "2026-10-01", status: "Completed" }), "vencidas"), false);
  // Los filtros finos se conservan; «Mías» manda sobre las personas.
  const f = filtrosDeRapido("mias", { ...EMPTY_FILTERS, priorities: ["High"], people: ["Ana"] }, "Luis");
  assert.deepEqual([f.priorities, f.people], [["High"], ["Luis"]]);
});

test("padre listo para cerrar cuando todas sus hijas están hechas", () => {
  const tareas = [
    t("web"),
    t("a", "web", { status: "Completed" }),
    t("b", "web", { status: "Completed" }),
    t("c", "web", { status: "Cancelled" })
  ];
  assert.equal(padreListoParaCerrar(tareas, "b")?.id, "web");
  const conPendiente = [...tareas, t("d", "web")];
  assert.equal(padreListoParaCerrar(conPendiente, "b"), null);
  assert.equal(padreListoParaCerrar(tareas, "web"), null);
});

test("camino de estados más corto", () => {
  assert.deepEqual(caminoA("Pending", "Completed"), ["InProgress", "Completed"]);
  assert.deepEqual(caminoA("InProgress", "Completed"), ["Completed"]);
  assert.deepEqual(caminoA("Completed", "Completed"), []);
  assert.equal(caminoA("Completed", "Pending"), null);
});

test("agrupar por fecha deja lo cerrado en «hechas», plegado", () => {
  const tareas = [
    t("ayer", null, { due: "2026-10-23" }),
    t("hoy", null, { due: HOY }),
    t("manana", "hoy", { due: "2026-10-25" }),
    t("sin"),
    t("lista", null, { status: "Completed", due: HOY })
  ];
  const s = agruparPlano(tareas, "fecha", { orden: "manual", hechas: false, today: HOY });
  assert.deepEqual(
    s.map((x) => [x.clave, x.tareas.map((y) => y.id), x.plegada]),
    [
      ["vencidas", ["ayer"], false],
      ["hoy", ["hoy"], false],
      ["manana", ["manana"], false],
      ["sinfecha", ["sin"], false],
      ["hechas", ["lista"], true]
    ]
  );
});

test("buscar ignora acentos, da la ruta y prefiere lo vivo", () => {
  const tareas = [
    t("p", null, { title: "Lanzar web" }),
    t("h", "p", { title: "Reunión con diseño" }),
    t("x", null, { title: "Reunion vieja", status: "Completed" }),
    t("n", null, { title: "Otra cosa" })
  ];
  const r = buscar(tareas, "reunion", { n: "hablar en la reunión del lunes" });
  assert.deepEqual(
    r.map((x) => [x.tarea.id, x.ruta, x.enNotas]),
    [
      ["h", ["Lanzar web"], false],
      ["n", [], true],
      ["x", [], false]
    ]
  );
});

test("resaltar conserva los caracteres originales", () => {
  assert.deepEqual(resaltar("Reunión con Ana", "reunion"), [
    { texto: "Reunión", marca: true },
    { texto: " con Ana", marca: false }
  ]);
  assert.deepEqual(resaltar("ana y Ana", "ANA"), [
    { texto: "ana", marca: true },
    { texto: " y ", marca: false },
    { texto: "Ana", marca: true }
  ]);
});

test("preferencias: ida y vuelta, y basura → valores por defecto", () => {
  const p = { rapido: "hoy" as const, presentacion: { agrupar: "fecha" as const, orden: "prioridad" as const, hechas: true }, plegados: ["a", "b"] };
  assert.deepEqual(leerPreferencias(escribirPreferencias(p)), p);
  assert.deepEqual(leerPreferencias("{no es json"), PREFERENCIAS_INICIALES);
  assert.deepEqual(leerPreferencias(JSON.stringify({ r: "raro", p: { agrupar: "x" }, f: [1, "c"] })), {
    ...PREFERENCIAS_INICIALES,
    plegados: ["c"]
  });
  const muchos = Array.from({ length: 100 }, (_, i) => `id-${i}`);
  assert.equal(leerPreferencias(escribirPreferencias({ ...p, plegados: muchos })).plegados.length, 60);
});
