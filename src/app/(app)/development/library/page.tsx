import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, Progress } from "@/components/ui";
import { ModuleNote, SectionHeader } from "../FormSheet";
import BookForm, { BookCover } from "./BookForm";
import { getSessionUser } from "@/lib/data/session";

const GROUP_TITLE = { Leyendo: "En curso", "Por leer": "Por leer", Terminado: "Terminados" } as const;

export default async function LibraryPage() {
  const supabase = await createClient();
  const user = await getSessionUser();
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
      <ModuleNote>La lectura es un seguimiento personal ligero, privado, sin relación con Workspaces (BR-027).</ModuleNote>

      <SectionHeader action={<BookForm />}>Lectura · Biblioteca</SectionHeader>

      {(["Leyendo", "Por leer", "Terminado"] as const).map((status) => {
        const list = grouped[status];
        if (!list?.length) return null;
        return (
          <Card key={status}>
            <h4 className="font-bold mb-1">{GROUP_TITLE[status]}</h4>
            {list.map((b) => {
              const notes = (allNotes ?? []).filter((n) => n.book_id === b.id).map((n) => ({ id: n.id, pageRef: n.page_ref, text: n.text }));
              const pct = b.total_pages ? Math.round((b.current_page / b.total_pages) * 100) : 0;
              return (
                // `items-start` + `min-w-0`: un título largo ya no empuja el
                // botón "Abrir" fuera de la tarjeta, se envuelve bajo la portada.
                <div key={b.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
                  <BookCover url={b.cover_url} />
                  <div className="grow min-w-0">
                    <b style={{ overflowWrap: "anywhere" }}>{b.title}</b>
                    <div className="text-xs mt-0.5" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
                      {b.author}
                      {b.author ? " · " : ""}
                      {notes.length} nota{notes.length === 1 ? "" : "s"}
                    </div>
                    {/* La lectura en curso se lee de un vistazo: la barra dice
                        lo mismo que el "(43 %)" que iba perdido en la línea de
                        autor, y no compite por el ancho con el título. */}
                    {status === "Leyendo" && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="grow min-w-0">
                          <Progress pct={pct} />
                        </span>
                        <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>
                          {b.current_page}/{b.total_pages} · {pct}%
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="flex-shrink-0">
                    <BookForm
                      book={{
                        id: b.id,
                        title: b.title,
                        author: b.author,
                        status: b.status,
                        currentPage: b.current_page,
                        totalPages: b.total_pages,
                        coverUrl: b.cover_url
                      }}
                      notes={notes}
                    />
                  </span>
                </div>
              );
            })}
          </Card>
        );
      })}

      {!books?.length && (
        <Card>
          <EmptyState icon="📚" text="Registra el primer libro de tu biblioteca." />
        </Card>
      )}
    </div>
  );
}
