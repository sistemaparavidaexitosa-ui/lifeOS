"use client";

// Buscar en un proyecto, como en iOS: la lupa abre una pantalla propia con el
// campo arriba y «Cancelar» al lado. No filtra la lista por debajo (eso son
// las fichas): encuentra UNA tarea, esté donde esté del árbol, y la abre.
//
// - Ignora acentos y mayúsculas; busca en títulos y en notas.
// - Cada resultado dice de dónde cuelga («Lanzar web › Textos legales») y se
//   puede marcar desde aquí mismo con su círculo.
// - Con el campo vacío, lo último que se abrió.
//
// La capa está montada siempre (oculta e inerte) para que `abrir()` pueda
// enfocar el campo dentro del mismo toque de la lupa: si el foco llega un
// render después, Safari no saca el teclado.

import { useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconSearch } from "@/components/icons";
import { fcorta } from "@/lib/format";
import { buscar, resaltar } from "@/lib/domain/execution/arbol.ts";
import type { BoardApi, BoardTask } from "./board-types";
import { BotonEstado } from "./LinearList";

export interface BusquedaHandle {
  abrir: () => void;
}

export default function Busqueda({
  ref,
  tasks,
  notas,
  recientes,
  api,
  onAbrirTarea
}: {
  ref: React.Ref<BusquedaHandle>;
  tasks: BoardTask[];
  notas: Record<string, string>;
  recientes: string[];
  api: BoardApi;
  onAbrirTarea: (id: string) => void;
}) {
  const capa = useRef<HTMLDivElement>(null);
  const campo = useRef<HTMLInputElement>(null);
  const [abierta, setAbierta] = useState(false);
  const [consulta, setConsulta] = useState("");
  // El portal va a <body>, que solo existe después de montar.
  const [montada, setMontada] = useState(false);
  useEffect(() => setMontada(true), []);

  useImperativeHandle(ref, () => ({
    abrir() {
      const el = capa.current;
      if (!el) return;
      el.inert = false;
      campo.current?.focus({ preventScroll: true });
      document.documentElement.style.overflow = "hidden";
      setAbierta(true);
    }
  }));

  function cerrar() {
    campo.current?.blur();
    document.documentElement.style.overflow = "";
    setAbierta(false);
    setConsulta("");
  }

  function abrirTarea(id: string) {
    cerrar();
    onAbrirTarea(id);
  }

  const resultados = useMemo(() => buscar(tasks, consulta, notas), [tasks, consulta, notas]);
  const porId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const ultimas = useMemo(
    () => recientes.map((id) => porId.get(id)).filter((t): t is BoardTask => Boolean(t)),
    [recientes, porId]
  );
  const ruta = (t: BoardTask) => {
    const out: string[] = [];
    for (let p = t.parentTaskId ? porId.get(t.parentTaskId) : undefined; p && out.length < 4; p = p.parentTaskId ? porId.get(p.parentTaskId) : undefined)
      out.unshift(p.title);
    return out;
  };

  const vacia = !consulta.trim();

  if (!montada) return null;

  return createPortal(
    <div
      ref={capa}
      className="xr-busqueda"
      data-abierta={abierta || undefined}
      // Cerrada no se ve ni se alcanza con el tabulador.
      inert={!abierta}
      role="dialog"
      aria-modal="true"
      aria-label="Buscar en el proyecto"
    >
      <form
        className="xr-busqueda-cabeza"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const primera = vacia ? ultimas[0] : resultados[0]?.tarea;
          if (primera) abrirTarea(primera.id);
        }}
      >
        <div className="xr-buscar">
          <IconSearch width={16} height={16} aria-hidden />
          <input
            ref={campo}
            type="search"
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && cerrar()}
            placeholder="Buscar tareas y notas"
            aria-label="Buscar tareas y notas"
            enterKeyHint="search"
            autoComplete="off"
          />
        </div>
        <button type="button" className="xr-busqueda-cancelar" onClick={cerrar}>
          Cancelar
        </button>
      </form>

      <div className="xr-busqueda-cuerpo">
        {vacia ? (
          ultimas.length > 0 ? (
            <>
              <h3 className="xr-etiqueta">Recientes</h3>
              <ul className="xr-filas">
                {ultimas.map((t) => (
                  <Resultado key={t.id} t={t} ruta={ruta(t)} consulta="" api={api} onAbrir={abrirTarea} />
                ))}
              </ul>
            </>
          ) : (
            <p className="xr-busqueda-pista">Busca por palabras del título o de las notas. Da igual con o sin acentos.</p>
          )
        ) : resultados.length ? (
          <ul className="xr-filas">
            {resultados.map((r) => (
              <Resultado key={r.tarea.id} t={r.tarea} ruta={r.ruta} enNotas={r.enNotas} consulta={consulta} api={api} onAbrir={abrirTarea} />
            ))}
          </ul>
        ) : (
          <p className="xr-busqueda-pista">Nada con «{consulta.trim()}».</p>
        )}
      </div>
    </div>,
    document.body
  );
}

function Resultado({
  t,
  ruta,
  enNotas = false,
  consulta,
  api,
  onAbrir
}: {
  t: BoardTask;
  ruta: string[];
  enNotas?: boolean;
  consulta: string;
  api: BoardApi;
  onAbrir: (id: string) => void;
}) {
  const cerrada = t.status === "Completed" || t.status === "Cancelled";
  return (
    <li className="xr-fila xr-resultado" data-cerrada={cerrada || undefined}>
      <div className="xr-fila-cuerpo">
        <BotonEstado t={t} api={api} recien={api.retenidas.has(t.id)} />
        <button type="button" className="xr-resultado-texto" onClick={() => onAbrir(t.id)}>
          {ruta.length > 0 && <span className="xr-resultado-ruta">{ruta.join(" › ")}</span>}
          <span className="xr-titulo-texto">
            {resaltar(t.title, consulta).map((trozo, i) => (trozo.marca ? <mark key={i}>{trozo.texto}</mark> : trozo.texto))}
          </span>
        </button>
        <span className="xr-fila-meta">
          {enNotas && <span className="xr-meta-suave">en notas</span>}
          {t.due && <span className="xr-fecha">{t.due === api.today ? "Hoy" : fcorta(t.due, api.today)}</span>}
        </span>
      </div>
    </li>
  );
}
