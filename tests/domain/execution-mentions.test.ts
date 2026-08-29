// tests/domain/execution-mentions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMentions,
  splitBody,
  mentionQueryAt,
  matchRoster,
  type RosterMember
} from "../../src/lib/domain/execution/mentions.ts";

const ROSTER: RosterMember[] = [
  { userId: "u-luis", name: "Luis Varsa" },
  { userId: "u-ana", name: "Ana" },
  { userId: "u-anamaria", name: "Ana María" },
  { userId: "u-bea", name: "Bea" }
];

test("parseMentions: un nombre compuesto se captura entero — el regex viejo cortaba en el espacio", () => {
  const r = parseMentions("Hola @Luis Varsa, ¿lo ves?", ROSTER);
  assert.deepStrictEqual(r.userIds, ["u-luis"]);
  assert.deepStrictEqual(r.names, ["Luis Varsa"]);
});

test("parseMentions: el nombre más largo gana, y el corto no se cuela dentro", () => {
  const r = parseMentions("@Ana María revisa esto", ROSTER);
  assert.deepStrictEqual(r.userIds, ["u-anamaria"], "no debe mencionar también a Ana");
});

test("parseMentions: el nombre corto sí se captura cuando está solo", () => {
  const r = parseMentions("@Ana revisa esto", ROSTER);
  assert.deepStrictEqual(r.userIds, ["u-ana"]);
});

test("parseMentions: no casa dentro de una palabra más larga", () => {
  assert.deepStrictEqual(parseMentions("@Anabel no está en el roster", ROSTER).userIds, []);
});

test("parseMentions: un nombre que no está en el roster no inventa mención", () => {
  assert.deepStrictEqual(parseMentions("@Fulano mira esto", ROSTER).userIds, []);
});

test("parseMentions: varias menciones salen en el orden del texto", () => {
  const r = parseMentions("@Bea y @Ana, ojo", ROSTER);
  assert.deepStrictEqual(r.userIds, ["u-bea", "u-ana"]);
});

test("parseMentions: repetir a la misma persona no la menciona dos veces", () => {
  const r = parseMentions("@Ana, dile a @Ana", ROSTER);
  assert.deepStrictEqual(r.userIds, ["u-ana"]);
});

test("parseMentions: un correo no es una mención", () => {
  assert.deepStrictEqual(parseMentions("escríbeme a luis@Ana.com", ROSTER).userIds, []);
});

test("parseMentions: sin roster no hay menciones — no se adivina", () => {
  assert.deepStrictEqual(parseMentions("@Luis Varsa hola", []).userIds, []);
});

test("splitBody: parte el texto en tramos planos y menciones resueltas", () => {
  const segs = splitBody("Hola @Ana, mira", ROSTER);
  assert.deepStrictEqual(segs, [
    { kind: "text", text: "Hola " },
    { kind: "mention", text: "@Ana", userId: "u-ana" },
    { kind: "text", text: ", mira" }
  ]);
});

test("splitBody: sin menciones devuelve el cuerpo entero como un solo tramo", () => {
  assert.deepStrictEqual(splitBody("sin menciones", ROSTER), [{ kind: "text", text: "sin menciones" }]);
});

test("splitBody: un cuerpo vacío no produce tramos", () => {
  assert.deepStrictEqual(splitBody("", ROSTER), []);
});

test("mentionQueryAt: devuelve lo tecleado tras el @", () => {
  assert.strictEqual(mentionQueryAt("Hola @An", 8), "An");
});

test("mentionQueryAt: acepta un espacio, porque los nombres lo tienen", () => {
  assert.strictEqual(mentionQueryAt("Hola @Ana Ma", 12), "Ana Ma");
});

test("mentionQueryAt: se corta al segundo espacio — si no, el menú no cerraría nunca", () => {
  assert.strictEqual(mentionQueryAt("Hola @Ana y luego todo lo demás", 31), null);
});

test("mentionQueryAt: fuera de una mención devuelve null", () => {
  assert.strictEqual(mentionQueryAt("sin arroba", 10), null);
});

test("mentionQueryAt: un @ pegado a una palabra no abre mención", () => {
  assert.strictEqual(mentionQueryAt("luis@ca", 7), null);
});

test("matchRoster: filtra sin acentos y sin mayúsculas", () => {
  const r = matchRoster(ROSTER, "ana mar");
  assert.deepStrictEqual(r.map((m) => m.userId), ["u-anamaria"]);
});

test("matchRoster: sin texto devuelve el roster entero", () => {
  assert.strictEqual(matchRoster(ROSTER, "").length, ROSTER.length);
});
