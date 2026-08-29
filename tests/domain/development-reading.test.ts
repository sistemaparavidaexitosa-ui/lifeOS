// tests/domain/development-reading.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readingVelocity,
  stalledDays,
  estimatedFinish,
  type BookLike,
  type ProgressPoint
} from "../../src/lib/domain/development/reading.ts";

const leyendo = (over: Partial<BookLike> = {}): BookLike => ({
  currentPage: 100,
  totalPages: 300,
  status: "Leyendo",
  startedAt: null,
  ...over
});

test("readingVelocity: páginas por día entre el primer y el último punto", () => {
  const puntos: ProgressPoint[] = [
    { date: "2026-08-01", page: 0 },
    { date: "2026-08-11", page: 100 }
  ];
  assert.strictEqual(readingVelocity(puntos), 10);
});

test("readingVelocity: con menos de dos puntos no se inventa una velocidad", () => {
  assert.strictEqual(readingVelocity([]), 0);
  assert.strictEqual(readingVelocity([{ date: "2026-08-01", page: 40 }]), 0);
});

test("readingVelocity: dos puntos del mismo día no dan velocidad", () => {
  // Dividir entre cero días proyectaría terminar el libro hoy mismo.
  const puntos: ProgressPoint[] = [
    { date: "2026-08-01", page: 10 },
    { date: "2026-08-01", page: 60 }
  ];
  assert.strictEqual(readingVelocity(puntos), 0);
});

test("readingVelocity: solo mira la ventana reciente, no todo el historial", () => {
  // Este es el caso que motivó la ventana: se leyó mucho en marzo, el libro
  // estuvo parado y se retomó. El promedio desde el principio diría que lees
  // rapidísimo; la ventana dice la verdad de esta semana.
  const puntos: ProgressPoint[] = [
    { date: "2026-03-01", page: 0 },
    { date: "2026-03-02", page: 200 },
    { date: "2026-08-01", page: 210 },
    { date: "2026-08-11", page: 230 }
  ];
  assert.strictEqual(readingVelocity(puntos, 2), 2);
});

test("readingVelocity: no acepta un retroceso de página como velocidad", () => {
  const puntos: ProgressPoint[] = [
    { date: "2026-08-01", page: 120 },
    { date: "2026-08-05", page: 80 }
  ];
  assert.strictEqual(readingVelocity(puntos), 0);
});

test("readingVelocity: los puntos desordenados dan el mismo resultado", () => {
  const desordenados: ProgressPoint[] = [
    { date: "2026-08-11", page: 100 },
    { date: "2026-08-01", page: 0 }
  ];
  assert.strictEqual(readingVelocity(desordenados), 10);
});

test("stalledDays: días desde el último avance", () => {
  const puntos: ProgressPoint[] = [
    { date: "2026-08-01", page: 10 },
    { date: "2026-08-20", page: 60 }
  ];
  assert.strictEqual(stalledDays(puntos, "2026-08-29"), 9);
});

test("stalledDays: sin puntos no hay respuesta, y hoy mismo son cero días", () => {
  assert.strictEqual(stalledDays([], "2026-08-29"), null);
  assert.strictEqual(stalledDays([{ date: "2026-08-29", page: 5 }], "2026-08-29"), 0);
});

test("estimatedFinish: con historial estima y lo dice", () => {
  const puntos: ProgressPoint[] = [
    { date: "2026-08-19", page: 80 },
    { date: "2026-08-29", page: 100 }
  ];
  const e = estimatedFinish(leyendo(), puntos, "2026-08-29");
  assert.strictEqual(e.basis, "historial");
  assert.strictEqual(e.pagesPerDay, 2); // 20 páginas en 10 días
  assert.strictEqual(e.daysLeft, 100); // faltan 200 páginas
  assert.strictEqual(e.date, "2026-12-07");
});

test("estimatedFinish: sin historial cae al promedio desde el inicio", () => {
  const e = estimatedFinish(leyendo({ startedAt: "2026-08-09" }), [], "2026-08-29");
  assert.strictEqual(e.basis, "desde el inicio");
  assert.strictEqual(e.pagesPerDay, 5); // 100 páginas en 20 días
  assert.strictEqual(e.daysLeft, 40);
});

test("estimatedFinish: el historial gana al promedio desde el inicio", () => {
  // Los dos caminos son posibles a la vez; el que manda es el reciente.
  const puntos: ProgressPoint[] = [
    { date: "2026-08-27", page: 80 },
    { date: "2026-08-29", page: 100 }
  ];
  const e = estimatedFinish(leyendo({ startedAt: "2026-01-01" }), puntos, "2026-08-29");
  assert.strictEqual(e.basis, "historial");
  assert.strictEqual(e.pagesPerDay, 10);
});

test("estimatedFinish: sin nada con qué estimar NO inventa una fecha", () => {
  // La regla del módulo: una fecha inventada se lee igual que una calculada.
  const e = estimatedFinish(leyendo({ startedAt: null }), [], "2026-08-29");
  assert.strictEqual(e.basis, "sin datos");
  assert.strictEqual(e.date, null);
});

test("estimatedFinish: un libro terminado no se estima", () => {
  const e = estimatedFinish(leyendo({ status: "Terminado" }), [{ date: "2026-08-01", page: 10 }], "2026-08-29");
  assert.strictEqual(e.basis, "sin datos");
  assert.strictEqual(e.date, null);
});

test("estimatedFinish: sin total de páginas no hay meta que proyectar", () => {
  const e = estimatedFinish(leyendo({ totalPages: 0, startedAt: "2026-08-01" }), [], "2026-08-29");
  assert.strictEqual(e.basis, "sin datos");
});

test("estimatedFinish: si ya pasaste la última página, no queda nada que estimar", () => {
  const e = estimatedFinish(leyendo({ currentPage: 300, totalPages: 300 }), [], "2026-08-29");
  assert.strictEqual(e.basis, "sin datos");
});

test("estimatedFinish: quedando poco, la fecha nunca es hoy", () => {
  // Ceil + mínimo de 1: proyectar "hoy" para algo que aún no terminas se lee
  // como un error de la app.
  const puntos: ProgressPoint[] = [
    { date: "2026-08-28", page: 100 },
    { date: "2026-08-29", page: 298 }
  ];
  const e = estimatedFinish(leyendo({ currentPage: 298, totalPages: 300 }), puntos, "2026-08-29");
  assert.strictEqual(e.daysLeft, 1);
  assert.strictEqual(e.date, "2026-08-30");
});
