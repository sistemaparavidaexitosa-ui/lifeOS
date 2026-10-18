import { redirect } from "next/navigation";

// Rediseño: la planeación vive dentro de /time («Tiempo y planeación»). La
// ruta se queda para los enlaces viejos y sus acciones (`./actions.ts`) siguen
// aquí, que es donde las importan los paneles.
export default function PlanningPage() {
  redirect("/time");
}
