// La vista se dividió en /development/habits y /development/library al crear el
// Personal Development OS. La ruta vieja se conserva —no se elimina— porque
// puede estar guardada en marcadores del usuario.
import { redirect } from "next/navigation";

export default function HabitsRedirect() {
  redirect("/development/habits");
}
