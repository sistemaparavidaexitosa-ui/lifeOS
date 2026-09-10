import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDbError, actionFailed } from "../../src/lib/supabase/errors.ts";

// El caso que motivó el archivo: books.cover_url existía en el código y en la
// base local, pero la migración 0026 no había llegado a producción.

test("42703 (columna inexistente): nombra la columna y dice qué hacer", () => {
  const msg = describeDbError({ code: "42703", message: "column books.cover_url does not exist" });
  assert.match(msg, /books\.cover_url/);
  assert.match(msg, /supabase db push/);
});

test("PGRST205 (la TABLA no existe): dice que falta una migración, no otra cosa", () => {
  // Es el hermano de PGRST204 y faltaba. PGRST204 es «no encuentro la COLUMNA»;
  // PGRST205 es «no encuentro la TABLA», que es lo que devuelve PostgREST
  // cuando un módulo entero no está desplegado.
  //
  // El incidente que lo añade: el Mapa de dependencias (0054) contra una base
  // sin esa migración. `graph_nodes` no existía, PostgREST devolvía 404 con
  // este código, y la pantalla concluía «todavía no hay nada que dibujar» —
  // que es exactamente la clase de mentira que este archivo existe para
  // impedir: le decía al dueño del sistema que no tenía proyectos mientras los
  // tenía delante en otra pestaña.
  const mensaje = describeDbError({
    code: "PGRST205",
    message: "Could not find the table 'public.graph_nodes' in the schema cache"
  });
  assert.match(mensaje, /migración/);
  assert.match(mensaje, /graph_nodes/);
});

test("PGRST204 (caché de esquema): también nombra la columna", () => {
  const msg = describeDbError({
    code: "PGRST204",
    message: "Could not find the 'cover_url' column of 'books' in the schema cache"
  });
  assert.match(msg, /books\.cover_url/);
  assert.match(msg, /reload schema/);
});

test("42P01 (tabla inexistente): sin columna que nombrar, sigue siendo accionable", () => {
  const msg = describeDbError({ code: "42P01", message: 'relation "public.routines" does not exist' });
  assert.match(msg, /una columna o tabla/);
  assert.match(msg, /supabase db push/);
});

test("23505: violación de unicidad se explica en castellano, no con el código", () => {
  const msg = describeDbError({ code: "23505", message: "duplicate key value violates unique constraint" });
  assert.strictEqual(msg, "Ya existe un registro con esos datos.");
});

test("42501: permisos apunta a GRANT o RLS, que es donde de verdad se busca", () => {
  const msg = describeDbError({ code: "42501", message: "permission denied for table books" });
  assert.match(msg, /GRANT|RLS/);
});

test("código desconocido: devuelve el mensaje original en vez de tragárselo", () => {
  assert.strictEqual(describeDbError({ code: "XX999", message: "algo raro pasó" }), "algo raro pasó");
});

test("sin mensaje ni código: no devuelve cadena vacía", () => {
  assert.strictEqual(describeDbError({}), "Error de base de datos.");
  assert.strictEqual(describeDbError(null), "Error desconocido.");
});

test("actionFailed empaqueta el motivo en la forma que consume la UI", () => {
  const result = actionFailed({ code: "42703", message: "column books.cover_url does not exist" });
  assert.strictEqual(result.ok, false);
  assert.match(result.reason ?? "", /books\.cover_url/);
});
