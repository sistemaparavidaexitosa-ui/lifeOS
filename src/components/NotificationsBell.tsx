import { loadUnreadNotifications } from "@/lib/data/notifications";
import NotificationsMenu from "./NotificationsMenu";

/**
 * Carga de la bandeja, separada de su interfaz.
 *
 * Es un Server Component propio y va tras un límite de Suspense en el layout:
 * su consulta corre en TODAS las pantallas, y no puede retrasar el pintado de
 * ninguna. Mismo criterio que TeamSection en la cartera de proyectos.
 *
 * Se llamaba `MentionsBell` hasta que la bandeja dejó de ser solo de menciones
 * (0049): ahora enseña también asignaciones, recordatorios y vencimientos, y
 * un nombre que promete menos de lo que hace envejece mal.
 */
export default async function NotificationsBell() {
  const notifications = await loadUnreadNotifications();
  return <NotificationsMenu notifications={notifications} />;
}
