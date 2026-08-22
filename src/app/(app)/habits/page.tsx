import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui";
import { habitStreak, habitDoneToday } from "@/lib/domain/habits.ts";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import HabitRow from "./HabitRow";
import HabitForm from "./HabitForm";
import BookForm from "./BookForm";

export default async function HabitsPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: habits }, { data: habitLogs }, { data: occupations }, { data: books }, { data: allNotes }] = await Promise.all([
    supabase.from("habits").select("*").order("created_at"),
    supabase.from("habit_logs").select("habit_id, log_date"),
    supabase.from("occupations").select("id, title, start_time, end_time"),
    supabase.from("books").select("*").order("updated_at", { ascending: false }),
    supabase.from("book_notes").select("*").order("created_at", { ascending: false })
  ]);

  const t0 = todayLocal(await getUserTimeZone());
  const logs = (habitLogs ?? []).map((l) => ({ habitId: l.habit_id, date: l.log_date }));
  const occById = new Map((occupations ?? []).map((o) => [o.id, { id: o.id, title: o.title }]));

  const grouped = { Leyendo: [] as typeof books, "Por leer": [] as typeof books, Terminado: [] as typeof books };
  for (const b of books ?? []) {
    grouped[b.status as keyof typeof grouped]?.push(b);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--purple) 9%, var(--surface))", borderLeft: "3px solid var(--purple)" }}>
        Los hábitos pueden ligarse a una ocupación de Autogestión del Tiempo. La lectura es un seguimiento personal ligero,
        privado, sin relación con Workspaces (BR-027).
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Hábitos</h3>
        <HabitForm occupations={(occupations ?? []).map((o) => ({ id: o.id, title: o.title, start: o.start_time.slice(0, 5), end: o.end_time.slice(0, 5) }))} />
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
                occupations={(occupations ?? []).map((o) => ({ id: o.id, title: o.title, start: o.start_time.slice(0, 5), end: o.end_time.slice(0, 5) }))}
              />
            </div>
          </div>
        ))}
      </Card>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Lectura · Biblioteca</h3>
        <BookForm />
      </div>

      {(["Leyendo", "Por leer", "Terminado"] as const).map((status) => {
        const list = grouped[status];
        if (!list?.length) return null;
        return (
          <Card key={status}>
            <h4 className="font-bold mb-1">{status === "Leyendo" ? "En curso" : status === "Por leer" ? "Por leer" : "Terminados"}</h4>
            {list.map((b) => {
              const notes = (allNotes ?? []).filter((n) => n.book_id === b.id).map((n) => ({ id: n.id, pageRef: n.page_ref, text: n.text }));
              const pct = b.total_pages ? Math.round((b.current_page / b.total_pages) * 100) : 0;
              return (
                <div key={b.id} className="flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
                  <div
                    className="w-11 rounded-lg grid place-items-center text-white font-black flex-shrink-0"
                    style={{ height: 60, background: "linear-gradient(145deg, var(--accent2), var(--accent))" }}
                  >
                    📖
                  </div>
                  <div className="grow">
                    <b>{b.title}</b>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {b.author}
                      {status === "Leyendo" ? ` · pág. ${b.current_page}/${b.total_pages} (${pct}%)` : ""} · {notes.length} nota(s)
                    </div>
                  </div>
                  <BookForm book={{ id: b.id, title: b.title, author: b.author, status: b.status, currentPage: b.current_page, totalPages: b.total_pages }} notes={notes} />
                </div>
              );
            })}
          </Card>
        );
      })}

      {!books?.length && <Card><EmptyState icon="📚" text="Registra el primer libro de tu biblioteca." /></Card>}
    </div>
  );
}
