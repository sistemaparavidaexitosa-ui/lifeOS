// Navegación — espejo de NAV[] en LifeOS 4.html. Ver /docs/UX_MAP.md para el
// mapeo completo vista HTML -> ruta -> componente -> fuente de datos -> acción.
//
// Actualización (rediseño Monday-style): cada item ahora declara `icon`
// (clave de NAV_ICONS en src/components/icons.tsx) para la sidebar con
// íconos, y `color` (token de acento por sección) para dar contexto visual
// rápido — igual que los grupos de colores de Monday.com.
import type { NavIconKey } from "./icons";

export interface NavItem {
  href: string;
  label: string;
  group: string;
  icon: NavIconKey;
  color: string; // variable CSS de acento, ver globals.css
  /**
   * Fuera del menú lateral, pero presente en esta lista.
   *
   * /notebooks y /activity se alcanzan desde el conmutador del espacio
   * (WorkspaceTabs), no desde el menú: los cuadernos y lo que ha pasado viven
   * DENTRO del espacio de trabajo, igual que los proyectos. /intelligence y /intelligence/memory, desde el panel de
   * /money y desde Configuración, por la razón que se explica más abajo.
   *
   * En los dos casos la entrada tiene que figurar aquí igualmente, porque de
   * esta lista sale el título de la barra superior (AppShell) y sin ella la
   * pantalla se titularía "Life OS".
   */
  hidden?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", group: "Panel", icon: "home", color: "var(--accent)" },
  { href: "/reports", label: "Reportes", group: "Panel", icon: "reports", color: "var(--accent)" },
  { href: "/execution", label: "Proyectos y Tareas", group: "Execution OS", icon: "board", color: "var(--c-purple)" },
  { href: "/execution/eisenhower", label: "Matriz de Eisenhower", group: "Execution OS", icon: "eisenhower", color: "var(--c-purple)" },
  { href: "/planning", label: "Planeación", group: "Execution OS", icon: "planning", color: "var(--c-purple)" },
  { href: "/time", label: "Autogestión del Tiempo", group: "Execution OS", icon: "time", color: "var(--c-purple)" },
  { href: "/notebooks", label: "Notebooks", group: "Execution OS", icon: "workspaces", color: "var(--c-purple)", hidden: true },
  { href: "/activity", label: "Actividad", group: "Execution OS", icon: "workspaces", color: "var(--c-purple)", hidden: true },
  // "Equipos y Colaboración" (/workspaces) ya no está aquí: los espacios de
  // trabajo son el contenedor de los proyectos (migraciones 0030/0031), no un
  // módulo aparte, y se administran desde /execution con el selector de
  // espacio y el panel de Equipo. El ícono `workspaces` sigue en icons.tsx
  // porque ese selector lo usa.
  { href: "/development", label: "Panel", group: "Personal Development OS", icon: "development", color: "var(--c-orange)" },
  { href: "/development/goals", label: "Metas Personales", group: "Personal Development OS", icon: "personalGoals", color: "var(--c-orange)" },
  { href: "/development/routines", label: "Rutinas", group: "Personal Development OS", icon: "routines", color: "var(--c-orange)" },
  { href: "/development/habits", label: "Hábitos", group: "Personal Development OS", icon: "habits", color: "var(--c-orange)" },
  { href: "/development/library", label: "Biblioteca", group: "Personal Development OS", icon: "library", color: "var(--c-orange)" },
  // "Intelligence OS" ya no es una sección del menú. Anunciarla como tal
  // prometía un cerebro central que todavía no existe: el motor está
  // construido para cinco ámbitos y `analyze()` solo acepta Dinero
  // (lib/insights/actions.ts). Las recomendaciones se leen donde se generan
  // —el panel embebido al final de /money—, no en una bandeja aparte.
  //
  // Las DOS pantallas siguen vivas, y no por nostalgia: lo que silencias
  // vuelve como contexto de rechazo del próximo análisis, así que tiene que
  // haber dónde ver y deshacer lo silenciado. Se llega desde el enlace del
  // propio panel y desde la tarjeta de Configuración.
  { href: "/intelligence", label: "Recomendaciones", group: "Intelligence OS", icon: "insights", color: "var(--c-teal)", hidden: true },
  { href: "/intelligence/memory", label: "Memoria", group: "Intelligence OS", icon: "memory", color: "var(--c-teal)", hidden: true },
  { href: "/money", label: "Dashboard y Gastos", group: "Money OS (privado)", icon: "money", color: "var(--c-green)" },
  { href: "/money/budget", label: "Presupuesto", group: "Money OS (privado)", icon: "budget", color: "var(--c-green)" },
  { href: "/investments", label: "Inversiones", group: "Money OS (privado)", icon: "investments", color: "var(--c-green)" },
  { href: "/savings", label: "Ahorros", group: "Money OS (privado)", icon: "savings", color: "var(--c-green)" },
  { href: "/debt", label: "Deudas", group: "Money OS (privado)", icon: "debt", color: "var(--c-green)" },
  { href: "/cashback", label: "Cashback", group: "Money OS (privado)", icon: "cashback", color: "var(--c-green)" },
  { href: "/wealth", label: "Patrimonio", group: "Money OS (privado)", icon: "wealth", color: "var(--c-green)" },
  { href: "/goals", label: "Metas Financieras", group: "Money OS (privado)", icon: "goals", color: "var(--c-green)" },
  { href: "/household", label: "Hogar y Dependientes", group: "Money OS (privado)", icon: "household", color: "var(--c-green)" },
  { href: "/settings", label: "Configuración", group: "Cuenta", icon: "settings", color: "var(--muted)" },
  // El panel de administración (0044) no puede estar en el menú: esta lista la
  // importa un componente cliente y es la misma para todo el mundo, así que
  // ponerlo aquí visible anunciaría la ruta a quien recibe un 404 al abrirla.
  // Se alcanza desde Configuración, y solo si eres administrador. Figura de
  // todos modos porque de esta lista sale el título de la barra superior: sin
  // la entrada, la pantalla se titularía "Life OS".
  { href: "/admin", label: "Administración", group: "Cuenta", icon: "settings", color: "var(--muted)", hidden: true }
];
