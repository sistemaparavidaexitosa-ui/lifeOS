"use client";
// La barra «Aa»: estilo de bloque, marcas, listas y deshacer.
//
// VA ARRIBA, PEGADA BAJO LA BARRA SUPERIOR (D-154)
// Estuvo abajo, anclada sobre el teclado leyendo `visualViewport` (D-113). Tres
// arreglos seguidos no consiguieron que dejara de flotar: en iOS las medidas del
// viewport cambian con la barra de direcciones y llegan tarde con el teclado, y
// cada evento la recolocaba. Ahora es `position: sticky` en el flujo de la
// página —el patrón de `.ex-toolbar`—: no mide nada, así que no puede derivar.
// Y arriba ya cumple D-040 sin excepciones.
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
  puedeRehacer
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
    <div className="nb-formatbar" role="toolbar" aria-label="Formato">
      <div className="nb-formatbar-fila">
        <button
          type="button"
          className={`nb-fb${abierto ? " activo" : ""}`}
          onMouseDown={sinRobarFoco}
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
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
      {/* Desplegable bajo la fila, fuera del flujo (ver .nb-formatbar-menu): abrirlo
          no debe mover los botones que se acaban de tocar. */}
      {abierto && (
        <div className="nb-formatbar-menu">
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
      )}
    </div>
  );
}
