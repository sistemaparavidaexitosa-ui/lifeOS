"use client";
// Conmutador Proyectos / Notebooks.
//
// Las dos pantallas cuelgan del MISMO espacio de trabajo y se gobiernan con el
// mismo `?ws=`; este componente es lo que hace visible esa hermandad. Se quedan
// como rutas separadas a propósito, en vez de una sola con `?tab=`: así el
// enlace a un cuaderno es compartible tal cual, y el gesto de volver del
// iPhone recorre pantallas de verdad y no estados internos de una misma ruta.
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/execution", label: "Proyectos" },
  { href: "/notebooks", label: "Notebooks" }
] as const;

export default function WorkspaceTabs({ workspaceId }: { workspaceId: string }) {
  const pathname = usePathname();

  return (
    <div className="ws-tabs" role="tablist" aria-label="Contenido del espacio">
      {TABS.map((tab) => {
        // startsWith y no igualdad: /execution también está "activo" cuando se
        // mira un tablero concreto.
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={`${tab.href}?ws=${workspaceId}`}
            className={`ws-tab${active ? " active" : ""}`}
            role="tab"
            aria-selected={active}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
