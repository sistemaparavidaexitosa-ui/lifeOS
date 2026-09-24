"use client";

import Link from "next/link";
import { IconBoard, IconLibrary, IconRoutines, IconWealth } from "@/components/icons";
import type { IconoDeAccion } from "@/lib/domain/centro/runtime/secciones.ts";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Los datos nombran el destino; qué dibujo le toca se decide aquí, que es lo visual. */
const ICONOS: Record<IconoDeAccion, typeof IconBoard> = {
  proyectos: IconBoard,
  biblioteca: IconLibrary,
  finanzas: IconWealth,
  rutinas: IconRoutines
};

export default function SeccionAtajos({ data, title, alAceptar }: PropsDeSeccion<"quickActions">) {
  return (
    <div className="rt-bloque">
      {title && <h2 className="rt-bloque-titulo">{title}</h2>}
      <div className="rt-atajos">
        {data.items.map((a) => {
          const Icono = ICONOS[a.icono];
          return (
            <Link key={a.href} href={a.href} className="rt-atajo" onClick={() => alAceptar(a.href)}>
              <Icono aria-hidden width={20} height={20} />
              <span>{a.etiqueta}</span>
              <span className="rt-muted">{a.detalle}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

registrarSeccion("quickActions", SeccionAtajos);
