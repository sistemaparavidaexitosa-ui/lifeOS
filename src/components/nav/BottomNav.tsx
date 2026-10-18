"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECCIONES, seccionDe, type SeccionDeNav } from "../nav-items";
import { IconNavDevelopment, IconNavExecution, IconNavHome, IconNavMoney, IconTarget } from "../icons";
import { EVENTO_ABRIR_CENTRO } from "../ritual/eventos";

const ICONOS: Record<Exclude<SeccionDeNav["id"], "centro">, typeof IconNavHome> = {
  home: IconNavHome,
  execution: IconNavExecution,
  money: IconNavMoney,
  development: IconNavDevelopment
};

/**
 * La barra de navegación inferior (rediseño). Cinco destinos; el del medio es
 * el Centro, un objetivo: no navega, abre el agente con el mismo evento que ya
 * escuchaba `RitualHost` (D-166). Flota sobre el contenido con vidrio, a la
 * altura del pulgar, y cabe igual en escritorio (ancho máximo 460 px).
 */
export default function BottomNav() {
  const ruta = usePathname() ?? "";
  const actual = seccionDe(ruta)?.id ?? null;

  return (
    <nav className="nx-bottomnav" aria-label="Navegación principal">
      {SECCIONES.map((s) => {
        if (s.id === "centro") {
          return (
            <button
              key={s.id}
              type="button"
              className="nx-nav-centro"
              aria-label="Abrir el Centro"
              onClick={() => window.dispatchEvent(new Event(EVENTO_ABRIR_CENTRO))}
            >
              <IconTarget width={26} height={26} />
            </button>
          );
        }
        const Icono = ICONOS[s.id];
        return (
          <Link key={s.id} href={s.href!} className="nx-nav-item" aria-current={actual === s.id ? "page" : undefined}>
            <Icono width={23} height={23} />
            <span>{s.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
