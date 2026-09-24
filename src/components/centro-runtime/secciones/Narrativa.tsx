"use client";

import Link from "next/link";
import { IconChevronRight, IconSparkles } from "@/components/icons";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** El «cómo voy», en un bloque gris suave. Enlace solo si los datos traen destino. */
export default function SeccionNarrativa({ data, alAceptar }: PropsDeSeccion<"narrative">) {
  const cuerpo = (
    <>
      <IconSparkles aria-hidden className="rt-narrativa-icono" />
      <div className="rt-narrativa-cuerpo">
        <p className="rt-narrativa-titulo">{data.titulo}</p>
        <p className="rt-narrativa-texto">{data.texto}</p>
      </div>
    </>
  );
  const destino = data.href;
  return destino ? (
    <Link href={destino} className="rt-narrativa" onClick={() => alAceptar(destino)}>
      {cuerpo}
      <IconChevronRight aria-hidden className="rt-chevron" />
    </Link>
  ) : (
    <div className="rt-narrativa">{cuerpo}</div>
  );
}

registrarSeccion("narrative", SeccionNarrativa);
