import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState, Progress } from "@/components/ui";
import { ModuleNote, SectionHeader } from "../FormSheet";
import BookForm, { BookCover } from "./BookForm";
import PlanForm from "./PlanForm";
import QuickProgress from "./QuickProgress";
import LibraryViews, { type LibraryView } from "./LibraryViews";
import { getSessionUser } from "@/lib/data/session";
import { todayLocal, weekStartISO, addDaysISO } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { fdate } from "@/lib/format";
import { BOOK_CATEGORIES } from "@/lib/domain/development/book-lookup.ts";
import { estimatedFinish, stalledDays, BASIS_LABEL, type ProgressPoint } from "@/lib/domain/development/reading.ts";
import { planStatus, requiredPace, type PlanEntry } from "@/lib/domain/development/reading-plan.ts";

const GROUP_TITLE = { Leyendo: "En curso", "Por leer": "Por leer", Terminado: "Terminados" } as const;
const STATUS_ORDER = ["Leyendo", "Por leer", "Terminado"] as const;

/** Días sin avanzar a partir de los cuales se avisa. Una semana entera. */
const DIAS_PARA_AVISAR = 7;

export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ por?: string }> }) {
  const { por } = await searchParams;
  const view: LibraryView =
    por === "categoria" || por === "todos" || por === "plan" ? por : "estado";

  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [{ data: books }, { data: allNotes }, { data: progress }, { data: plan }, timeZone] = await Promise.all([
    supabase.from("books").select("*").order("updated_at", { ascending: false }),
    supabase.from("book_notes").select("*").order("created_at", { ascending: false }),
    // El historial de lectura (migración 0034). Sin él la fecha estimada cae al
    // promedio desde el inicio y no puede avisar de un libro estancado.
    supabase.from("book_progress").select("book_id, local_date, page"),
    // La cola semanal (migración 0043).
    supabase.from("reading_plan_weeks").select("book_id, week_start, position"),
    getUserTimeZone()
  ]);

  const t0 = todayLocal(timeZone);
  const semanaActual = weekStartISO(t0);

  const puntosPorLibro = new Map<string, ProgressPoint[]>();
  for (const p of progress ?? []) {
    const lista = puntosPorLibro.get(p.book_id) ?? [];
    lista.push({ date: p.local_date, page: p.page });
    puntosPorLibro.set(p.book_id, lista);
  }

  const entradas: PlanEntry[] = (plan ?? []).map((p) => ({
    bookId: p.book_id,
    weekStart: p.week_start,
    position: p.position
  }));
  const semanasPorLibro = new Map<string, string[]>();
  for (const e of entradas) {
    const lista = semanasPorLibro.get(e.bookId) ?? [];
    lista.push(e.weekStart);
    semanasPorLibro.set(e.bookId, lista);
  }
  for (const lista of semanasPorLibro.values()) lista.sort((a, b) => a.localeCompare(b));

  const filas = (books ?? []).map((b) => {
    const puntos = puntosPorLibro.get(b.id) ?? [];
    const suyas = entradas.filter((e) => e.bookId === b.id);
    const comoLibro = {
      id: b.id,
      status: b.status,
      currentPage: b.current_page,
      totalPages: b.total_pages,
      updatedAt: b.updated_at
    };
    return {
      libro: b,
      notas: (allNotes ?? []).filter((n) => n.book_id === b.id).map((n) => ({ id: n.id, pageRef: n.page_ref, text: n.text })),
      pct: b.total_pages ? Math.round((b.current_page / b.total_pages) * 100) : 0,
      estimacion: estimatedFinish(
        { currentPage: b.current_page, totalPages: b.total_pages, status: b.status, startedAt: b.started_at },
        puntos,
        t0
      ),
      estancado: stalledDays(puntos, t0),
      semanas: semanasPorLibro.get(b.id) ?? [],
      planEstado: planStatus(suyas, comoLibro, t0),
      ritmo: requiredPace(comoLibro, suyas, t0)
    };
  });

  type Fila = (typeof filas)[number];

  // Cada vista es solo una forma distinta de AGRUPAR las mismas filas. La
  // tarjeta de libro es idéntica en todas: cambiar de vista no puede cambiar
  // lo que se sabe de un libro, solo dónde aparece.
  const grupos: { titulo: string; filas: Fila[] }[] =
    view === "categoria"
      ? BOOK_CATEGORIES.map((c) => ({ titulo: c, filas: filas.filter((f) => f.libro.category === c) })).filter(
          (g) => g.filas.length > 0
        )
      : view === "plan"
        ? gruposDelPlan(filas, semanaActual)
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

      {view === "plan" && (books?.length ?? 0) > 0 && (
        <ModuleNote>
          Programa cada libro por semanas. El que toque esta semana es el que aparece en Inicio y en el Panel de
          Desarrollo Personal.
        </ModuleNote>
      )}

      {grupos.map((grupo) => (
        <Card key={grupo.titulo}>
          <h4 className="font-bold mb-1">{grupo.titulo}</h4>
          {grupo.filas.map(({ libro: b, notas, pct, estimacion, estancado, semanas, planEstado, ritmo }) => (
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

                {planEstado === "Atrasado" && (
                  <div className="mt-1">
                    <Chip kind="bad">Atrasado</Chip>
                  </div>
                )}

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

                    {/* El ritmo que EXIGE el plan, junto al que llevas de
                        verdad. Es la frase que convierte la cola en un plan:
                        una lista de semanas sin esto no dice si llegas. */}
                    {ritmo && (
                      <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                        Para acabar el <b>{fdate(ritmo.lastDay)}</b> necesitas <b>{ritmo.pagesPerDay}</b> págs./día
                        {estimacion.basis === "historial" ? `, y vas a ${estimacion.pagesPerDay}` : ""}.
                      </div>
                    )}

                    {estancado !== null && estancado >= DIAS_PARA_AVISAR && (
                      <div className="text-xs mt-1" style={{ color: "var(--warn)" }}>
                        Llevas {estancado} días sin avanzar en este libro.
                      </div>
                    )}

                    <QuickProgress bookId={b.id} currentPage={b.current_page} />
                  </>
                )}
              </div>
              {/* Los botones se apilan: en 360px "Abrir" y "Programar" en una
                  línea dejan al título unos 100px. */}
              <span className="flex-shrink-0 flex flex-col items-stretch gap-1">
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
                {/* Programar un libro ya terminado no tiene a qué apuntar. */}
                {b.status !== "Terminado" && (
                  <PlanForm bookId={b.id} title={b.title} currentWeek={semanaActual} planned={semanas} />
                )}
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

/**
 * Agrupa por SEMANA, en el orden en que hay que atenderlas: primero lo que se
 * pasó de fecha, luego la semana en curso, luego lo que viene, y al final lo
 * que ni siquiera está en la cola.
 *
 * Un libro de varias semanas aparece en cada una de ellas a propósito: la
 * pregunta que contesta esta vista es "¿qué toca esta semana?", y un libro que
 * abarca tres semanas toca en las tres.
 */
function gruposDelPlan<T extends { libro: { status: string }; semanas: string[]; planEstado: string }>(
  filas: T[],
  semanaActual: string
): { titulo: string; filas: T[] }[] {
  const grupos: { titulo: string; filas: T[] }[] = [];

  const atrasados = filas.filter((f) => f.planEstado === "Atrasado");
  if (atrasados.length) grupos.push({ titulo: "Atrasados", filas: atrasados });

  // Solo las semanas que alguien ocupa: pintar las intermedias vacías llenaría
  // la pantalla de tarjetas que no dicen nada.
  const semanas = [...new Set(filas.flatMap((f) => f.semanas))]
    .filter((s) => s >= semanaActual)
    .sort((a, b) => a.localeCompare(b));

  for (const semana of semanas) {
    const suyas = filas.filter((f) => f.semanas.includes(semana) && f.planEstado !== "Atrasado");
    if (!suyas.length) continue;
    const etiqueta =
      semana === semanaActual
        ? `Esta semana · ${fdate(semana)} al ${fdate(addDaysISO(semana, 6))}`
        : `Semana del ${fdate(semana)}`;
    grupos.push({ titulo: etiqueta, filas: suyas });
  }

  const sinPlan = filas.filter((f) => f.semanas.length === 0 && f.libro.status !== "Terminado");
  if (sinPlan.length) grupos.push({ titulo: "Sin programar", filas: sinPlan });

  return grupos;
}
