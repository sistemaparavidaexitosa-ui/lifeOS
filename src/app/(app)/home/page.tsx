import Link from "next/link";
import { redirect } from "next/navigation";
import { getHomeData } from "@/lib/data/home";
import { loadHoy } from "@/lib/data/hoy";
import { Card } from "@/components/ui";
import { fdate } from "@/lib/format";
import { greetingFor, hourInTimeZone } from "@/lib/domain/datetime.ts";
import { getSessionUser } from "@/lib/data/session";
import { BookCover } from "../development/library/BookForm";
import RemindersCard from "./RemindersCard";

// HOME = HOY (rediseño). Cuatro preguntas, en este orden, y nada más:
// ¿qué importa hoy?, ¿me cabe el día?, ¿qué rutina me toca?, ¿qué vence?
// Sin dinero ni KPIs repetidos: cada sección tiene su pantalla, y el Centro
// está a un toque en la barra. Lo que no aplica hoy no se pinta.
const h = (m: number) => {
  const x = Math.round((m / 60) * 10) / 10;
  return `${Number.isInteger(x) ? x : x.toFixed(1)} h`;
};

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const data = await getHomeData(user.id);
  const hoy = await loadHoy(user.id, data.todayISO);
  const greet = greetingFor(hourInTimeZone(data.profile.timezone));
  const unaCosa = data.dailyPlan?.one_thing || null;
  const c = hoy.carga;
  const tono = c.estado === "saturado" ? "var(--danger)" : c.estado === "lleno" ? "var(--warn)" : "var(--ok)";

  return (
    <div className="flex flex-col gap-4 max-w-[720px] w-full mx-auto">
      <header className="pt-1">
        <div className="text-sm capitalize" style={{ color: "var(--muted)" }}>
          {new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone: data.profile.timezone }).format(new Date())}
        </div>
        <h2 className="text-[28px] font-semibold leading-tight" style={{ letterSpacing: "-0.03em" }}>
          {greet}, {data.profile.name.split(" ")[0]}
        </h2>
      </header>

      <Card hero>
        <div className="text-xs uppercase font-semibold" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
          Tu una cosa
        </div>
        {unaCosa ? (
          <p className="text-xl font-semibold mt-1.5 leading-snug" style={{ letterSpacing: "-0.02em" }}>
            {unaCosa}
          </p>
        ) : (
          <p className="text-base mt-1.5" style={{ color: "var(--muted)" }}>
            Aún no eliges lo que haría que hoy valga la pena.
          </p>
        )}
        <Link href="/time" className={unaCosa ? "btn-ghost btn-sm mt-3" : "btn-primary btn-sm mt-3"}>
          {unaCosa ? "Ajustar el plan" : "Elegir mi una cosa"}
        </Link>
      </Card>

      <Link href="/time" className="card block" style={{ color: "inherit", textDecoration: "none" }}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="font-semibold">Tu día</span>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {h(c.total)} de {h(c.capMin)}
          </span>
        </div>
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
          <div className="h-full rounded-full origin-left" style={{ width: `${Math.min(100, c.pct)}%`, background: tono }} />
        </div>
        <p className="text-sm mt-3" style={{ color: "var(--muted)" }}>
          {c.consejo}
        </p>
      </Link>

      {hoy.rutinas.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <span className="font-semibold">Rutinas de hoy</span>
            <Link href="/development/routines" className="text-sm" style={{ color: "var(--muted)" }}>
              Abrir
            </Link>
          </div>
          {hoy.rutinas.map((r) => (
            <Link key={r.id} href="/development/routines" className="flex items-center gap-3 py-2.5" style={{ color: "inherit", textDecoration: "none", borderTop: "1px solid var(--line)" }}>
              <Anillo pct={r.pct} />
              <span className="grow min-w-0 truncate">{r.nombre}</span>
              <span className="text-sm tabular-nums" style={{ color: r.hechos === r.total ? "var(--ok)" : "var(--muted)" }}>
                {r.hechos === r.total ? "Hecha" : `${r.hechos}/${r.total}`}
              </span>
            </Link>
          ))}
        </Card>
      )}

      {hoy.vencen.length > 0 && (
        <Card>
          <div className="flex items-baseline justify-between mb-1">
            <span className="font-semibold">Vence hoy</span>
            <Link href="/execution" className="text-sm" style={{ color: "var(--muted)" }}>
              Ver tareas
            </Link>
          </div>
          {hoy.vencen.map((t) => (
            <Link
              key={t.id}
              href={t.projectId ? `/execution?project=${t.projectId}&task=${t.id}` : "/execution"}
              className="flex items-center gap-3 py-2.5"
              style={{ color: "inherit", textDecoration: "none", borderTop: "1px solid var(--line)" }}
            >
              <span aria-hidden="true" className="flex-none rounded-full" style={{ width: 8, height: 8, background: t.vencida ? "var(--danger)" : "var(--warn)" }} />
              <span className="grow min-w-0">
                <span className="block truncate">{t.titulo}</span>
                {t.proyecto && (
                  <span className="block text-xs truncate" style={{ color: "var(--muted)" }}>
                    {t.proyecto}
                  </span>
                )}
              </span>
              <span className="text-xs flex-none" style={{ color: t.vencida ? "var(--danger)" : "var(--muted)" }}>
                {t.vencida ? `Venció ${fdate(t.due)}` : "Hoy"}
              </span>
            </Link>
          ))}
        </Card>
      )}

      {data.reminders.length > 0 && (
        <Card>
          <div className="font-semibold mb-2">Te pediste recordar</div>
          <RemindersCard reminders={data.reminders} todayISO={data.todayISO} />
        </Card>
      )}

      {data.readingFocus && (
        <Link href="/development/library" className="card flex items-center gap-3" style={{ color: "inherit", textDecoration: "none" }}>
          <BookCover url={data.readingFocus.book.coverUrl} />
          <span className="grow min-w-0">
            <span className="text-xs block" style={{ color: "var(--muted)" }}>
              Leyendo
            </span>
            <b className="block truncate">{data.readingFocus.book.title}</b>
            <span className="mt-2 block h-1 rounded-full overflow-hidden" style={{ background: "var(--surface2)" }}>
              <span className="block h-full rounded-full" style={{ width: `${data.readingFocus.pct}%`, background: "var(--text)" }} />
            </span>
          </span>
          <span className="text-sm tabular-nums flex-none" style={{ color: "var(--muted)" }}>
            {data.readingFocus.pct}%
          </span>
        </Link>
      )}
    </div>
  );
}

/** Un anillo de avance, en SVG: menos ruido que una barra por fila. */
function Anillo({ pct }: { pct: number }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className="flex-none -rotate-90">
      <circle cx="12" cy="12" r={r} fill="none" stroke="var(--surface3)" strokeWidth="3" />
      <circle cx="12" cy="12" r={r} fill="none" stroke={pct >= 100 ? "var(--ok)" : "var(--text)"} strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, pct) / 100)} />
    </svg>
  );
}
