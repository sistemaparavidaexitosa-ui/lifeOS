import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// Espacios de trabajo del usuario.
//
// Desde las migraciones 0030/0031 el workspace es el contenedor obligatorio de
// los proyectos, así que esta lista la necesitan varias pantallas a la vez: la
// cartera de /execution (para el selector y para filtrar), el formulario de
// nuevo proyecto, el menú de "mover a otro espacio" y las vistas de Personal
// Development que solo pueden mirar proyectos personales (BR-012).
//
// Va envuelta en React `cache()` por el mismo motivo que getUserTimeZone: en
// un solo request la piden la página y sus componentes hijos, y no tiene
// sentido consultar cinco veces la misma tabla.

export interface WorkspaceSummary {
  id: string;
  name: string;
  color: string;
  isPersonal: boolean;
  /** Rol del usuario en ese espacio. 'Owner' también si es el dueño de la fila. */
  role: WorkspaceRole;
}

export type WorkspaceRole = "Owner" | "Admin" | "Member" | "Guest" | "Viewer";

/** Roles que pueden crear proyectos dentro del espacio (espeja projects_insert_own, 0031). */
export const ROLES_QUE_CREAN: readonly WorkspaceRole[] = ["Owner", "Admin", "Member"];

/** Roles que administran el equipo: invitar, expulsar, borrar el espacio. */
export const ROLES_QUE_ADMINISTRAN: readonly WorkspaceRole[] = ["Owner", "Admin"];

function isRole(value: string | null | undefined): value is WorkspaceRole {
  return value === "Owner" || value === "Admin" || value === "Member" || value === "Guest" || value === "Viewer";
}

/**
 * Todos los espacios donde el usuario puede entrar, con su rol. El personal va
 * primero y el resto por nombre: el selector siempre abre en el mismo orden.
 *
 * El rol sale de `memberships`, cuya política SELECT solo expone la fila
 * propia del usuario (fix 0012) — que es justo lo que hace falta aquí y evita
 * el RPC list_workspace_members, reservado para el roster completo.
 */
export const listWorkspaces = cache(async (): Promise<WorkspaceSummary[]> => {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return [];

  const [{ data: workspaces }, { data: memberships }] = await Promise.all([
    supabase.from("workspaces").select("id, name, color, is_personal, owner_id"),
    supabase.from("memberships").select("workspace_id, role, status")
  ]);

  const roleByWorkspace = new Map<string, string>();
  for (const m of memberships ?? []) {
    if (m.status === "Active") roleByWorkspace.set(m.workspace_id, m.role);
  }

  const summaries: WorkspaceSummary[] = (workspaces ?? []).map((w) => {
    const role = w.owner_id === user.id ? "Owner" : roleByWorkspace.get(w.id);
    return {
      id: w.id,
      name: w.name,
      color: w.color,
      isPersonal: Boolean(w.is_personal),
      role: isRole(role) ? role : "Viewer"
    };
  });

  return summaries.sort((a, b) => {
    if (a.isPersonal !== b.isPersonal) return a.isPersonal ? -1 : 1;
    return a.name.localeCompare(b.name, "es");
  });
});

/**
 * El espacio personal del usuario, creado por el trigger de alta (0030).
 *
 * Devuelve null solo si el trigger no llegó a correr para esa cuenta (un
 * usuario creado a mano en la base, por ejemplo). Quien lo llama debe decidir
 * qué hacer con esa ausencia en vez de asumirla imposible.
 */
export const getPersonalWorkspace = cache(async (): Promise<WorkspaceSummary | null> => {
  const workspaces = await listWorkspaces();
  return workspaces.find((w) => w.isPersonal) ?? null;
});

/**
 * Ids de los espacios personales visibles para el usuario (en la práctica,
 * uno). Es la definición operativa de PROYECTO PERSONAL desde 0030: sustituye
 * al viejo `projects.workspace_id is null` que usaban Personal Development y
 * la validación BR-012 de los resultados clave.
 */
export const getPersonalWorkspaceIds = cache(async (): Promise<string[]> => {
  const workspaces = await listWorkspaces();
  return workspaces.filter((w) => w.isPersonal).map((w) => w.id);
});
