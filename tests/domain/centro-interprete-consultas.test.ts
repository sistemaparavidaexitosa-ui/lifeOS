// Pedir información sin gastar tokens: «dame mis cuadernos» responde con componentes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analizarConsulta, seccionesDeConsulta, CONSULTAS } from "../../src/lib/domain/centro/interprete/consultas.ts";
import { validarPorSeccion } from "../../src/lib/domain/centro/runtime/validador.ts";

const H = "2026-10-18";

test("Reconoce la petición de una lista, con o sin signos, y con su filtro", () => {
  assert.deepEqual(analizarConsulta("dame la lista de cuadernos"), { consulta: "cuadernos", filtro: null });
  assert.deepEqual(analizarConsulta("Dame mis cuadernos"), { consulta: "cuadernos", filtro: null });
  assert.deepEqual(analizarConsulta("¿cuáles son mis proyectos?"), { consulta: "proyectos", filtro: null });
  assert.deepEqual(analizarConsulta("mis tareas de hoy"), { consulta: "tareas", filtro: "hoy" });
  assert.deepEqual(analizarConsulta("muéstrame las tareas vencidas"), { consulta: "tareas", filtro: "vencidas" });
  assert.deepEqual(analizarConsulta("qué libros estoy leyendo"), { consulta: "libros", filtro: "leyendo" });
  assert.deepEqual(analizarConsulta("mi agenda de hoy"), { consulta: "agenda", filtro: null });
  assert.deepEqual(analizarConsulta("lista mis metas de ahorro"), { consulta: "ahorros", filtro: null });
});

test("Lo que pide criterio o trae algo más NO es una consulta: sigue la IA", () => {
  for (const t of ["dame mis cuadernos y resume el último", "¿cómo voy con mis tareas?", "analiza mis proyectos", "dame ideas para mis cuadernos", "crea un cuaderno"]) {
    assert.equal(analizarConsulta(t), null, t);
  }
});

test("Cuadernos: una lista que pasa el validador, con enlace a su sección", () => {
  const filas = [
    { id: "11111111-1111-4111-8111-111111111111", title: "Trabajo", updated_at: "2026-10-17T10:00:00Z" },
    { id: "22222222-2222-4222-8222-222222222222", title: "Ideas", updated_at: "2026-10-10T10:00:00Z" }
  ];
  const s = seccionesDeConsulta(CONSULTAS.cuadernos!, filas, { hoy: H, total: 2, moneda: "MXN", locale: "es-MX" });
  assert.equal(s[0]!.kind, "lista");
  assert.deepEqual((s[0]!.data as { titulo: string }).titulo, "Tus cuadernos · 2");
  assert.equal(validarPorSeccion(s, [], "test").length, s.length);
});

test("Sin filas: lo dice, y ofrece ir a la sección", () => {
  const s = seccionesDeConsulta(CONSULTAS.cuadernos!, [], { hoy: H, total: 0, moneda: "MXN", locale: "es-MX" });
  assert.deepEqual(s.map((x) => x.kind), ["emptyState", "irA"]);
  assert.equal((s[0]!.data as { mensaje: string }).mensaje, "No tienes cuadernos todavía.");
});

test("Más filas de las que caben: «Ver todos» en su sección", () => {
  const filas = Array.from({ length: 8 }, (_, i) => ({ id: `3333333${i}-3333-4333-8333-333333333333`, title: `Tarea ${i}`, status: "Pending", due: null, project_id: null }));
  const s = seccionesDeConsulta(CONSULTAS.tareas!, filas, { hoy: H, total: 12, moneda: "MXN", locale: "es-MX" });
  assert.deepEqual(s.map((x) => x.kind), ["lista", "irA"]);
  assert.equal((s[0]!.data as { items: { estado: string }[] }).items[0]!.estado, "Pendiente");
  assert.equal(validarPorSeccion(s, [], "test").length, 2);
});

test("Libros salen como progreso; la agenda, por hora", () => {
  const libros = seccionesDeConsulta(CONSULTAS.libros!, [{ id: "44444444-4444-4444-8444-444444444444", title: "Dune", author: "Herbert", current_page: 130, total_pages: 260, status: "Leyendo" }], { hoy: H, total: 1, moneda: "MXN", locale: "es-MX" });
  assert.equal(libros[0]!.kind, "progreso");
  assert.deepEqual((libros[0]!.data as { items: { pct: number; valor: string }[] }).items[0], { id: "44444444-4444-4444-8444-444444444444", titulo: "Dune", detalle: "Herbert", pct: 50, valor: "130 / 260", href: "/development/library" });
  const agenda = seccionesDeConsulta(
    CONSULTAS.agenda!,
    [
      { id: "55555555-5555-4555-8555-555555555555", title: "Gimnasio", start_time: "18:00:00", end_time: "19:00:00", category: "Salud", recurring: false, occ_date: H, days: [] },
      { id: "66666666-6666-4666-8666-666666666666", title: "Trabajo", start_time: "09:00:00", end_time: "14:00:00", category: "Trabajo", recurring: true, occ_date: null, days: [0, 1, 2, 3, 4, 5, 6] },
      { id: "77777777-7777-4777-8777-777777777777", title: "Otro día", start_time: "10:00:00", end_time: "11:00:00", category: "Otros", recurring: false, occ_date: "2026-10-20", days: [] }
    ],
    { hoy: H, total: 3, moneda: "MXN", locale: "es-MX" }
  );
  assert.equal(agenda[0]!.kind, "agenda");
  assert.deepEqual((agenda[0]!.data as { items: { titulo: string }[] }).items.map((i) => i.titulo), ["Trabajo", "Gimnasio"]);
  assert.equal(validarPorSeccion(agenda, [], "test").length, 1);
});
