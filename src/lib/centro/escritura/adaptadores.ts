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
import { createProject, updateProject, deleteProject } from "@/app/(app)/execution/actions";
import { createReminderOn } from "@/app/(app)/execution/thread-actions";
import { logHabit } from "@/app/(app)/development/routines/actions";
import { saveDailyReflection } from "@/app/(app)/development/routines/reflection-actions";
import { upsertPersonalGoal, deletePersonalGoal } from "@/app/(app)/development/goals/actions";
import { upsertBook, updateBookPage, deleteBook } from "@/app/(app)/development/library/actions";
import { upsertSavingsGoal, deleteSavingsGoal } from "@/app/(app)/savings/actions";
import { upsertFinancialGoal, deleteFinancialGoal } from "@/app/(app)/goals/actions";
import { upsertDebt, deleteDebt } from "@/app/(app)/debt/actions";
import { upsertAsset, deleteAsset } from "@/app/(app)/wealth/actions";
import { saveDailyLearning } from "@/app/(app)/planning/actions";
import { todayForUser } from "@/lib/data/profile";
import { createAccount, postTransaction } from "@/app/(app)/money/actions";
import { upsertBudgetLine, deleteBudgetLine } from "@/app/(app)/money/budget/actions";
import { upsertWeight } from "@/app/(app)/development/nutrition/actions";
import { upsertOccupation, deleteOccupation } from "@/app/(app)/time/actions";
import { addTaskComment } from "@/app/(app)/execution/task-detail-actions";
import { upsertTrait, deleteTrait } from "@/lib/identity/actions";
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

/**
 * E2: los formularios de upsert (metas, deudas, activos, libros…) piden la
 * fila ENTERA. Editar desde el Centro lee la que hay y cambia solo lo que
 * viajó: lo demás se reenvía tal cual estaba.
 */
async function actual(tabla: string, id: string, columnas: string): Promise<Record<string, unknown> | null> {
  const supabase = await createClient();
  // Mismo atajo de tipos que `filaSigueVigente`: la tabla y las columnas son dinámicas.
  const { data } = await supabase.from(tabla as "tasks").select(columnas).eq("id", id).maybeSingle();
  return (data as unknown as Record<string, unknown> | null) ?? null;
}

/** El valor que viajó, o el que había. */
function mezcla(c: CambioGuardado, fila: Record<string, unknown>) {
  return (k: string) => s(k in c.campos ? c.campos[k] : fila[k]);
}

const ya = { ok: false as const, reason: "Esta fila ya no existe." };

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
  },
  projects: {
    crear: (c) =>
      seguro(async () => ({
        id: await createProject(
          formulario({
            title: s(c.campos.title),
            status: s(c.campos.status) || "Active",
            priority: s(c.campos.priority) || "Medium",
            targetDate: s(c.campos.target_date)
          })
        )
      })),
    editar: (c) =>
      seguro(async () => {
        const f = await actual("projects", c.id!, "title, objective, status, priority, target_date");
        if (!f) return ya;
        const v = mezcla(c, f);
        await updateProject(
          formulario({ projectId: c.id!, title: v("title"), objective: s(f.objective), status: v("status"), priority: v("priority"), targetDate: v("target_date") })
        );
      }),
    borrar: (c) => seguro(() => deleteProject(c.id!))
  },
  habit_logs: {
    crear: (c) =>
      seguro(() =>
        logHabit({
          habitId: s(c.campos.habit_id),
          date: s(c.campos.log_date),
          status: s(c.campos.status) as "completed" | "skipped" | "postponed",
          completionPct: c.campos.status === "completed" ? 100 : 0
        })
      )
  },
  reminders: {
    crear: (c) => seguro(() => createReminderOn("task", s(c.campos.subject_id), s(c.campos.remind_on), s(c.campos.text)))
  },
  personal_goals: {
    crear: (c) =>
      seguro(() =>
        upsertPersonalGoal(
          null,
          formulario({ title: s(c.campos.title), description: s(c.campos.description), area: s(c.campos.area), horizon: s(c.campos.horizon), status: s(c.campos.status) || "Activa" })
        )
      ),
    editar: (c) =>
      seguro(async () => {
        const f = await actual("personal_goals", c.id!, "title, description, area, horizon, status");
        if (!f) return ya;
        const v = mezcla(c, f);
        await upsertPersonalGoal(c.id!, formulario({ title: v("title"), description: v("description"), area: v("area"), horizon: v("horizon"), status: v("status") }));
      }),
    borrar: (c) => seguro(() => deletePersonalGoal(c.id!))
  },
  books: {
    crear: (c) =>
      seguro(() =>
        upsertBook(
          null,
          formulario({
            title: s(c.campos.title),
            author: s(c.campos.author),
            status: s(c.campos.status) || "Por leer",
            currentPage: s(c.campos.current_page) || "0",
            totalPages: s(c.campos.total_pages) || "0"
          })
        )
      ),
    editar: (c) =>
      seguro(async () => {
        // La página va por su acción: es la que apunta el progreso de lectura.
        if (typeof c.campos.current_page === "number") {
          const r = await updateBookPage(c.id!, c.campos.current_page);
          if (!r.ok) return r;
        }
        if (!Object.keys(c.campos).some((k) => k !== "current_page")) return { ok: true };
        const f = await actual("books", c.id!, "title, author, status, current_page, total_pages, category, cover_url");
        if (!f) return ya;
        const v = mezcla(c, f);
        return upsertBook(
          c.id!,
          formulario({
            title: v("title"),
            author: v("author"),
            status: v("status"),
            currentPage: v("current_page"),
            totalPages: v("total_pages"),
            category: s(f.category),
            coverUrl: s(f.cover_url)
          })
        );
      }),
    borrar: (c) => seguro(() => deleteBook(c.id!))
  },
  savings_goals: {
    crear: (c) => seguro(() => upsertSavingsGoal(null, formularioDeAhorro((k) => s(c.campos[k])))),
    editar: (c) =>
      seguro(async () => {
        const f = await actual("savings_goals", c.id!, "name, type, target, current_amount, monthly, target_date, priority");
        if (!f) return ya;
        await upsertSavingsGoal(c.id!, formularioDeAhorro(mezcla(c, f)));
      }),
    borrar: (c) => seguro(() => deleteSavingsGoal(c.id!))
  },
  financial_goals: {
    crear: (c) => seguro(() => upsertFinancialGoal(null, formularioDeMeta((k) => s(c.campos[k]), []))),
    editar: (c) =>
      seguro(async () => {
        const f = await actual("financial_goals", c.id!, "name, target, current_amount, horizon, priority, account_ids, family_member_id");
        if (!f) return ya;
        // Las cuentas y el dependiente no los dice el Centro: se conservan.
        const fd = formularioDeMeta(mezcla(c, f), Array.isArray(f.account_ids) ? (f.account_ids as string[]) : []);
        fd.set("familyMemberId", s(f.family_member_id));
        await upsertFinancialGoal(c.id!, fd);
      }),
    borrar: (c) => seguro(() => deleteFinancialGoal(c.id!))
  },
  debts: {
    crear: (c) => seguro(() => upsertDebt(null, formularioDeDeuda((k) => s(c.campos[k])))),
    editar: (c) =>
      seguro(async () => {
        const f = await actual("debts", c.id!, "name, balance, rate, min_payment, due_day");
        if (!f) return ya;
        await upsertDebt(c.id!, formularioDeDeuda(mezcla(c, f)));
      }),
    borrar: (c) => seguro(() => deleteDebt(c.id!))
  },
  assets: {
    crear: (c) => seguro(() => upsertAsset(null, formularioDeActivo((k) => s(c.campos[k])))),
    editar: (c) =>
      seguro(async () => {
        const f = await actual("assets", c.id!, "name, kind, value, as_of, source");
        if (!f) return ya;
        await upsertAsset(c.id!, formularioDeActivo(mezcla(c, f)));
      }),
    borrar: (c) => seguro(() => deleteAsset(c.id!))
  },
  logbook: {
    crear: (c) => seguro(() => saveDailyLearning(s(c.campos.text)))
  },
  daily_reflections: {
    crear: (c) =>
      seguro(async () => {
        // `saveDailyReflection` reescribe el check-in de hoy entero: lo que no
        // se dijo ahora se conserva de lo que ya había.
        const supabase = await createClient();
        const { data: hoy } = await supabase
          .from("daily_reflections")
          .select("mood, energy, sleep_hours, reflection_prompt, reflection, wins")
          .eq("local_date", await todayForUser())
          .maybeSingle();
        const v = <T,>(k: string, previo: T) => (k in c.campos && c.campos[k] !== null ? c.campos[k] : previo);
        return saveDailyReflection({
          mood: v("mood", hoy?.mood ?? null) as number | null,
          energy: v("energy", hoy?.energy ?? null) as number | null,
          sleepHours: v("sleep_hours", hoy?.sleep_hours === null || hoy?.sleep_hours === undefined ? null : Number(hoy.sleep_hours)) as number | null,
          reflectionPrompt: hoy?.reflection_prompt ?? "",
          reflection: s(v("reflection", hoy?.reflection ?? "")),
          wins: s(v("wins", hoy?.wins ?? ""))
        });
      })
  },
  journal_entries: {
    crear: (c) =>
      seguro(() =>
        postTransaction(
          formulario({
            type: s(c.campos.type),
            amount: s(c.campos.amount),
            memo: s(c.campos.memo),
            accountId: s(c.campos.account_id),
            category: s(c.campos.category) || "Otros",
            effectiveAt: s(c.campos.entry_date)
          })
        )
      )
  },
  accounts: {
    crear: (c) =>
      seguro(() =>
        createAccount(
          formulario({ name: s(c.campos.name), type: s(c.campos.type) || "bank", currency: s(c.campos.currency) || "MXN", opening: s(c.campos.opening_balance) || "0" })
        )
      )
  },
  budgets: {
    crear: (c) =>
      seguro(() => {
        const mensual = Number(c.campos.monthly_cost);
        // Sin quincenas dichas, mitad y mitad, como sugiere el formulario.
        return upsertBudgetLine(
          null,
          formulario({
            category: s(c.campos.category),
            monthlyCost: s(c.campos.monthly_cost),
            q1Amount: s(c.campos.q1_amount) || String(r2(mensual / 2)),
            q2Amount: s(c.campos.q2_amount) || String(r2(mensual / 2))
          })
        );
      }),
    editar: (c) =>
      seguro(async () => {
        const f = await actual("budgets", c.id!, "monthly_cost, q1_amount, q2_amount");
        if (!f) return ya;
        const mensual = Number(c.campos.monthly_cost ?? f.monthly_cost);
        // Si cambia el mes y no se dijeron quincenas, se reparten mitad y mitad.
        const reparto = "monthly_cost" in c.campos ? String(r2(mensual / 2)) : null;
        await upsertBudgetLine(
          c.id!,
          formulario({
            monthlyCost: String(mensual),
            q1Amount: s(c.campos.q1_amount ?? reparto ?? f.q1_amount),
            q2Amount: s(c.campos.q2_amount ?? reparto ?? f.q2_amount)
          })
        );
      }),
    borrar: (c) => seguro(() => deleteBudgetLine(c.id!))
  },
  body_measurements: {
    crear: (c) => seguro(() => upsertWeight(formulario({ weightKg: s(c.campos.weight_kg), bodyFatPct: s(c.campos.body_fat_pct) })))
  },
  occupations: {
    crear: (c) =>
      seguro(() =>
        upsertOccupation(
          null,
          formulario({ title: s(c.campos.title), start: s(c.campos.start_time), end: s(c.campos.end_time), category: s(c.campos.category) || "Otros", date: s(c.campos.occ_date) })
        )
      ),
    borrar: (c) => seguro(() => deleteOccupation(c.id!))
  },
  comments: {
    crear: (c) => seguro(() => addTaskComment(s(c.campos.subject_id), s(c.campos.body)))
  },
  identity_traits: {
    crear: (c) =>
      seguro(() => upsertTrait(null, { name: s(c.campos.name), statement: s(c.campos.statement), area: (s(c.campos.area) || "Personal") as "Personal" })),
    editar: (c) =>
      seguro(async () => {
        const f = await actual("identity_traits", c.id!, "name, statement, area, active");
        if (!f) return ya;
        const v = mezcla(c, f);
        return upsertTrait(c.id!, { name: v("name"), statement: v("statement"), area: v("area") as "Personal", active: f.active !== false });
      }),
    borrar: (c) => seguro(() => deleteTrait(c.id!))
  }
};

type Valor = (k: string) => string;

function formularioDeAhorro(v: Valor): FormData {
  return formulario({
    name: v("name"),
    type: v("type") || "Emergencia",
    target: v("target"),
    current: v("current_amount") || "0",
    monthly: v("monthly") || "0",
    targetDate: v("target_date"),
    priority: v("priority") || "Medium"
  });
}

function formularioDeMeta(v: Valor, cuentas: string[]): FormData {
  const fd = formulario({ name: v("name"), target: v("target"), current: v("current_amount") || "0", horizon: v("horizon"), priority: v("priority") || "Medium", familyMemberId: "" });
  for (const id of cuentas) fd.append("accountIds", id);
  return fd;
}

function formularioDeDeuda(v: Valor): FormData {
  return formulario({ name: v("name"), balance: v("balance"), rate: v("rate"), minPayment: v("min_payment"), dueDay: v("due_day") });
}

function formularioDeActivo(v: Valor): FormData {
  return formulario({ name: v("name"), kind: v("kind") || "Otros", value: v("value"), asOf: v("as_of"), source: v("source") || "Estimación" });
}
