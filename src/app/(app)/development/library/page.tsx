import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, EmptyState, Progress } from "@/components/ui";
import { ModuleNote, SectionHeader } from "../FormSheet";
import BookForm, { BookCover } from "./BookForm";
import LibraryViews, { type LibraryView } from "./LibraryViews";
import { getSessionUser } from "@/lib/data/session";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { fdate } from "@/lib/format";
import { BOOK_CATEGORIES } from "@/lib/domain/development/book-lookup.ts";
import { estimatedFinish, stalledDays, BASIS_LABEL, type ProgressPoint } from "@/lib/domain/development/reading.ts";

const GROUP_TITLE = { Leyendo: "En curso", "Por leer": "Por leer", Terminado: "Terminados" } as const;
const STATUS_ORDER = ["Leyendo", "Por leer", "Terminado"] as const;

/** Días sin avanzar a partir de los cuales se avisa. Una semana entera. */
const DIAS_PARA_AVISAR = 7;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ por?: string }> }) {
  const { por } = await searchParams;
  const view: LibraryView = por === "categoria" || por === "todos" ? por : "estado";

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: books }, { data: allNotes }, { data: progress }, timeZone] = await Promise.all([
    supabase.from("books").select("*").order("updated_at", { ascending: false }),
    supabase.from("book_notes").select("*").order("created_at", { ascending: false }),
    // El historial de lectura (migración 0034). Sin él la fecha estimada cae al
    // promedio desde el inicio y no puede avisar de un libro estancado.
    supabase.from("book_progress").select("book_id, local_date, page"),
    getUserTimeZone()
  ]);

  const t0 = todayLocal(timeZone);

  const puntosPorLibro = new Map<string, ProgressPoint[]>();
  for (const p of progress ?? []) {
    const lista = puntosPorLibro.get(p.book_id) ?? [];
    lista.push({ date: p.local_date, page: p.page });
    puntosPorLibro.set(p.book_id, lista);
  }

  const filas = (books ?? []).map((b) => {
    const puntos = puntosPorLibro.get(b.id) ?? [];
    return {
      libro: b,
      notas: (allNotes ?? []).filter((n) => n.book_id === b.id).map((n) => ({ id: n.id, pageRef: n.page_ref, text: n.text })),
      pct: b.total_pages ? Math.round((b.current_page / b.total_pages) * 100) : 0,
      estimacion: estimatedFinish(
        { currentPage: b.current_page, totalPages: b.total_pages, status: b.status, startedAt: b.started_at },
        puntos,
        t0
      ),
      estancado: stalledDays(puntos, t0)
    };
  });

  type Fila = (typeof filas)[number];

  // Cada vista es solo una forma distinta de AGRUPAR las mismas filas. La
  // tarjeta de libro es idéntica en las tres: cambiar de vista no puede
  // cambiar lo que se sabe de un libro, solo dónde aparece.
  const grupos: { titulo: string; filas: Fila[] }[] =
    view === "categoria"
      ? BOOK_CATEGORIES.map((c) => ({ titulo: c, filas: filas.filter((f) => f.libro.category === c) })).filter(
          (g) => g.filas.length > 0
        )
      : view === "todos"
        ? [{ titulo: `Todos · ${filas.length} libro${filas.length === 1 ? "" : "s"}`, filas }]
        : STATUS_ORDER.map((s) => ({ titulo: GROUP_TITLE[s], filas: filas.filter((f) => f.libro.status === s) })).filter(
            (g) => g.filas.length > 0
          );

  return (
    <div className="flex flex-col gap-3.5">
      <ModuleNote>La lectura es un seguimiento personal ligero, privado, sin relación con Workspaces (BR-027).</ModuleNote>

      <SectionHeader action={<BookForm />}>Lectura · Biblioteca</SectionHeader>

      {(books?.length ?? 0) > 0 && <LibraryViews view={view} />}

      {grupos.map((grupo) => (
        <Card key={grupo.titulo}>
          <h4 className="font-bold mb-1">{grupo.titulo}</h4>
          {grupo.filas.map(({ libro: b, notas, pct, estimacion, estancado }) => (
            // `items-start` + `min-w-0`: un título largo ya no empuja el
            // botón "Abrir" fuera de la tarjeta, se envuelve bajo la portada.
            <div key={b.id} className="flex items-start gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
              <BookCover url={b.cover_url} />
              <div className="grow min-w-0">
                <b style={{ overflowWrap: "anywhere" }}>{b.title}</b>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
                  {b.author}
                  {b.author ? " · " : ""}
                  {/* En la vista por estado la categoría es el dato que falta;
                      en la de categoría el estado. Se muestra el complementario
                      para que la fila se explique sola en cualquier vista. */}
                  {view === "categoria" ? b.status : b.category}
                  {" · "}
                  {notas.length} nota{notas.length === 1 ? "" : "s"}
                </div>

                {b.status === "Leyendo" && (
                  <>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="grow min-w-0">
                        <Progress pct={pct} />
                      </span>
                      <span className="text-xs flex-shrink-0" style={{ color: "var(--muted)" }}>
                        {b.current_page}/{b.total_pages} · {pct}%
                      </span>
                    </div>

                    {/* Con `basis: "sin datos"` NO se pinta ninguna fecha. Una
                        fecha inventada se lee igual que una calculada, y esa
                        es justamente la manera de perderle la confianza. */}
                    {estimacion.date && (
                      <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                        Terminarías el <b>{fdate(estimacion.date)}</b> · {estimacion.pagesPerDay} págs./día,{" "}
                        {BASIS_LABEL[estimacion.basis]}
                      </div>
                    )}

                    {estancado !== null && estancado >= DIAS_PARA_AVISAR && (
                      <div className="text-xs mt-1" style={{ color: "var(--warn)" }}>
                        Llevas {estancado} días sin avanzar en este libro.
                      </div>
                    )}
                  </>
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
                    coverUrl: b.cover_url,
                    category: b.category
                  }}
                  notes={notas}
                />
              </span>
            </div>
          ))}
        </Card>
      ))}

      {!books?.length && (
        <Card>
          <EmptyState icon="📚" text="Registra el primer libro de tu biblioteca." />
        </Card>
      )}
    </div>
  );
}
