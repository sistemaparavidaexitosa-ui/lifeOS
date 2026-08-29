import Link from "next/link";
import { redirect } from "next/navigation";
import { getHomeData } from "@/lib/data/home";
import { Card, Chip, Stat, Progress, EmptyState } from "@/components/ui";
import { money0, fdate } from "@/lib/format";
import { greetingFor, hourInTimeZone, todayInTimeZone } from "@/lib/domain/datetime.ts";
import { getSessionUser } from "@/lib/data/session";
import InsightSection from "@/components/InsightSection";

export default async function HomePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  // NO-MOCK (F8): si esto falla (BD desconectada), la página muestra el error
  // de Next.js — NUNCA datos de relleno.
  const data = await getHomeData(user.id);
  // El saludo y la fecha de corte usan la zona del PERFIL, no la del servidor
  // (en Vercel el proceso corre en UTC: a la 1 pm en México decía "Buenas
  // noches"). Ver src/lib/domain/datetime.ts.
  const timeZone = data.profile.timezone;
  const today = todayInTimeZone(timeZone);
  const greet = greetingFor(hourInTimeZone(timeZone));
  const sat = data.saturation;
  const satKind = sat.status === "saturated" ? "bad" : sat.status === "warn" ? "warn" : "ok";

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {fdate(today)} · {timeZone}
          </div>
          <h2 className="text-2xl font-black" style={{ letterSpacing: "-0.03em" }}>
            {greet}, {data.profile.name.split(" ")[0]}
          </h2>
        </div>
        <Link href="/planning" className="btn-primary">
          {data.dailyPlan ? "Editar día" : "Planear mi día"}
        </Link>
      </div>

      <div className="grid md:grid-cols-2 gap-3.5">
        <Card>
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase" style={{ color: "var(--muted)", letterSpacing: "0.08em" }}>
              Tu Única Cosa
            </span>
            <Chip kind={data.dailyPlan?.approved ? "ok" : "warn"}>{data.dailyPlan?.approved ? "Plan aprobado" : "Sin aprobar"}</Chip>
          </div>
          <h2 className="my-2 text-lg font-bold">
            {data.dailyPlan?.one_thing || data.impactTasks[0]?.title || "Aún no defines tu Única Cosa"}
          </h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            The ONE Thing · lo más importante desbloquea lo demás.
          </p>
          <div className="flex gap-2 mt-1.5">
            <Link href="/planning" className="btn-ghost btn-sm">
              Definir plan diario
            </Link>
            <Link href="/execution" className="btn-ghost btn-sm">
              Ver tareas
            </Link>
          </div>
        </Card>

        <Card hero>
          <div className="text-xs" style={{ opacity: 0.85 }}>
            Dinero disponible (periodo) · corte {fdate(today)}
          </div>
          <div className="text-3xl font-black" style={{ letterSpacing: "-0.03em" }}>
            {money0(data.periodStats.available, data.profile.currency, data.profile.locale)}
          </div>
          <div className="flex justify-between mt-1 text-sm">
            <span>Liquidez total</span>
            <b>{money0(data.liquidity, data.profile.currency, data.profile.locale)}</b>
          </div>
          <div className="flex justify-between text-sm">
            <span>Presupuesto restante</span>
            <b>{money0(data.budgetRemaining, data.profile.currency, data.profile.locale)}</b>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <Stat label="Tareas abiertas" value={data.openCount} />
        <Stat label="Vencidas" value={data.overdueCount} kind={data.overdueCount ? "warn" : undefined} />
        <Stat label="Compromiso del día" value={`${sat.pct}%`} kind={sat.status === "saturated" ? "bad" : sat.status === "warn" ? "warn" : undefined} />
        <Stat label="Disponible hoy" value={`${Math.round((sat.availableMinutes / 60) * 10) / 10} h`} />
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Tu tiempo hoy</h3>
          <Chip kind={satKind}>{sat.status === "saturated" ? "Saturado" : sat.status === "warn" ? "Llenándose" : "En balance"}</Chip>
        </div>
        <div className="my-2">
          <Progress pct={sat.pct} kind={sat.status === "saturated" ? "bad" : sat.status === "warn" ? "warn" : undefined} />
        </div>
        <div className="flex justify-between text-xs" style={{ color: "var(--muted)" }}>
          <span>{Math.round((sat.totalCommitted / 60) * 10) / 10} h comprometidas</span>
          <span>
            {Math.round((sat.availableMinutes / 60) * 10) / 10} h disponibles de {Math.round((sat.capMinutes / 60) * 10) / 10} h
          </span>
        </div>
        <Link href="/time" className="btn-ghost btn-sm mt-2 inline-block">
          Ver Autogestión del Tiempo
        </Link>
      </Card>

      {data.currentBook && (
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Hoy estás leyendo</h3>
            <Chip kind="purple">
              {data.currentBook.total_pages ? Math.round((data.currentBook.current_page / data.currentBook.total_pages) * 100) : 0}%
            </Chip>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <div
              className="w-11 h-15 rounded-lg grid place-items-center text-white font-black"
              style={{ background: "linear-gradient(145deg, var(--accent2), var(--accent))" }}
            >
              📖
            </div>
            <div>
              <b>{data.currentBook.title}</b>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {data.currentBook.author} · página {data.currentBook.current_page} de {data.currentBook.total_pages}
              </div>
            </div>
          </div>
          <Link href="/development/library" className="btn-ghost btn-sm mt-2 inline-block">
            Ir a la Biblioteca
          </Link>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-bold">Tres tareas de impacto</h3>
          <Chip>Hoy</Chip>
        </div>
        {data.impactTasks.length === 0 ? (
          <EmptyState icon="◎" text="Marca hasta 3 tareas como de impacto en Ejecución." />
        ) : (
          data.impactTasks.map((t) => (
            <div key={t.id} className="list-item flex items-center gap-3 py-2.5" style={{ borderBottom: "1px solid var(--line)" }}>
              <div className="grow min-w-0">
                <b className="block truncate">{t.title}</b>
                <div className="text-xs" style={{ color: "var(--muted)" }}>
                  {t.est ?? 0} min{t.due ? ` · vence ${fdate(t.due)}` : ""}
                </div>
              </div>
              <span className={`badge-state s-${t.status}`}>{t.status}</span>
              <Link href={`/execution?task=${t.id}`} className="btn-ghost btn-sm">
                Abrir
              </Link>
            </div>
          ))
        )}
      </Card>

      {/* El ámbito `global` es el único que cruza los cinco dominios, y Home es
          la única pantalla que no es de ninguno en particular. Es donde una
          recomendación puede decir algo que ninguna otra puede: que la agenda
          está llena justo la semana en que vence la tarjeta cara. */}
      <InsightSection scope="global" />
    </div>
  );
}
