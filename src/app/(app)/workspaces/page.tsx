// La pantalla de "Equipos y Colaboración" desapareció.
//
// Los espacios de trabajo dejaron de ser un módulo aparte del menú lateral:
// desde las migraciones 0030/0031 son el CONTENEDOR de los proyectos (todo
// proyecto vive en uno) y ser miembro de un espacio ya da acceso a sus
// proyectos. Administrarlos desde otra pantalla obligaba a saltar de ida y
// vuelta para algo que se decide mirando los proyectos.
//
// Esta ruta sobrevive solo como redirección: los correos de invitación ya
// enviados y cualquier enlace guardado apuntan aquí, y no pueden terminar en
// un 404.
import { redirect } from "next/navigation";

export default async function WorkspacesPage({ searchParams }: { searchParams: Promise<{ ws?: string }> }) {
  const { ws } = await searchParams;
  redirect(ws ? `/execution?ws=${ws}` : "/execution");
}
