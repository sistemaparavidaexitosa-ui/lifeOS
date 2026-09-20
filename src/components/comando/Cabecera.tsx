// src/components/comando/Cabecera.tsx
// Cómo vas, en cuatro datos (D-176).
//
// POR QUÉ ESTO NO SON TARJETAS
// «Qué hago» y «cómo voy» son dos preguntas distintas, y mezclarlas es
// exactamente cómo el centro volvió a parecer un tablero la última vez (D-168 →
// D-169). Aquí no hay un solo botón: son chips, se leen de un vistazo y no
// piden nada. Todo lo que pide algo está más abajo, en las tarjetas.
//
// Server Component: no tiene estado ni maneja eventos.

import { Chip } from "@/components/ui";
import type { EstadoDeMando } from "@/lib/domain/comando/tipos.ts";

export default function Cabecera({
  estado,
  saludo,
  nombre,
  fecha
}: {
  estado: EstadoDeMando;
  saludo: string;
  nombre: string;
  fecha: string;
}) {
  const tonoSaturacion = estado.saturacion === "saturated" ? "bad" : estado.saturacion === "warn" ? "warn" : "ok";

  return (
    <header className="cmd-cabecera">
      <div className="cmd-cabecera-linea">
        <span className="cmd-eyebrow">{fecha}</span>
        <h1 className="cmd-saludo">
          {saludo}, {nombre}
        </h1>
      </div>

      {/* El resumen de la franja, si lo hay. Vacío no se rellena con nada:
          inventar un «vas bien» que nadie calculó es exactamente lo que
          `validateAnchoring` existe para impedir en el otro extremo. */}
      {estado.resumen && <p className="cmd-resumen">{estado.resumen}</p>}

      <div className="cmd-chips">
        {/* Cero bloqueos SE DICE. Esconder la fila cuando todo va bien deja a la
            persona sin saber si es que no hay nada o es que no se comprobó. */}
        <Chip kind={estado.bloqueos > 0 ? "bad" : "ok"}>
          {estado.bloqueos === 0
            ? "Nada te frena"
            : estado.bloqueos === 1
              ? "1 cosa te frena"
              : `${estado.bloqueos} cosas te frenan`}
        </Chip>

        <Chip kind={tonoSaturacion}>
          {estado.horasComprometidas} h comprometidas · {estado.horasDisponibles} h libres
        </Chip>

        <Chip kind={estado.planAprobado ? "ok" : "warn"}>{estado.planAprobado ? "Plan aprobado" : "Plan sin aprobar"}</Chip>
      </div>
    </header>
  );
}
