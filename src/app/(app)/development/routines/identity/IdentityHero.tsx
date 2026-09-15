import Link from "next/link";
import { Card } from "@/components/ui";
import type { IdentityOverview } from "@/lib/data/identity";
import IdentityProfileSheet from "./IdentityProfileSheet";
import TraitSheet from "./TraitManager";

/**
 * Lo primero de Hoy: quién quieres ser. Si aún no lo has dicho, la tarjeta
 * invita a decirlo; sin eso, el Identity Score solo puede medirte por hábitos.
 */
export default function IdentityHero({ overview }: { overview: IdentityOverview }) {
  const { profile, traits } = overview;

  if (!profile) {
    return (
      <Card hero>
        <div className="flex flex-col gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
            Tu identidad
          </span>
          <h2 className="text-lg font-bold leading-snug">¿En quién te estás convirtiendo?</h2>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Los hábitos no se sostienen por la meta: se sostienen por quién crees que eres. Escríbelo, elige tus rasgos y
            cada hábito empezará a contar como un voto por esa persona.
          </p>
          <div>
            <IdentityProfileSheet profile={null} sugerencias={overview.routineIdentities} label="Definir mi identidad" />
          </div>
        </div>
      </Card>
    );
  }

  const activos = traits.filter((t) => t.active);
  return (
    <Card hero>
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2">
          <div className="grow min-w-0 flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>
              Tu identidad
            </span>
            <h2 className="text-lg font-bold leading-snug" style={{ overflowWrap: "anywhere" }}>
              {profile.desiredIdentity}
            </h2>
          </div>
          <IdentityProfileSheet profile={profile} label="Editar" />
        </div>

        {profile.coreValues.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Valores">
            {profile.coreValues.map((v) => (
              <span key={v} className="chip">
                {v}
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <b className="text-sm">Rasgos</b>
            <TraitSheet label="+ Rasgo" />
          </div>
          {activos.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Añade dos o tres rasgos («Disciplinado», «Libre financieramente») y vincula tus hábitos a ellos desde
              «Editar» en cada hábito.
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {traits.map((t) => {
                const votos = Object.values(overview.votesByHabit).filter((ids) => ids.includes(t.id)).length;
                return (
                  <li key={t.id} className="flex items-center gap-2" style={{ opacity: t.active ? 1 : 0.55 }}>
                    <div className="grow min-w-0">
                      <span className="text-sm font-semibold">{t.name}</span>
                      <span className="text-xs ml-1.5" style={{ color: "var(--muted)" }}>
                        {t.area} · {votos} {votos === 1 ? "hábito" : "hábitos"}
                        {!t.active && " · inactivo"}
                      </span>
                      {t.statement && (
                        <span className="block text-xs" style={{ color: "var(--muted)", overflowWrap: "anywhere" }}>
                          {t.statement}
                        </span>
                      )}
                    </div>
                    <TraitSheet trait={t} label="Editar" />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <Link href="/development/routines/analytics" className="text-xs font-semibold" style={{ color: "var(--accent-d)" }}>
          Ver tu evolución →
        </Link>
      </div>
    </Card>
  );
}
