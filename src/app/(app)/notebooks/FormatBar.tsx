"use client";
// La barra «Aa»: estilo de bloque, marcas, listas y deshacer.
//
// VA DEBAJO DE LA LÍNEA DONDE ESCRIBES (D-155)
// Cuatro diseños atados a la PANTALLA fallaron en el iPhone: tres anclándola
// sobre el teclado (D-113) y uno pegándola arriba con `sticky` (D-154), que
// desaparecía en cuanto se abría el teclado. Ahora NoteEditor la coloca en el
// hueco que la línea enfocada reserva debajo, en coordenadas del documento
// (src/lib/dom/barra-formato.ts): viaja con el texto y no tapa nada.
//
// «Aa» NO ABRE UN DESPLEGABLE
// Cambia la fila de botones por la de estilos, a la misma altura. Un menú que
// cuelga debajo acababa tapado por el teclado justo cuando la línea está abajo.
import { useState, type MouseEvent } from "react";
import type { BlockStyle, MarcaInline } from "@/lib/domain/notes/edit.ts";

export interface FormatBarProps {
  estilo: BlockStyle;
  marcasActivas: MarcaInline[];
  onEstilo: (estilo: BlockStyle) => void;
  onMarca: (marca: MarcaInline) => void;
  onDeshacer: () => void;
  onRehacer: () => void;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
  /** Distancia desde arriba del documento. `null` = no se está escribiendo en el cuerpo. */
  top: number | null;
}

const ESTILOS: { valor: BlockStyle; etiqueta: string }[] = [
  { valor: "title", etiqueta: "Título" },
  { valor: "heading", etiqueta: "Encabezado" },
  { valor: "subheading", etiqueta: "Subencabezado" },
  { valor: "body", etiqueta: "Cuerpo" },
  { valor: "mono", etiqueta: "Monoespaciado" },
  { valor: "quote", etiqueta: "Cita" }
];

const MARCAS: { valor: MarcaInline; etiqueta: string; titulo: string }[] = [
  { valor: "bold", etiqueta: "B", titulo: "Negrita" },
  { valor: "italic", etiqueta: "I", titulo: "Cursiva" },
  { valor: "underline", etiqueta: "U", titulo: "Subrayado" },
  { valor: "strike", etiqueta: "S", titulo: "Tachado" },
  { valor: "code", etiqueta: "‹›", titulo: "Monoespaciado" }
];

const LISTAS: { valor: BlockStyle; etiqueta: string; titulo: string }[] = [
  { valor: "bullets", etiqueta: "•", titulo: "Viñetas" },
  { valor: "ordered", etiqueta: "1.", titulo: "Numerada" },
  { valor: "todo", etiqueta: "☑", titulo: "Casillas" }
];

export default function FormatBar({
  estilo,
  marcasActivas,
  onEstilo,
  onMarca,
  onDeshacer,
  onRehacer,
  puedeDeshacer,
  puedeRehacer,
  top
}: FormatBarProps) {
  const [abierto, setAbierto] = useState(false);
  // Las listas son un eje aparte del estilo de párrafo: dentro de una lista, el
  // menú «Aa» no marcaba NADA porque "bullets" no está entre sus opciones. Se
  // enseña «Cuerpo», que es el estilo de párrafo que la lista lleva debajo.
  const estiloDelMenu: BlockStyle =
    estilo === "bullets" || estilo === "ordered" || estilo === "todo" ? "body" : estilo;
  // Nunca robar el foco al contenteditable: sin esto, la selección se deshace
  // al tocar el botón y no queda nada a lo que aplicar la marca.
  const sinRobarFoco = (e: MouseEvent) => e.preventDefault();

  return (
    <div
      className={`nb-formatbar${top === null ? " oculta" : ""}`}
      style={{ top: top ?? 0 }}
      role="toolbar"
      aria-label="Formato"
      aria-hidden={top === null}
    >
      {abierto ? (
        <div className="nb-formatbar-fila">
          <button
            type="button"
            className="nb-fb activo"
            onMouseDown={sinRobarFoco}
            onClick={() => setAbierto(false)}
            aria-expanded
            title="Cerrar estilos"
          >
            Aa
          </button>
          <span className="nb-fb-sep" />
          {ESTILOS.map((e) => (
            <button
              key={e.valor}
              type="button"
              className={`nb-fb-estilo${estiloDelMenu === e.valor ? " activo" : ""}`}
              onMouseDown={sinRobarFoco}
              onClick={() => {
                onEstilo(e.valor);
                setAbierto(false);
              }}
            >
              {e.etiqueta}
            </button>
          ))}
        </div>
      ) : (
        <div className="nb-formatbar-fila">
          <button
            type="button"
            className="nb-fb"
            onMouseDown={sinRobarFoco}
            onClick={() => setAbierto(true)}
            aria-expanded={false}
            title="Estilo"
          >
            Aa
          </button>
          <span className="nb-fb-sep" />
          {MARCAS.map((m) => (
            <button
              key={m.valor}
              type="button"
              title={m.titulo}
              className={`nb-fb nb-fb-${m.valor}${marcasActivas.includes(m.valor) ? " activo" : ""}`}
              aria-pressed={marcasActivas.includes(m.valor)}
              onMouseDown={sinRobarFoco}
              onClick={() => onMarca(m.valor)}
            >
              {m.etiqueta}
            </button>
          ))}
          <span className="nb-fb-sep" />
          {LISTAS.map((l) => (
            <button
              key={l.valor}
              type="button"
              title={l.titulo}
              className={`nb-fb${estilo === l.valor ? " activo" : ""}`}
              onMouseDown={sinRobarFoco}
              onClick={() => onEstilo(l.valor)}
            >
              {l.etiqueta}
            </button>
          ))}
          <span className="nb-fb-spacer" />
          <button
            type="button"
            className="nb-fb"
            title="Deshacer"
            disabled={!puedeDeshacer}
            onMouseDown={sinRobarFoco}
            onClick={onDeshacer}
          >
            ↩︎
          </button>
          <button
            type="button"
            className="nb-fb"
            title="Rehacer"
            disabled={!puedeRehacer}
            onMouseDown={sinRobarFoco}
            onClick={onRehacer}
          >
            ↪︎
          </button>
        </div>
      )}
    </div>
  );
}
