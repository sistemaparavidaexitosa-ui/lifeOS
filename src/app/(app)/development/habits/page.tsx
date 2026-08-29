import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui";
import { habitStreak, habitDoneToday } from "@/lib/domain/habits.ts";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { ModuleNote, SectionHeader } from "../FormSheet";
import HabitRow from "./HabitRow";
import HabitForm from "./HabitForm";
import HabitTemplates from "./HabitTemplates";
import { getSessionUser } from "@/lib/data/session";

export default async function HabitsPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: habits }, { data: habitLogs }, { data: occupations }] = await Promise.all([
    supabase.from("habits").select("*").order("created_at"),
    supabase.from("habit_logs").select("habit_id, log_date"),
    supabase.from("occupations").select("id, title, start_time, end_time")
  ]);

  const t0 = todayLocal(await getUserTimeZone());
  const logs = (habitLogs ?? []).map((l) => ({ habitId: l.habit_id, date: l.log_date }));
  const occById = new Map((occupations ?? []).map((o) => [o.id, { id: o.id, title: o.title }]));
  // Nombres de los hábitos, para el selector de apilamiento y para mostrar
  // "después de X" en la fila del que está apilado.
  const habitById = new Map((habits ?? []).map((h) => [h.id, h.name]));
  const habitOptions = (habits ?? []).map((h) => ({ id: h.id, name: h.name }));
  const occOptions = (occupations ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    start: o.start_time.slice(0, 5),
    end: o.end_time.slice(0, 5)
  }));

  return (
    <div className="flex flex-col gap-3.5">
      <ModuleNote>
        Los hábitos pueden ligarse a una ocupación de Autogestión del Tiempo. Son un seguimiento personal, privado, sin
        relación con Workspaces (BR-027).
      </ModuleNote>

      <SectionHeader
        action={
          <span className="flex gap-2">
            <HabitTemplates occupations={occOptions} otherHabits={habitOptions} />
            <HabitForm occupations={occOptions} otherHabits={habitOptions} />
          </span>
        }
      >
        Hábitos
      </SectionHeader>

      <Card>
        {!habits?.length && <EmptyState icon="✅" text="Crea tu primer hábito, o parte de una plantilla: cada una trae su señal («después de qué») y su versión de dos minutos." />}
        {(habits ?? []).map((h) => (
          // El botón de editar va DENTRO de la fila: antes colgaba de una fila
          // propia alineada a la derecha bajo cada hábito, y en móvil la lista
          // se leía como el doble de renglones de los que tiene.
          <HabitRow
            key={h.id}
            habit={{
              id: h.id,
              name: h.name,
              frequency: h.frequency,
              category: h.category,
              cue: h.cue,
              twoMinVersion: h.two_min_version,
              stackAfterName: h.stack_after_habit_id ? habitById.get(h.stack_after_habit_id) ?? null : null
            }}
            doneToday={habitDoneToday(h.id, logs, t0)}
            streak={habitStreak(h.id, logs, t0)}
            occupation={h.occupation_id ? occById.get(h.occupation_id) ?? null : null}
            action={
              <HabitForm
                habit={{
                  id: h.id,
                  name: h.name,
                  frequency: h.frequency,
                  category: h.category,
                  occupationId: h.occupation_id,
                  cue: h.cue,
                  twoMinVersion: h.two_min_version,
                  stackAfterHabitId: h.stack_after_habit_id
                }}
                occupations={occOptions}
                otherHabits={habitOptions}
              />
            }
          />
        ))}
      </Card>
    </div>
  );
}
