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
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", group: "Panel", icon: "home", color: "var(--accent)" },
  { href: "/reports", label: "Reportes", group: "Panel", icon: "reports", color: "var(--accent)" },
  { href: "/execution", label: "Proyectos y Tareas", group: "Execution OS", icon: "board", color: "var(--c-purple)" },
  { href: "/execution/eisenhower", label: "Matriz de Eisenhower", group: "Execution OS", icon: "eisenhower", color: "var(--c-purple)" },
  { href: "/planning", label: "Planeación", group: "Execution OS", icon: "planning", color: "var(--c-purple)" },
  { href: "/time", label: "Autogestión del Tiempo", group: "Execution OS", icon: "time", color: "var(--c-purple)" },
  { href: "/workspaces", label: "Equipos y Colaboración", group: "Execution OS", icon: "workspaces", color: "var(--c-purple)" },
  { href: "/development/habits", label: "Hábitos", group: "Personal Development OS", icon: "habits", color: "var(--c-orange)" },
  { href: "/development/library", label: "Biblioteca", group: "Personal Development OS", icon: "library", color: "var(--c-orange)" },
  { href: "/money", label: "Dashboard y Gastos", group: "Money OS (privado)", icon: "money", color: "var(--c-green)" },
  { href: "/money/budget", label: "Presupuesto", group: "Money OS (privado)", icon: "budget", color: "var(--c-green)" },
  { href: "/investments", label: "Inversiones", group: "Money OS (privado)", icon: "investments", color: "var(--c-green)" },
  { href: "/savings", label: "Ahorros", group: "Money OS (privado)", icon: "savings", color: "var(--c-green)" },
  { href: "/debt", label: "Deudas", group: "Money OS (privado)", icon: "debt", color: "var(--c-green)" },
  { href: "/cashback", label: "Cashback", group: "Money OS (privado)", icon: "cashback", color: "var(--c-green)" },
  { href: "/wealth", label: "Patrimonio", group: "Money OS (privado)", icon: "wealth", color: "var(--c-green)" },
  { href: "/goals", label: "Metas Financieras", group: "Money OS (privado)", icon: "goals", color: "var(--c-green)" },
  { href: "/household", label: "Hogar y Dependientes", group: "Money OS (privado)", icon: "household", color: "var(--c-green)" },
  { href: "/settings", label: "Configuración", group: "Cuenta", icon: "settings", color: "var(--muted)" }
];
