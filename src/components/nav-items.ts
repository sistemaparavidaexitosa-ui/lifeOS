// Navegación — espejo de NAV[] en LifeOS 4.html. Ver /docs/UX_MAP.md para el
// mapeo completo vista HTML -> ruta -> componente -> fuente de datos -> acción.
export interface NavItem {
  href: string;
  label: string;
  group: string;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "Home", group: "Panel" },
  { href: "/reports", label: "Reportes", group: "Panel" },
  { href: "/execution", label: "Proyectos y Tareas", group: "Execution OS" },
  { href: "/execution/eisenhower", label: "Matriz de Eisenhower", group: "Execution OS" },
  { href: "/planning", label: "Planeación", group: "Execution OS" },
  { href: "/time", label: "Autogestión del Tiempo", group: "Execution OS" },
  { href: "/habits", label: "Hábitos y Lectura", group: "Execution OS" },
  { href: "/workspaces", label: "Equipos y Colaboración", group: "Execution OS" },
  { href: "/money", label: "Dashboard y Gastos", group: "Money OS (privado)" },
  { href: "/money/budget", label: "Presupuesto", group: "Money OS (privado)" },
  { href: "/investments", label: "Inversiones", group: "Money OS (privado)" },
  { href: "/savings", label: "Ahorros", group: "Money OS (privado)" },
  { href: "/debt", label: "Deudas", group: "Money OS (privado)" },
  { href: "/cashback", label: "Cashback", group: "Money OS (privado)" },
  { href: "/wealth", label: "Patrimonio", group: "Money OS (privado)" },
  { href: "/goals", label: "Metas Financieras", group: "Money OS (privado)" },
  { href: "/household", label: "Hogar y Dependientes", group: "Money OS (privado)" },
  { href: "/settings", label: "Configuración", group: "Cuenta" }
];
