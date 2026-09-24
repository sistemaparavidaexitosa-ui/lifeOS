"use client";

import { IconSparkles } from "@/components/icons";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** Una idea suelta del agente, en un fondo gris suave (maqueta). */
export default function SeccionInsight({ data }: PropsDeSeccion<"insight">) {
  return (
    <div className="ag-insight">
      <IconSparkles aria-hidden className="ag-insight-icono" />
      <p className="ag-insight-texto">{data.texto}</p>
    </div>
  );
}

registrarSeccion("insight", SeccionInsight);
