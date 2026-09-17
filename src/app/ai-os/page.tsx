import { redirect } from "next/navigation";

/**
 * /ai-os — LABORATORIO UX. No es un módulo de la aplicación.
 *
 * Es el prototipo experimental de la dirección "LifeOS AI Operating System":
 * una IA activa que entiende la vida entera y ayuda a ejecutarla. Vive con
 * datos simulados y NO toca dominio, Supabase, auth ni ningún módulo actual.
 *
 * POR QUÉ REDIRIGE A UN ARCHIVO ESTÁTICO Y NO ES UN ÁRBOL DE REACT
 *   1. Aislamiento real. Un prototipo que importa `AppShell`, `globals.css` o
 *      cualquier componente de `src/components` deja de ser un experimento: se
 *      vuelve algo que se puede romper al tocar la aplicación de verdad, y al
 *      revés. `public/ai-os.html` no comparte NADA con el resto del repo.
 *   2. Coste de iteración. La dirección visual se descarta o se adopta entera;
 *      mientras se decide, editar un archivo y recargar (sin build, sin
 *      `pnpm dev`, sin variables de entorno) es el ciclo más corto posible.
 *      El archivo se abre incluso con doble clic desde el escritorio.
 *   3. Si la dirección se adopta, los bloques marcados `COMPONENTE: X` dentro
 *      del HTML son el mapa 1:1 de los componentes React a crear
 *      (AICommandCenter, MorningBriefing, KnowledgeGraph, GraphNode,
 *      ContextPanel, AIInsightCard, SmartCommandInput, DailyTimeline,
 *      MemoryPanel), y el grafo se apoyaría en `src/lib/domain/graph/**`, que
 *      ya existe y está probado.
 *
 * La excepción que lo hace visible sin sesión (y sin la CSP con nonce, que
 * bloquearía sus scripts inline) está declarada y acotada en `src/middleware.ts`.
 */
export default function AiOsLabPage() {
  redirect("/ai-os.html");
}
