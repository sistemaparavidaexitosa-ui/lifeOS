import { test } from "node:test";
import assert from "node:assert/strict";
import { isMyTask, myTasks, myAssigneeNames, tasksAssignedTo } from "../../src/lib/domain/task-ownership.ts";

const ctx = (mine: string[], assigned: string[]) => ({
  myProjectIds: new Set(mine),
  assignedToMe: new Set(assigned)
});

test("isMyTask: una tarea de un proyecto mío cuenta aunque no me la hayan asignado", () => {
  assert.strictEqual(isMyTask({ id: "t1", projectId: "p1" }, ctx(["p1"], [])), true);
});

test("isMyTask: una tarea asignada a mí cuenta aunque el proyecto sea de otro (0031)", () => {
  assert.strictEqual(isMyTask({ id: "t1", projectId: "p9" }, ctx(["p1"], ["t1"])), true);
});

test("isMyTask: la tarea de un compañero en el proyecto de un compañero NO es mi día", () => {
  assert.strictEqual(isMyTask({ id: "t9", projectId: "p9" }, ctx(["p1"], ["t1"])), false);
});

test("myTasks: es la unión de ambas reglas, sin duplicar la que cumple las dos", () => {
  const tasks = [
    { id: "t1", projectId: "p1" }, // proyecto mío
    { id: "t2", projectId: "p9" }, // asignada a mí, proyecto ajeno
    { id: "t3", projectId: "p1" }, // proyecto mío Y asignada a mí
    { id: "t4", projectId: "p9" } // de nadie mío
  ];
  const result = myTasks(tasks, ctx(["p1"], ["t2", "t3"]));
  assert.deepStrictEqual(
    result.map((t) => t.id),
    ["t1", "t2", "t3"]
  );
});

test("myAssigneeNames: junta los nombres de todas mis membresías con el del perfil", () => {
  const names = myAssigneeNames(["Luis V.", "Luis Varsa"], "Luis");
  assert.deepStrictEqual([...names].sort(), ["Luis", "Luis V.", "Luis Varsa"]);
});

test("myAssigneeNames: el perfil salva a las cuentas sin membresía Owner (previas a 0030)", () => {
  const names = myAssigneeNames([], "Luis");
  assert.deepStrictEqual([...names], ["Luis"]);
});

test("myAssigneeNames: descarta nombres vacíos — casarían con filas ajenas en blanco", () => {
  const names = myAssigneeNames(["", "   "], "");
  assert.strictEqual(names.size, 0);
});

test("tasksAssignedTo: solo recoge las filas cuyo responsable es uno de mis nombres", () => {
  const rows = [
    { task_id: "t1", user_name: "Luis" },
    { task_id: "t2", user_name: "Ana" },
    { task_id: "t3", user_name: "Luis V." }
  ];
  const ids = tasksAssignedTo(rows, new Set(["Luis", "Luis V."]));
  assert.deepStrictEqual([...ids].sort(), ["t1", "t3"]);
});

test("tasksAssignedTo: sin nombres propios no reclama ninguna tarea", () => {
  const rows = [{ task_id: "t1", user_name: "Ana" }];
  assert.strictEqual(tasksAssignedTo(rows, new Set()).size, 0);
});
