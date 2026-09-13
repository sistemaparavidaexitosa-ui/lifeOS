// tests/domain/ai-graph-tool.test.ts
// Lo que la herramienta del grafo deja ver al modelo. Si algo de aquí se rompe,
// un nodo de un dominio apagado viaja al proveedor.

import { test } from "node:test";
import assert from "node:assert/strict";
import { nodosParaModelo, type NodoCrudo } from "../../src/lib/domain/ai/graph-tool.ts";
import type { Domain } from "../../src/lib/domain/insights/types.ts";

const DOMINIOS: Record<string, Domain> = { projects: "execution", personal_goals: "growth", accounts: "money" };
const dominioDeTabla = (t: string) => DOMINIOS[t] ?? null;

const P = "11111111-1111-4111-8111-111111111111";
const G = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";

test("cita cada nodo con el mismo id que usaría `consultar`", () => {
  const [nodo] = nodosParaModelo(
    [{ entityTable: "projects", entityId: P, nodeType: "project", label: "Tienda", profundidad: 0 }],
    ["execution"],
    dominioDeTabla
  );
  assert.deepStrictEqual(nodo, { id: `fila:projects:${P}`, tipo: "project", etiqueta: "Tienda", profundidad: 0 });
});

test("quita lo de dominios apagados y lo de tablas fuera de la lista blanca", () => {
  const nodos: NodoCrudo[] = [
    { entityTable: "projects", entityId: P, nodeType: "project", label: "Tienda", profundidad: 0 },
    { entityTable: "accounts", entityId: A, nodeType: "account", label: "Nómina", relacion: "supports", profundidad: 1 },
    { entityTable: "memberships", entityId: G, nodeType: "person", label: "Beto", profundidad: 1 }
  ];
  assert.deepStrictEqual(
    nodosParaModelo(nodos, ["execution", "growth"], dominioDeTabla).map((n) => n.etiqueta),
    ["Tienda"]
  );
});

test("un nodo que llega por dos caminos entra una vez, con su menor profundidad, y se respeta el tope", () => {
  const nodos: NodoCrudo[] = [
    { entityTable: "personal_goals", entityId: G, nodeType: "goal", label: "Meta", relacion: "supports", profundidad: 2 },
    { entityTable: "personal_goals", entityId: G, nodeType: "goal", label: "Meta", relacion: "supports", profundidad: 1 },
    { entityTable: "projects", entityId: P, nodeType: "project", label: "Tienda", profundidad: 0 }
  ];
  const salida = nodosParaModelo(nodos, ["execution", "growth"], dominioDeTabla);
  assert.deepStrictEqual(salida.map((n) => [n.etiqueta, n.profundidad]), [["Tienda", 0], ["Meta", 1]]);
  assert.equal(nodosParaModelo(nodos, ["execution", "growth"], dominioDeTabla, 1).length, 1);
});
