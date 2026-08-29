import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listWorkspaces, ROLES_QUE_CREAN, type WorkspaceSummary } from "@/lib/data/workspaces";
import WorkspaceSwitcher from "@/components/workspace/WorkspaceSwitcher";
import WorkspaceTabs from "@/components/workspace/WorkspaceTabs";
import TeamSection from "@/components/workspace/TeamSection";
import { noteDisplayTitle, noteExcerpt } from "@/lib/domain/notes/markup.ts";
import NotebookGrid, { type NotebookCard } from "./NotebookGrid";
import NoteList, { type NoteCard } from "./NoteList";
import NoteEditor from "./NoteEditor";
import NotesSearch from "./NotesSearch";

// NOTEBOOKS — el sitio donde el equipo ESCRIBE.
//
// Cuelgan del ESPACIO DE TRABAJO, no de un proyecto (migración 0032). Esa es la
// diferencia con `knowledge_items` y `logbook`, que existen desde 0003 pero son
// privados de un usuario: aquí lo que se escribe lo ve y lo edita el equipo.
//
// Tres pantallas en una sola ruta, escalonadas por la URL:
//   /notebooks?ws=…                    la estantería de cuadernos
//   /notebooks?ws=…&notebook=…         las notas de un cuaderno
//   /notebooks?ws=…&notebook=…&note=…  el editor
//
// El editor es una PANTALLA y no un panel lateral, y eso es una decisión de
// móvil: el drawer del tablero ocupa el 92dvh, y con el teclado del iPhone
// abierto quedan poco más de 200px para escribir. Con URL propia se aprovecha
// la pantalla entera y el gesto de volver del sistema hace lo que se espera.
export default async function NotebooksPage({
  searchParams
}: {
  searchParams: Promise<{ ws?: string; notebook?: string; note?: string }>;
}) {
  const { ws: requestedWorkspaceId, notebook: notebookId, note: noteId } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const workspaces = await listWorkspaces();
  const activeFromParam = workspaces.find((w) => w.id === requestedWorkspaceId);

  // Sin ?ws= válido se cae al espacio personal, igual que en /execution: desde
  // la migración 0030 siempre hay uno.
  const activeWorkspace: WorkspaceSummary | undefined =
    activeFromParam ?? workspaces.find((w) => w.isPersonal) ?? workspaces[0];

  if (!activeWorkspace) {
    return (
      <main className="nb-main">
        <div className="card">No encontramos ningún espacio de trabajo para tu cuenta.</div>
      </main>
    );
  }

  const canWrite = ROLES_QUE_CREAN.includes(activeWorkspace.role);

  const { data: notebookRows } = await supabase
    .from("notebooks")
    .select("id, title, icon, color, created_by_name, updated_at")
    .eq("workspace_id", activeWorkspace.id)
    .order("position")
    .order("created_at");

  const notebooks = notebookRows ?? [];
  const openNotebook = notebookId ? notebooks.find((n) => n.id === notebookId) : undefined;

  // Las notas se traen SOLO del cuaderno abierto. Traerlas todas para contar
  // dejaría el cuerpo completo de cada nota del espacio viajando en cada carga
  // de la estantería, que es justo lo que no se quiere en una conexión móvil.
  const { data: counts } = await supabase
    .from("notes")
    .select("notebook_id")
    .in("notebook_id", notebooks.map((n) => n.id).length ? notebooks.map((n) => n.id) : ["00000000-0000-0000-0000-000000000000"]);

  const countByNotebook = new Map<string, number>();
  for (const row of counts ?? []) {
    countByNotebook.set(row.notebook_id, (countByNotebook.get(row.notebook_id) ?? 0) + 1);
  }

  const cards: NotebookCard[] = notebooks.map((n) => ({
    id: n.id,
    title: n.title,
    icon: n.icon,
    noteCount: countByNotebook.get(n.id) ?? 0,
    createdByName: n.created_by_name,
    updatedAt: n.updated_at
  }));

  const header = (
    <div className="nb-bar">
      <WorkspaceSwitcher workspaces={workspaces} activeId={activeWorkspace.id} basePath="/notebooks" />
      <WorkspaceTabs workspaceId={activeWorkspace.id} />
      <span className="nb-bar-spacer" />
      <NotesSearch workspaceId={activeWorkspace.id} />
      {!activeWorkspace.isPersonal && (
        <TeamSection workspace={activeWorkspace} userId={user.id} projectCount={0} />
      )}
    </div>
  );

  // ---------------------------------------------------------------------------
  // Editor de una nota
  // ---------------------------------------------------------------------------
  if (openNotebook && noteId) {
    const { data: note } = await supabase
      .from("notes")
      .select("id, title, body, version, created_by_name, created_at, updated_by_name, updated_at")
      .eq("id", noteId)
      .maybeSingle();

    if (!note) {
      return (
        <main className="nb-main">
          {header}
          <div className="card">
            Esa nota ya no existe.{" "}
            <Link href={`/notebooks?ws=${activeWorkspace.id}&notebook=${openNotebook.id}`}>Volver al cuaderno</Link>
          </div>
        </main>
      );
    }

    return (
      <main className="nb-main">
        {header}
        <NoteEditor
          note={{
            id: note.id,
            title: note.title,
            body: note.body,
            version: note.version,
            createdByName: note.created_by_name,
            createdAt: note.created_at,
            updatedByName: note.updated_by_name,
            updatedAt: note.updated_at
          }}
          backHref={`/notebooks?ws=${activeWorkspace.id}&notebook=${openNotebook.id}`}
          notebookTitle={openNotebook.title}
          canWrite={canWrite}
        />
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Notas de un cuaderno
  // ---------------------------------------------------------------------------
  if (openNotebook) {
    const { data: noteRows } = await supabase
      .from("notes")
      .select("id, title, body, updated_at, updated_by_name")
      .eq("notebook_id", openNotebook.id)
      .order("updated_at", { ascending: false });

    const notes: NoteCard[] = (noteRows ?? []).map((n) => ({
      id: n.id,
      title: noteDisplayTitle(n.title, n.body),
      excerpt: noteExcerpt(n.body),
      updatedAt: n.updated_at,
      updatedByName: n.updated_by_name
    }));

    return (
      <main className="nb-main">
        {header}
        <NoteList
          notes={notes}
          notebook={{ id: openNotebook.id, title: openNotebook.title, icon: openNotebook.icon }}
          workspaceId={activeWorkspace.id}
          canWrite={canWrite}
        />
      </main>
    );
  }

  // ---------------------------------------------------------------------------
  // Estantería del espacio
  // ---------------------------------------------------------------------------
  return (
    <main className="nb-main">
      {header}
      <NotebookGrid
        notebooks={cards}
        workspaceId={activeWorkspace.id}
        workspaceName={activeWorkspace.name}
        isPersonal={activeWorkspace.isPersonal}
        canWrite={canWrite}
      />
    </main>
  );
}
