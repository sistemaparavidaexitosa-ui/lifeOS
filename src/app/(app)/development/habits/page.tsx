import { redirect } from "next/navigation";

/**
 * Desde 0045 no hay hábitos sueltos que listar: cada uno vive dentro de su
 * rutina, y se ve y se marca allí.
 *
 * La ruta no se borra porque hay enlaces vivos apuntando aquí —el panel del
 * módulo, Metas Personales, y lo que el usuario tenga guardado— y un 404 no
 * explica nada.
 */
export default function HabitsPage() {
  redirect("/development/routines");
}
