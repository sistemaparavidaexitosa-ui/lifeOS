"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptProposal, dismissProposal } from "@/lib/coach/actions";
import type { OpcionDeCaptura } from "@/lib/domain/centro/captura.ts";

/**
 * La barra del centro (D-168): escribes una idea y la IA dice dónde va.
 *
 * NO ESCRIBE NADA SOLA. Lo que vuelve es una propuesta con su botón; crearla es
 * el toque de la persona, igual que todo lo demás (D-153). Cuando la IA no lo
 * tiene claro, pregunta y ofrece las opciones en vez de adivinar.
 */

type Respuesta =
  | { clase: "nota"; id: string; titulo: string; destino: string }
  | { clase: "tarea"; id: string; titulo: string; destino: string }
  | { clase: "pregunta"; pregunta: string; opciones: OpcionDeCaptura[] };

export default function BarraCaptura({
  workspaceId,
  onNavegar
}: {
  workspaceId: string | null;
  onNavegar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const router = useRouter();

  async function enviar(contenido: string) {
    setEnviando(true);
    setAviso(null);
    try {
      const r = await fetch("/api/centro/capturar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ texto: contenido })
      });
      const j = (await r.json()) as { ok: boolean; reason?: string; resultado?: Respuesta };
      if (!j.ok || !j.resultado) {
        setAviso(j.reason ?? "No se pudo leer la idea.");
        return;
      }
      setRespuesta(j.resultado);
      if (j.resultado.clase !== "pregunta") setTexto("");
    } catch {
      setAviso("Sin conexión.");
    } finally {
      setEnviando(false);
    }
  }

  async function guardar(id: string) {
    setEnviando(true);
    const r = await acceptProposal(id, workspaceId);
    setEnviando(false);
    if (!r.ok) {
      setAviso(r.reason ?? "No se pudo guardar.");
      return;
    }
    setRespuesta(null);
    setTexto("");
    setAviso("Guardado.");
    if (r.href) {
      onNavegar();
      router.push(r.href);
    }
  }

  async function descartar(id: string) {
    await dismissProposal(id);
    setRespuesta(null);
    setAviso(null);
  }

  // Cuando la IA pregunta, elegir una opción es volver a enviar el mismo texto
  // con la respuesta pegada: no hay un segundo camino que mantener.
  function elegir(o: OpcionDeCaptura) {
    void enviar(`${texto}\n\n[La persona eligió: ${o.etiqueta}. Usa ${o.clase} con el id ${o.id}.]`);
  }

  return (
    <div className="rit-barra">
      <form
        className="rit-barra-linea"
        onSubmit={(e) => {
          e.preventDefault();
          if (texto.trim() && !enviando) void enviar(texto.trim());
        }}
      >
        <input
          className="rit-barra-campo"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Escribe una idea, algo por hacer, lo que sea…"
          aria-label="Escribe una idea"
          disabled={enviando}
        />
        <button className="rit-sug-si" type="submit" disabled={enviando || !texto.trim()}>
          {enviando ? "…" : "Enviar"}
        </button>
      </form>

      {respuesta?.clase === "pregunta" && (
        <div className="rit-barra-respuesta">
          <p className="rit-muted">{respuesta.pregunta}</p>
          <div className="rit-sug-botones">
            {respuesta.opciones.map((o) => (
              <button key={`${o.clase}:${o.id}`} className="rit-sug-si" disabled={enviando} onClick={() => elegir(o)}>
                {o.etiqueta}
              </button>
            ))}
          </div>
        </div>
      )}

      {respuesta && respuesta.clase !== "pregunta" && (
        <div className="rit-barra-respuesta">
          <p className="rit-muted">
            {respuesta.clase === "nota" ? "Nota en" : "Tarea en"} <b>{respuesta.destino}</b>: {respuesta.titulo}
          </p>
          <div className="rit-sug-botones">
            <button className="rit-sug-si" disabled={enviando} onClick={() => void guardar(respuesta.id)}>
              Guardar
            </button>
            <button className="rit-skip" disabled={enviando} onClick={() => void descartar(respuesta.id)}>
              No
            </button>
          </div>
        </div>
      )}

      {aviso && (
        <p className="rit-muted" role="status">
          {aviso}
        </p>
      )}
    </div>
  );
}
