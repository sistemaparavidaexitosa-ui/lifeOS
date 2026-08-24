import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState } from "@/components/ui";
import BookForm, { BookCover } from "./BookForm";

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: books }, { data: allNotes }] = await Promise.all([
    supabase.from("books").select("*").order("updated_at", { ascending: false }),
    supabase.from("book_notes").select("*").order("created_at", { ascending: false })
  ]);

  const grouped = { Leyendo: [] as typeof books, "Por leer": [] as typeof books, Terminado: [] as typeof books };
  for (const b of books ?? []) {
    grouped[b.status as keyof typeof grouped]?.push(b);
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--c-orange) 9%, var(--surface))", borderLeft: "3px solid var(--c-orange)" }}>
        La lectura es un seguimiento personal ligero, privado, sin relación con Workspaces (BR-027).
      </div>

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
                  <BookCover url={b.cover_url} />
                  <div className="grow">
                    <b>{b.title}</b>
                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      {b.author}
                      {status === "Leyendo" ? ` · pág. ${b.current_page}/${b.total_pages} (${pct}%)` : ""} · {notes.length} nota(s)
                    </div>
                  </div>
                  <BookForm book={{ id: b.id, title: b.title, author: b.author, status: b.status, currentPage: b.current_page, totalPages: b.total_pages, coverUrl: b.cover_url }} notes={notes} />
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
