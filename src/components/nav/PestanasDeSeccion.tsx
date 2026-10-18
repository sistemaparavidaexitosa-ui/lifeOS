"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { pestanaActiva, seccionDe } from "../nav-items";

/**
 * Las pestañas de arriba de cada sección (rediseño): lo que antes eran los
 * submenús del menú lateral. Solo aparecen en una sección con más de una.
 * La activa se desplaza a la vista sin animar: navegar entre pestañas es de
 * todos los días, y el movimiento lo haría sentir lento.
 */
export default function PestanasDeSeccion() {
  const ruta = usePathname() ?? "";
  const seccion = seccionDe(ruta);
  const activa = seccion ? pestanaActiva(ruta, seccion) : null;
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activa?.href]);

  if (!seccion || seccion.pestanas.length < 2) return null;
  return (
    <nav className="nx-pestanas" aria-label={seccion.label}>
      {seccion.pestanas.map((p) => {
        const es = activa?.href === p.href;
        return (
          <Link key={p.href} ref={es ? ref : undefined} href={p.href} className="nx-pestana" aria-current={es ? "page" : undefined}>
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
