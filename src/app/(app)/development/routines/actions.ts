// src/app/(app)/development/routines/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { toggleHabitEffect, routineRunComplete, routineRunNeedsWrite } from "@/lib/domain/development/routines.ts";
import { matchHabitForStep } from "@/lib/domain/development/templates.ts";
// El catálogo se lee de `template_catalog` (0044) y no de un array del módulo:
// `getRoutineTemplate` ya no existe.
import { getTemplate } from "@/lib/data/templates";
import { describeDbError, type ActionResult } from "@/lib/supabase/errors";

const routineSchema = z.object({
  name: z.string().min(1),
  frequency: z.enum(["Diario", "Semanal", "Entre semana", "Fin de semana"]),
  occupationId: z.string().uuid().optional().or(z.literal("")),
  // Cap. 2 de «Hábitos atómicos»: opcional, porque una rutina sin identidad
  // sigue siendo una rutina — solo que sostenida por fuerza de voluntad.
  identity: z.string().max(160).optional().default(""),
  active: z.coerce.boolean().default(true)
});

export async function upsertRoutine(id: string | null, formData: FormData) {
  const parsed = routineSchema.parse({
    name: formData.get("name"),
    frequency: formData.get("frequency"),
    occupationId: formData.get("occupationId") ?? "",
    identity: formData.get("identity") ?? "",
    active: formData.get("active") === "on" || formData.get("active") === "true"
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    name: parsed.name,
    frequency: parsed.frequency,
    occupation_id: parsed.occupationId || null,
    identity: parsed.identity.trim(),
    active: parsed.active
  };

  if (id) {
    const { error } = await supabase.from("routines").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("routines").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }
  revalidatePath("/development/routines");
  revalidatePath("/development");
}

export async function deleteRoutine(id: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("routines").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/development/routines");
  revalidatePath("/development");
}

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Recalcula si la rutina queda cerrada HOY y lo escribe en `routine_runs`.
 *
 * Existe porque el cierre no depende solo de marcar casillas. Mientras lo
 * recalculaba únicamente `toggleHabitToday`, añadir un hábito a una rutina ya
 * cerrada dejaba `completed_at` puesto —la rutina ya no estaba completa— y
 * borrar el último sin marcar lo dejaba en null aunque sí lo estuviera. Como
 * `routineAdherence` lee `completed_at`, el chip de «% a 30 días» acababa
 * contradiciendo a la barra de progreso que tiene justo encima, que se calcula
 * desde `habit_logs`. Con D-094 diciendo que solo hay una fuente de verdad,
 * dos respuestas distintas en la misma tarjeta no son un detalle.
 *
 * `arranca` distingue ejecutar de editar: al tocar una casilla la ejecución del
 * día se abre aunque falten hábitos —`started_at` es el dato que dice cuándo
 * empezaste—, pero al editar solo se corrige lo que ya existe (ver
 * `routineRunNeedsWrite`).
 */
async function sincronizarCierreDeRutina(
  supabase: Db,
  routineId: string,
  today: string,
  { arranca }: { arranca: boolean }
): Promise<void> {
  const [{ data: habits }, { data: run }] = await Promise.all([
    supabase.from("habits").select("id").eq("routine_id", routineId),
    supabase.from("routine_runs").select("id").eq("routine_id", routineId).eq("local_date", today).maybeSingle()
  ]);

  const habitIds = (habits ?? []).map((h) => h.id);
  // El uuid imposible evita que `.in()` con lista vacía devuelva la tabla
  // entera: una rutina recién vaciada no puede heredar los registros de nadie.
  const { data: logsHoy } = await supabase
    .from("habit_logs")
    .select("habit_id")
    .eq("log_date", today)
    .in("habit_id", habitIds.length > 0 ? habitIds : ["00000000-0000-0000-0000-000000000000"]);

  const cerrada = routineRunComplete(habitIds, (logsHoy ?? []).map((l) => l.habit_id));
  if (!arranca && !routineRunNeedsWrite(Boolean(run), cerrada)) return;

  // upsert con onConflict: dos clics simultáneos no crean dos ejecuciones del
  // mismo día — el índice único (routine_id, local_date) lo resuelve en la base.
  // `started_at` no viaja en el payload, así que la primera hora se conserva.
  const { error } = await supabase
    .from("routine_runs")
    .upsert(
      { routine_id: routineId, local_date: today, completed_at: cerrada ? new Date().toISOString() : null },
      { onConflict: "routine_id,local_date" }
    );
  if (error) throw new Error(error.message);
}

const habitSchema = z.object({
  name: z.string().min(1),
  category: z.enum(["Salud", "Aprendizaje", "Trabajo", "Personal", "Otros"]),
  durationMin: z.coerce.number().int().min(1).default(5),
  position: z.coerce.number().int().min(0).default(0),
  // Los tres campos de «Hábitos atómicos» (migración 0033). Opcionales: un
  // hábito sin señal sigue siendo un hábito válido, solo que más frágil.
  cue: z.string().max(240).optional().default(""),
  twoMinVersion: z.string().max(240).optional().default(""),
  stackAfterHabitId: z.string().uuid().optional().or(z.literal(""))
});

/**
 * Crear o editar un hábito. `routineId` es un parámetro y no un campo del
 * formulario porque desde 0046 no hay hábito sin rutina: el formulario se abre
 * siempre desde dentro de una, y no hay estado en el que la pregunta «¿de qué
 * rutina?» quede abierta.
 *
 * Ya no recibe `frequency` —la dicta la rutina— ni `occupationId` —el bloque lo
 * ancla la rutina—. Las dos columnas se fueron en 0046.
 */
export async function upsertHabit(routineId: string, id: string | null, formData: FormData) {
  const parsed = habitSchema.parse({
    name: formData.get("name"),
    category: formData.get("category"),
    durationMin: formData.get("durationMin") ?? 5,
    position: formData.get("position") ?? 0,
    cue: formData.get("cue") ?? "",
    twoMinVersion: formData.get("twoMinVersion") ?? "",
    stackAfterHabitId: formData.get("stackAfterHabitId") ?? ""
  });

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const payload = {
    name: parsed.name,
    category: parsed.category,
    routine_id: routineId,
    position: parsed.position,
    duration_min: parsed.durationMin,
    cue: parsed.cue.trim(),
    two_min_version: parsed.twoMinVersion.trim(),
    stack_after_habit_id: parsed.stackAfterHabitId || null
  };

  if (id) {
    const { error } = await supabase.from("habits").update(payload).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("habits").insert({ ...payload, user_id: user.id });
    if (error) throw new Error(error.message);
  }

  // La rutina acaba de cambiar de tamaño: el hábito nuevo la descierra, y el
  // editado puede haber sido el que faltaba.
  await sincronizarCierreDeRutina(supabase, routineId, todayLocal(await getUserTimeZone()), { arranca: false });

  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
}

export async function deleteHabit(id: string) {
  const supabase = await createClient();
  // La rutina se lee ANTES de borrar: después la fila ya no está y con ella se
  // iría el único sitio donde consta a qué rutina había que recalcularle el
  // cierre del día. Borrar el último hábito que quedaba sin marcar completa la
  // rutina sin que nadie toque una casilla.
  const { data: habit } = await supabase.from("habits").select("routine_id").eq("id", id).maybeSingle();

  const { error } = await supabase.from("habits").delete().eq("id", id);
  if (error) throw new Error(error.message);

  if (habit?.routine_id) {
    await sincronizarCierreDeRutina(supabase, habit.routine_id, todayLocal(await getUserTimeZone()), { arranca: false });
  }

  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
}

/**
 * Marca o desmarca el hábito de hoy, y de paso abre o cierra la ejecución de su
 * rutina.
 *
 * Un solo registro: `habit_logs`. Antes de 0046 había dos —el paso en
 * `routine_runs.completed_step_ids` y el hábito en `habit_logs`— y esta acción
 * tenía que reconciliarlos. Ahora `routine_runs` solo guarda CUÁNDO se cerró la
 * rutina, y quién decide si está cerrada es `routineRunComplete`.
 */
export async function toggleHabitToday(routineId: string, habitId: string) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado");

  const today = todayLocal(await getUserTimeZone());

  const { data: log } = await supabase
    .from("habit_logs")
    .select("id")
    .eq("habit_id", habitId)
    .eq("log_date", today)
    .maybeSingle();

  if (toggleHabitEffect(Boolean(log)) === "delete") {
    const { error } = await supabase.from("habit_logs").delete().eq("id", log!.id);
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.uncomplete", object: habitId });
  } else {
    const { error } = await supabase.from("habit_logs").insert({ habit_id: habitId, log_date: today });
    if (error) throw new Error(error.message);
    await supabase.from("audit_log").insert({ user_id: user.id, action: "habit.complete", object: habitId });
  }

  // Se recalcula DESPUÉS de escribir: así el cierre de la rutina refleja el
  // estado real y no el que teníamos antes del clic. `arranca: true` porque
  // tocar una casilla SÍ es ejecutar la rutina, y la ejecución del día se abre
  // aunque queden hábitos por marcar.
  await sincronizarCierreDeRutina(supabase, routineId, today, { arranca: true });

  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
}

/**
 * Crea una rutina COPIANDO una plantilla del catálogo.
 *
 * Copia y no enlace: a partir de aquí la rutina es del usuario y se edita como
 * cualquier otra. Cambiar el catálogo en un despliegue futuro no puede
 * reescribirle los pasos a nadie.
 *
 * Dos cosas que aprovechan lo que ya existe:
 *
 *   - `occupationId` se pide al crear. Tanto Mañana Milagrosa como el Club de
 *     las 5 AM tratan de UNA HORA concreta del día; anclarla al bloque horario
 *     en el momento de crear la rutina es la mitad del método, y después nadie
 *     vuelve a abrir el formulario para hacerlo.
 *   - La plantilla siembra HÁBITOS, no pasos: desde 0046 son lo mismo, así que
 *     cada paso de la plantilla nace con racha propia desde el primer día.
 *     `matchHabitForStep` ya no sirve para ligar —no hay nada que ligar— pero
 *     sí para NO duplicar: si el usuario ya tiene ese hábito en otra rutina, se
 *     salta, porque un hábito solo puede estar en una.
 *
 * Saltarse un paso no puede ser silencioso, y por eso los nombres vuelven en
 * `skipped`. Antes de 0046 la plantilla creaba TODOS los pasos y como mucho los
 * ligaba a un hábito existente, así que la rutina siempre salía completa; ahora
 * puede nacer con tres hábitos menos, y una rutina incompleta que nadie anunció
 * parece un fallo del programa. Por el mismo motivo el reconocimiento usa solo
 * `step.habitHint` y no el título del paso: "Silencio" o "Crecer" se
 * escribieron para leerse, no para compararse, y una coincidencia de más aquí
 * ya no es inofensiva — borra un hábito de la rutina que estás creando.
 *
 * Contrato `{ ok, reason }` (D-030): esta acción la llama un Client Component
 * que necesita pintar el motivo si algo falla.
 */
export async function createRoutineFromTemplate(
  templateId: string,
  occupationId: string
): Promise<ActionResult & { id?: string; skipped?: string[] }> {
  // Desde 0044 «ya no existe» también cubre que un administrador la haya
  // despublicado mientras el panel llevaba un rato abierto.
  const template = await getTemplate("routine", templateId);
  if (!template) return { ok: false, reason: "Esa plantilla ya no existe." };

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: "Tu sesión expiró. Vuelve a iniciar sesión." };

  const { data: routine, error } = await supabase
    .from("routines")
    .insert({
      user_id: user.id,
      name: template.name,
      frequency: template.frequency,
      occupation_id: occupationId || null,
      identity: "",
      active: true
    })
    .select("id")
    .single();
  if (error || !routine) return { ok: false, reason: describeDbError(error) };

  // Los hábitos que el usuario ya tiene, para no sembrar un duplicado que
  // bifurcaría la racha en dos filas con el mismo nombre.
  const { data: existentes } = await supabase.from("habits").select("id, name");
  const nombrePorId = new Map((existentes ?? []).map((h) => [h.id, h.name as string]));

  // Se recorre a mano y no con filter+map porque hacen falta las dos mitades:
  // lo que se siembra y lo que NO, con el nombre que el usuario reconoce —el
  // suyo, no el del paso de la plantilla— para poder decírselo.
  const saltados: string[] = [];
  const nuevos: {
    user_id: string;
    routine_id: string;
    name: string;
    category: "Otros";
    position: number;
    duration_min: number;
    cue: string;
    two_min_version: string;
  }[] = [];

  for (const step of template.steps) {
    const yaLoTiene = matchHabitForStep(step.habitHint, existentes ?? []);
    if (yaLoTiene !== null) {
      saltados.push(nombrePorId.get(yaLoTiene) ?? step.title);
      continue;
    }
    nuevos.push({
      user_id: user.id,
      routine_id: routine.id as string,
      name: step.title,
      category: "Otros",
      // La posición se cuenta sobre los que SÍ entran: un hueco en el orden se
      // vería como un salto en la lista de la rutina.
      position: nuevos.length,
      duration_min: step.durationMin,
      cue: "",
      two_min_version: ""
    });
  }

  if (nuevos.length === 0) {
    // Los pasos existían todos ya como hábitos del usuario, así que no hay
    // nada que sembrar. No es un error, pero tampoco se puede dejar la rutina
    // creada: `routineRunComplete` da por no cumplida a propósito una rutina
    // sin hábitos, así que quedaría marcada "hoy" para siempre sin que nadie
    // entienda por qué. Se borra y se explica, en vez de dejar una trampa.
    await supabase.from("routines").delete().eq("id", routine.id);
    return {
      ok: false,
      reason: `Ya tienes todos los hábitos de esta plantilla en otras rutinas: ${saltados.join(", ")}. Un hábito solo puede vivir en una a la vez, así que no quedaba nada que sembrar y la rutina no se ha creado.`
    };
  }

  const { error: habitsError } = await supabase.from("habits").insert(nuevos);
  if (habitsError) {
    // Una rutina sin hábitos no sirve de nada y es peor que no haberla creado:
    // el usuario tendría que borrarla a mano para volver a intentarlo.
    await supabase.from("routines").delete().eq("id", routine.id);
    return { ok: false, reason: describeDbError(habitsError) };
  }

  revalidatePath("/development/routines");
  revalidatePath("/development");
  revalidatePath("/home");
  return { ok: true, id: routine.id as string, skipped: saltados };
}
