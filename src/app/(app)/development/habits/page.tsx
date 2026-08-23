import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui";
import { habitStreak, habitDoneToday } from "@/lib/domain/habits.ts";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import HabitRow from "./HabitRow";
import HabitForm from "./HabitForm";

export default async function HabitsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: habits }, { data: habitLogs }, { data: occupations }] = await Promise.all([
    supabase.from("habits").select("*").order("created_at"),
    supabase.from("habit_logs").select("habit_id, log_date"),
    supabase.from("occupations").select("id, title, start_time, end_time")
  ]);

  const t0 = todayLocal(await getUserTimeZone());
  const logs = (habitLogs ?? []).map((l) => ({ habitId: l.habit_id, date: l.log_date }));
  const occById = new Map((occupations ?? []).map((o) => [o.id, { id: o.id, title: o.title }]));
  const occOptions = (occupations ?? []).map((o) => ({
    id: o.id,
    title: o.title,
    start: o.start_time.slice(0, 5),
    end: o.end_time.slice(0, 5)
  }));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--c-orange) 9%, var(--surface))", borderLeft: "3px solid var(--c-orange)" }}>
        Los hábitos pueden ligarse a una ocupación de Autogestión del Tiempo. Son un seguimiento personal, privado, sin
        relación con Workspaces (BR-027).
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Hábitos</h3>
        <HabitForm occupations={occOptions} />
      </div>
      <Card>
        {!habits?.length && <EmptyState icon="✅" text="Crea tu primer hábito, opcionalmente ligado a una ocupación." />}
        {(habits ?? []).map((h) => (
          <div key={h.id}>
            <HabitRow
              habit={{ id: h.id, name: h.name, frequency: h.frequency, category: h.category }}
              doneToday={habitDoneToday(h.id, logs, t0)}
              streak={habitStreak(h.id, logs, t0)}
              occupation={h.occupation_id ? occById.get(h.occupation_id) ?? null : null}
            />
            <div className="flex justify-end -mt-1 mb-1">
              <HabitForm
                habit={{ id: h.id, name: h.name, frequency: h.frequency, category: h.category, occupationId: h.occupation_id }}
                occupations={occOptions}
              />
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}
