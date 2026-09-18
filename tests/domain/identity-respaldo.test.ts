import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirPorEstado, decidirPorExcepcion, hayAgente } from "../../src/lib/domain/identity/respaldo.ts";

test("el 409 NO cae al respaldo: es un problema de la persona, no del agente", () => {
  // El respaldo fallaría igual, con el mismo mensaje, tras gastar otra llamada
  // al modelo. Caerse aquí convierte un aviso claro en diez segundos y un «no
  // se pudo».
  assert.deepEqual(decidirPorEstado(409), { respaldo: false });
});

test("los 5xx caen, y se distinguen de los 4xx en el registro", () => {
  assert.deepEqual(decidirPorEstado(500), { respaldo: true, motivo: "http-5xx" });
  assert.deepEqual(decidirPorEstado(502), { respaldo: true, motivo: "http-5xx" });
  assert.deepEqual(decidirPorEstado(503), { respaldo: true, motivo: "http-5xx" });
});

test("un 4xx que no sea 409 también cae: el agente no supo contestar", () => {
  assert.deepEqual(decidirPorEstado(422), { respaldo: true, motivo: "payload-invalido" });
  assert.deepEqual(decidirPorEstado(401), { respaldo: true, motivo: "payload-invalido" });
  assert.deepEqual(decidirPorEstado(400), { respaldo: true, motivo: "payload-invalido" });
});

test("timeout y red se separan porque cuentan historias distintas", () => {
  // «red» en racha es un contenedor caído o una URL mal puesta; «timeout» en
  // racha es un agente vivo que tarda demasiado. Se arreglan de formas
  // distintas, así que no pueden verse igual en la auditoría.
  const timeout = new Error("tardó");
  timeout.name = "TimeoutError";
  assert.deepEqual(decidirPorExcepcion(timeout), { respaldo: true, motivo: "timeout" });

  const abortada = new Error("abortada");
  abortada.name = "AbortError";
  assert.deepEqual(decidirPorExcepcion(abortada), { respaldo: true, motivo: "timeout" });

  assert.deepEqual(decidirPorExcepcion(new TypeError("fetch failed")), { respaldo: true, motivo: "red" });
  assert.deepEqual(decidirPorExcepcion("algo raro"), { respaldo: true, motivo: "red" });
});

test("sin URL o sin secreto no hay agente, y no se gasta ni un fetch", () => {
  assert.equal(hayAgente(null, "s"), false);
  assert.equal(hayAgente("", "s"), false);
  // Una URL sin secreto produciría un 401 garantizado: descubrirlo por la red
  // solo retrasa el respaldo.
  assert.equal(hayAgente("https://agente.test", null), false);
  assert.equal(hayAgente("https://agente.test", ""), false);
  assert.equal(hayAgente("https://agente.test", "s"), true);
});
