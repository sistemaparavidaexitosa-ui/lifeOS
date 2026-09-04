import { notFound } from "next/navigation";
import Link from "next/link";
import { getAdminTemplate } from "@/lib/data/templates";
import { TEMPLATE_KINDS, TEMPLATE_KIND_LABEL, type TemplateKind } from "@/lib/domain/templates/schema.ts";
import { GROUP_COLORS, type ProjectTemplate } from "@/lib/domain/execution/project-templates.ts";
import type { HabitTemplate, RoutineTemplate } from "@/lib/domain/development/templates.ts";
import TemplateEditor, { type Payload } from "../../TemplateEditor";

// El editor de una plantilla, o de una que todavía no existe.
//
// `/admin/[kind]/nueva` es la ruta de crear. Se resuelve con un slug reservado
// en vez de con una ruta aparte porque el formulario es EL MISMO: separar las
// dos daría dos pantallas que hay que mantener iguales a mano.

const NUEVA = "nueva";

function esKind(v: string): v is TemplateKind {
  return (TEMPLATE_KINDS as readonly string[]).includes(v);
}

/**
 * Una plantilla vacía del tipo que toca.
 *
 * Nace con un grupo y una tarea (o un paso) en vez de con las listas vacías: el
 * esquema exige al menos uno de cada, y una pantalla que empieza vacía y solo
 * dice que falta algo al guardar hace trabajar al revés.
 */
function enBlanco(kind: TemplateKind): Payload {
  if (kind === "project") {
    const t: ProjectTemplate = {
      id: "",
      name: "",
      category: "Personal",
      summary: "",
      groups: [{ name: "", color: GROUP_COLORS[0], tasks: [{ title: "" }] }]
    };
    return t;
  }
  if (kind === "routine") {
    const t: RoutineTemplate = {
      id: "",
      name: "",
      source: "",
      summary: "",
      frequency: "Diario",
      steps: [{ title: "", durationMin: 10, detail: "" }]
    };
    return t;
  }
  const t: HabitTemplate = {
    id: "",
    name: "",
    category: "Salud",
    cue: "Después de ",
    twoMinVersion: "",
    why: ""
  };
  return t;
}

export default async function AdminTemplatePage({ params }: { params: Promise<{ kind: string; slug: string }> }) {
  const { kind, slug } = await params;
  if (!esKind(kind)) notFound();

  const fila = slug === NUEVA ? null : await getAdminTemplate(kind, slug);
  // Un slug que no existe no es una plantilla nueva por accidente: sería fácil
  // crear basura escribiendo cualquier cosa en la barra de direcciones.
  if (slug !== NUEVA && !fila) notFound();

  return (
    <>
      <div className="text-xs">
        <Link href={`/admin/${kind}`}>← {TEMPLATE_KIND_LABEL[kind]}</Link>
      </div>
      <TemplateEditor
        kind={kind}
        slug={fila?.slug ?? null}
        status={fila?.status ?? null}
        inicial={fila?.template ?? enBlanco(kind)}
      />
    </>
  );
}
