import { test } from "node:test";
import assert from "node:assert/strict";
import { firmarToken, verificarToken, VIGENCIA_MS } from "../../src/lib/domain/identity/token.ts";

const SECRETO = "un-secreto-de-pruebas-lo-bastante-largo";
const SUJETO = { userId: "11111111-1111-4111-8111-111111111111", localDate: "2026-09-17" };
const AHORA = 1_789_000_000_000;

test("un token recién firmado vale para su persona y su día", () => {
  const t = firmarToken(SECRETO, SUJETO, AHORA);
  assert.deepEqual(verificarToken(SECRETO, t, SUJETO, AHORA), { ok: true });
});

test("no vale para otra persona: es el cruce que de verdad va a pasar", () => {
  const t = firmarToken(SECRETO, SUJETO, AHORA);
  const otro = { ...SUJETO, userId: "22222222-2222-4222-8222-222222222222" };
  const r = verificarToken(SECRETO, t, otro, AHORA);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /otra persona/);
});

test("no vale para otro día: un reintento lento no escribe el brief de ayer", () => {
  const t = firmarToken(SECRETO, SUJETO, AHORA);
  const r = verificarToken(SECRETO, t, { ...SUJETO, localDate: "2026-09-18" }, AHORA);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /otro día/);
});

test("caduca a los diez minutos", () => {
  const t = firmarToken(SECRETO, SUJETO, AHORA);
  assert.equal(verificarToken(SECRETO, t, SUJETO, AHORA + VIGENCIA_MS - 1).ok, true);
  const r = verificarToken(SECRETO, t, SUJETO, AHORA + VIGENCIA_MS + 1);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /caducó/);
});

test("un token del futuro se rechaza: un reloj desincronizado no fabrica tokens eternos", () => {
  const t = firmarToken(SECRETO, SUJETO, AHORA + 10 * 60_000);
  const r = verificarToken(SECRETO, t, SUJETO, AHORA);
  assert.equal(r.ok, false);
  assert.match((r as { reason: string }).reason, /futuro/);
});

test("otro secreto no lo valida", () => {
  const t = firmarToken(SECRETO, SUJETO, AHORA);
  assert.equal(verificarToken("otro-secreto-distinto-y-largo", t, SUJETO, AHORA).ok, false);
});

test("un token manipulado no valida, y una firma más corta no revienta la comparación", () => {
  const t = firmarToken(SECRETO, SUJETO, AHORA);
  const [cuerpo] = t.split(".");
  // `timingSafeEqual` LANZA con longitudes distintas; la comprobación previa es
  // lo que convierte eso en un «no», y esto lo fija.
  assert.equal(verificarToken(SECRETO, `${cuerpo}.corta`, SUJETO, AHORA).ok, false);
  assert.equal(verificarToken(SECRETO, "sin-punto", SUJETO, AHORA).ok, false);
  assert.equal(verificarToken(SECRETO, "", SUJETO, AHORA).ok, false);

  // Cuerpo cambiado, firma original: es el intento obvio de reescribir el
  // `user_id` sin tener el secreto.
  const falso = Buffer.from(`${SUJETO.userId}|2026-12-25|${AHORA}`, "utf8").toString("base64url");
  assert.equal(verificarToken(SECRETO, `${falso}.${t.split(".")[1]}`, SUJETO, AHORA).ok, false);
});
