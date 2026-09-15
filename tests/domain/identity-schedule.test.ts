import { test } from "node:test";
import assert from "node:assert/strict";
import { tocaFotoDeIdentidad } from "../../src/lib/domain/identity/schedule.ts";

test("tocaFotoDeIdentidad: solo en la última hora del día local", () => {
  assert.equal(tocaFotoDeIdentidad("22:59"), false);
  assert.equal(tocaFotoDeIdentidad("23:00"), true);
  assert.equal(tocaFotoDeIdentidad("23:55"), true);
  assert.equal(tocaFotoDeIdentidad("00:05"), false);
});
