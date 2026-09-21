import { test } from "node:test";
import assert from "node:assert/strict";
import {
  libroDeNavegacion,
  preferenciaDeAhora,
  type Visita
} from "../../src/lib/domain/comando/preferencias.ts";
import type { Franja } from "../../src/lib/domain/centro/franja.ts";

// Lo que el sistema aprende de por dónde navegas (D-183). El ritmo decide si
// hay preferencia; el volumen solo ordena.

const HOY = "2026-09-20";

/** `n` visitas a `ruta` en `franja`, repartidas en `n` días distintos. */
function visitas(ruta: string, franja: Franja, n: number, desdeDia = 1): Visita[] {
  return Array.from({ length: n }, (_, i) => ({
    ruta,
    franja,
    dia: `2026-09-${String(desdeDia + i).padStart(2, "0")}`
  }));
}

test("con pocos días no se afirma NADA, y lo dice", () => {
  const libro = libroDeNavegacion(visitas("/money/watchlist", "manana", 5), { hoy: HOY });

  assert.deepEqual(libro.preferencias, []);
  assert.match(libro.motivo ?? "", /suficientes días/);
});

test("aprende que algo es de una franja concreta", () => {
  const libro = libroDeNavegacion(
    [...visitas("/money/watchlist", "manana", 14), ...visitas("/execution", "tarde", 14)],
    { hoy: HOY }
  );

  const wl = libro.preferencias.find((p) => p.ruta === "/money/watchlist");
  assert.equal(wl?.franja, "manana");
  assert.ok(wl!.lift > 0);
});

// EL GUARDARRAÍL QUE IMPORTA. Una ruta que abres a todas horas es frecuente,
// no rítmica: anunciarla como «lo tuyo de las mañanas» sería inventar un patrón.
test("lo que abres a todas horas NO produce preferencia de franja", () => {
  const repartida = [
    ...visitas("/execution", "manana", 10, 1),
    ...visitas("/execution", "tarde", 10, 1),
    ...visitas("/execution", "noche", 10, 1)
  ];

  const libro = libroDeNavegacion(repartida, { hoy: HOY });

  assert.deepEqual(
    libro.preferencias.filter((p) => p.ruta === "/execution"),
    [],
    "mucho volumen sin ritmo no es una preferencia de franja"
  );
});

// La ventana ES el olvido: no hace falta que nadie retire nada a mano.
test("lo que dejaste de abrir se cae solo al salir de la ventana", () => {
  const viejas: Visita[] = Array.from({ length: 20 }, (_, i) => ({
    ruta: "/money/watchlist",
    franja: "manana" as Franja,
    dia: `2026-07-${String(1 + i).padStart(2, "0")}`
  }));

  const libro = libroDeNavegacion(viejas, { hoy: HOY });

  assert.deepEqual(libro.preferencias, [], "fuera de la ventana no cuenta");
});

test("el volumen ordena entre las que ya pasaron el filtro del ritmo", () => {
  const libro = libroDeNavegacion(
    [
      ...visitas("/money/watchlist", "manana", 20, 1),
      ...visitas("/development/routines", "manana", 8, 1),
      ...visitas("/execution", "tarde", 14, 1)
    ],
    { hoy: HOY }
  );

  const mananas = libro.preferencias.filter((p) => p.franja === "manana").map((p) => p.ruta);
  assert.equal(mananas[0], "/money/watchlist", "más visitas, más arriba");
});

test("como mucho tres preferencias", () => {
  const muchas = ["/a", "/b", "/c", "/d", "/e"].flatMap((r, i) => visitas(r, "manana", 10 + i, 1));

  assert.ok(libroDeNavegacion(muchas, { hoy: HOY }).preferencias.length <= 3);
});

// Quien cambió en quién quiere convertirse no merece que le sigan empujando la
// rutina del que era. Mismo corte que `aprendizaje.ts`.
test("revisar la identidad borra lo aprendido", () => {
  const v = [...visitas("/money/watchlist", "manana", 14), ...visitas("/execution", "tarde", 14)];

  assert.ok(libroDeNavegacion(v, { hoy: HOY }).preferencias.length > 0);
  assert.deepEqual(
    libroDeNavegacion(v, { hoy: HOY, desdeLaRevision: "2026-09-19" }).preferencias,
    [],
    "tras revisar, se empieza de cero"
  );
});

test("preferenciaDeAhora devuelve solo la de esta franja", () => {
  const libro = libroDeNavegacion(
    [...visitas("/money/watchlist", "manana", 14), ...visitas("/execution", "tarde", 14)],
    { hoy: HOY }
  );

  assert.equal(preferenciaDeAhora(libro, "manana")?.ruta, "/money/watchlist");
  assert.equal(preferenciaDeAhora(libro, "noche"), null);
});
