"use client";

import { registrarSeccion, type PropsDeSeccion } from "../registro";

/** El saludo, en grande. Tipografía y nada más (maqueta de la mañana). */
export default function SeccionHero({ data }: PropsDeSeccion<"hero">) {
  return (
    <header className="rt-hero">
      <p className="rt-eyebrow">Centro</p>
      <h1 className="rt-hero-titulo">
        {data.saludo},<br />
        {data.nombre}
      </h1>
      {data.frase && <p className="rt-hero-frase">{data.frase}</p>}
    </header>
  );
}

registrarSeccion("hero", SeccionHero);
