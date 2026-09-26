// src/lib/centro/escritura/adaptadores.ts
// Cada tabla×operación del registro, por la server action que ya usa su
// sección (D-203). SERVIDOR.
//
// NUNCA UN INSERT SUELTO. Las acciones de cada sección llevan sus zod, sus
// triggers, su `task_history`, su `revalidatePath`. Escribir por otro camino
// saltaría todo eso sin que fallara nada. Si una tabla no tiene acción
// adecuada, se escribe en su `actions.ts`, no aquí.
//
// EL TIPO ES EL TEST DE COBERTURA: una operación declarada en el registro sin
// adaptador rompe `tsc`.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/supabase/errors";
import type { CambioGuardado } from "@/lib/domain/centro/escritura/cambio.ts";
import type { ESCRITURA_POR_TABLA, TablaEscribible } from "@/lib/domain/centro/escritura/registro.ts";
import { createTask, renameTask, setTaskStatus, updateTaskDates, deleteTask } from "@/app/(app)/execution/actions";
import { setTaskPriority } from "@/app/(app)/execution/board-actions";
import { createNote, saveNote, deleteNote } from "@/app/(app)/notebooks/actions";
import { logFoodEntry, updateFoodEntry, deleteFoodEntry } from "@/app/(app)/development/nutrition/actions";
import type { TaskStatus, Priority } from "@/lib/domain/types";

export type Adaptador = (c: CambioGuardado) => Promise<ActionResult & { id?: string }>;

type Cobertura = {
  [T in TablaEscribible]: { [O in (typeof ESCRITURA_POR_TABLA)[T]["operaciones"][number]]: Adaptador };
};

/**
 * Las acciones del repo devuelven de tres formas: `ActionResult`, `void` o
 * lanzan (`createTask`, `setTaskStatus`). Aquí se vuelven todas `ActionResult`.
 *
 * Si lo que devolvió trae un `id` de texto (p. ej. `createTask`), se conserva:
 * es lo único que `confirmarCambio` tiene para auditar un `crear` con el id de
 * la fila real (I3), porque `cambio.id` en un `crear` siempre es `null`.
 */
async function seguro(fn: () => Promise<unknown>): Promise<ActionResult & { id?: string }> {
  try {
    const r = await fn();
    if (r && typeof r === "object" && "ok" in r && (r as ActionResult).ok === false) return r as ActionResult & { id?: string };
    const id = r && typeof r === "object" && "id" in r && typeof (r as { id?: unknown }).id === "string" ? (r as { id: string }).id : undefined;
    return id ? { ok: true, id } : { ok: true };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "No se pudo guardar." };
  }
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function formulario(campos: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.set(k, v);
  return fd;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export const ADAPTADORES: Cobertura = {
  tasks: {
    crear: (c) =>
      seguro(() =>
        createTask(
          formulario({
            projectId: s(c.campos.project_id),
            title: s(c.campos.title),
            priority: s(c.campos.priority) || "Medium",
            due: s(c.campos.due),
            est: s(c.campos.est) || "30"
          })
        )
      ),
    editar: (c) =>
      seguro(async () => {
        const id = c.id!;
        // Una acción por campo: cada una tiene su regla (la máquina de estados
        // de `setTaskStatus`, el `urgent` de `setTaskPriority`). El estado va
        // PRIMERO (I2): es el que más lanza (transición inválida), y si lanza
        // ahí no debe quedar título/prioridad/fecha ya escritos mientras la
        // propuesta queda varada.
        if (typeof c.campos.status === "string") await setTaskStatus(id, c.campos.status as TaskStatus);
        if (typeof c.campos.title === "string") await renameTask(id, c.campos.title);
        if (typeof c.campos.priority === "string") {
          const supabase = await createClient();
          const { data, error } = await supabase.from("tasks").select("urgent").eq("id", id).single();
          // I2: sin la fila no hay forma de saber su `urgent` — un `false` por
          // defecto podría apagar una urgencia real en vez de solo cambiar la
          // prioridad que se pidió.
          if (error || !data) return { ok: false, reason: "No se pudo leer la tarea." };
          await setTaskPriority(id, c.campos.priority as Priority, data.urgent ?? false);
        }
        if ("due" in c.campos) {
          const supabase = await createClient();
          const { data, error } = await supabase.from("tasks").select("start_date").eq("id", id).single();
          if (error || !data) return { ok: false, reason: "No se pudo leer la tarea." };
          await updateTaskDates(id, data.start_date ?? null, (c.campos.due as string | null) ?? null);
        }
      }),
    borrar: (c) => seguro(() => deleteTask(c.id!))
  },
  notes: {
    crear: (c) =>
      seguro(async () => {
        const creada = await createNote(s(c.campos.notebook_id));
        if (!creada.ok || !creada.id) return creada;
        // Una nota nace vacía con version 1 (0032); el texto va en su primer guardado.
        const guardada = await saveNote(creada.id, s(c.campos.title), s(c.campos.body), 1);
        // I3: `saveNote` no devuelve el id (ya lo conoce quien la llama); se
        // reintroduce aquí para que el audit de un `crear` lo tenga.
        return { ...guardada, id: creada.id };
      }),
    editar: (c) =>
      seguro(async () => {
        const supabase = await createClient();
        const { data: actual } = await supabase.from("notes").select("title, body, version").eq("id", c.id!).single();
        if (!actual) return { ok: false, reason: "Esta nota ya no existe." };
        // I2: `title` es opcional — una corrección que lo vacía manda `null`,
        // no `""`, y `typeof === "string"` lo trataba como «no vino» y
        // conservaba el título viejo. `"campo" in c.campos` distingue «no
        // viajó» (no toca) de «viajó vacío» (sí lo vacía). Mismo patrón para
        // `body` por consistencia, aunque hoy sea obligatorio.
        return saveNote(
          c.id!,
          "title" in c.campos ? s(c.campos.title) : actual.title,
          "body" in c.campos ? s(c.campos.body) : actual.body,
          actual.version
        );
      }),
    borrar: (c) => seguro(() => deleteNote(c.id!))
  },
  food_entries: {
    crear: (c) =>
      seguro(() =>
        logFoodEntry(
          s(c.campos.local_date),
          formulario({
            meal: s(c.campos.meal),
            name: s(c.campos.name),
            brand: "",
            grams: s(c.campos.grams),
            kcal100: s(c.campos.kcal100),
            protein100: s(c.campos.protein100) || "0",
            carbs100: s(c.campos.carbs100) || "0",
            fat100: s(c.campos.fat100) || "0"
          })
        )
      ),
    editar: (c) =>
      seguro(async () => {
        // `updateFoodEntry` pide la fila entera y recalcula los macros desde
        // «por 100 g». Se derivan de lo guardado: cambiar los gramos escala.
        const supabase = await createClient();
        const { data: f } = await supabase
          .from("food_entries")
          .select("meal, name, brand, grams, kcal, protein_g, carbs_g, fat_g, food_id")
          .eq("id", c.id!)
          .single();
        if (!f) return { ok: false, reason: "Esta comida ya no existe." };
        const por100 = (x: number) => (f.grams > 0 ? r2((x / f.grams) * 100) : 0);
        return updateFoodEntry(
          c.id!,
          formulario({
            meal: s(c.campos.meal ?? f.meal),
            name: s(c.campos.name ?? f.name),
            brand: s(f.brand),
            grams: s(c.campos.grams ?? f.grams),
            foodId: s(f.food_id),
            kcal100: String(por100(f.kcal)),
            protein100: String(por100(f.protein_g)),
            carbs100: String(por100(f.carbs_g)),
            fat100: String(por100(f.fat_g))
          })
        );
      }),
    borrar: (c) => seguro(() => deleteFoodEntry(c.id!))
  }
};
