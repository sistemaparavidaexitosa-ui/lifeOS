import { loadUnreadMentions } from "@/lib/data/mentions";
import MentionsMenu from "./MentionsMenu";

/**
 * Carga de la bandeja, separada de su interfaz.
 *
 * Es un Server Component propio y va tras un límite de Suspense en el layout:
 * su consulta corre en TODAS las pantallas, y no puede retrasar el pintado de
 * ninguna. Mismo criterio que TeamSection en la cartera de proyectos.
 */
export default async function MentionsBell() {
  const mentions = await loadUnreadMentions();
  return <MentionsMenu mentions={mentions} />;
}
