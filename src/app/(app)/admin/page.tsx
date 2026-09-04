import Link from "next/link";
import { Card, Chip } from "@/components/ui";
import { listAdminTemplates } from "@/lib/data/templates";
import { TEMPLATE_KINDS, TEMPLATE_KIND_LABEL } from "@/lib/domain/templates/schema.ts";

// El índice del panel: los tres tipos y en qué estado está cada catálogo.
//
// Los conteos van aquí y no solo dentro de cada lista porque la pregunta que
// se hace uno al entrar es «¿me quedó algo a medias?», y un borrador olvidado
// es invisible para todo el mundo menos para esta pantalla.

export const metadata = { title: "Administración · Life OS" };

export default async function AdminPage() {
  const catalogos = await Promise.all(
    TEMPLATE_KINDS.map(async (kind) => {
      const filas = await listAdminTemplates(kind);
      return {
        kind,
        publicadas: filas.filter((f) => f.status === "published").length,
        borradores: filas.filter((f) => f.status === "draft").length
      };
    })
  );

  const borradores = catalogos.reduce((n, c) => n + c.borradores, 0);

  return (
    <>
      <Card hero>
        <h2 className="font-bold mb-1">Catálogo de plantillas</h2>
        <p className="text-xs" style={{ color: "var(--muted)" }}>
          Lo que se edita aquí lo ven <b>todos los usuarios</b>. Una plantilla publicada aparece en el selector de su
          sección; un borrador solo se ve desde este panel. Al usar una plantilla se <b>copia</b>: editarla después no le
          cambia nada a quien ya la haya aplicado.
        </p>
        {borradores > 0 && (
          <p className="text-xs" style={{ marginTop: 6 }}>
            Tienes {borradores} plantilla{borradores === 1 ? "" : "s"} sin publicar.
          </p>
        )}
      </Card>

      <div className="grid gap-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {catalogos.map((c) => (
          <Link key={c.kind} href={`/admin/${c.kind}`} style={{ textDecoration: "none" }}>
            <Card>
              <h3 className="font-bold mb-1">{TEMPLATE_KIND_LABEL[c.kind]}</h3>
              <div className="flex gap-1.5" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Chip kind="ok">{c.publicadas} publicadas</Chip>
                {c.borradores > 0 && <Chip kind="warn">{c.borradores} en borrador</Chip>}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
