"use client";
// La barra «Aa»: estilo de bloque, marcas, listas, tabla, enlace y deshacer.
//
// POR QUÉ VA ABAJO, SI D-040 DICE QUE LAS ACCIONES VAN ARRIBA
// D-040 puso las acciones arriba porque «una barra fija abajo pelea con el
// teclado y con la barra de gestos», y sigue siendo cierto para guardar,
// borrar y volver. La barra de FORMATO es otra cosa: actúa sobre la selección
// y tiene que estar donde está el pulgar. Es una excepción acotada, no la
// derogación de D-040.
import { useEffect, useState, type MouseEvent } from "react";
import type { BlockStyle, MarcaInline } from "@/lib/domain/notes/edit.ts";
import { bordeInferiorVisual } from "@/lib/dom/anclaje-teclado.ts";

export interface FormatBarProps {
  estilo: BlockStyle;
  marcasActivas: MarcaInline[];
  onEstilo: (estilo: BlockStyle) => void;
  onMarca: (marca: MarcaInline) => void;
  onEnlace: () => void;
  onTabla: () => void;
  onDeshacer: () => void;
  onRehacer: () => void;
  puedeDeshacer: boolean;
  puedeRehacer: boolean;
}

/**
 * Coordenada Y donde debe quedar el borde inferior de la barra, o `null` si el
 * navegador no expone `visualViewport` (entonces vale un `bottom: 0` normal).
 *
 * POR QUÉ NO SE USA `bottom`
 * En Safari de iOS el teclado NO encoge el viewport de layout, y `bottom` se
 * mide contra ése: la barra quedaba anclada por DEBAJO del teclado, invisible.
 * Y al hacer scroll el viewport visual se desliza sobre el de layout, así que
 * además parecía derivar. Los dos síntomas eran el mismo error de coordenadas.
 *
 * Se ancla a `top: 0` y se desplaza con `transform`, todo en coordenadas de
 * layout. La aritmética vive en `anclaje-teclado.ts`, probada aparte.
 */
function useBordeVisual(): number | null {
  const [borde, setBorde] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function medir() {
      if (!vv) return;
      setBorde(
        bordeInferiorVisual({
          innerHeight: window.innerHeight,
          vvHeight: vv.height,
          vvOffsetTop: vv.offsetTop
        })
      );
    }

    medir();
    // `scroll` SÍ hace falta: es lo que mantiene la barra pegada al viewport
    // visual mientras la página se desplaza. Quitarlo fue el error anterior.
    vv.addEventListener("resize", medir);
    vv.addEventListener("scroll", medir);
    return () => {
      vv.removeEventListener("resize", medir);
      vv.removeEventListener("scroll", medir);
    };
  }, []);

  return borde;
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
  onEnlace,
  onTabla,
  onDeshacer,
  onRehacer,
  puedeDeshacer,
  puedeRehacer
}: FormatBarProps) {
  const [abierto, setAbierto] = useState(false);
  const borde = useBordeVisual();

  // Nunca robar el foco al contenteditable: sin esto, la selección se deshace
  // al tocar el botón y no queda nada a lo que aplicar la marca.
  const sinRobarFoco = (e: MouseEvent) => e.preventDefault();

  return (
    <div
      className="nb-formatbar"
      // Con medidas: anclada arriba y bajada hasta el borde del viewport
      // visual. Sin ellas: el `bottom: 0` del CSS.
      style={
        borde === null
          ? undefined
          : { top: 0, bottom: "auto", transform: `translateY(calc(${borde}px - 100%))` }
      }
      role="toolbar"
      aria-label="Formato"
    >
      {abierto && (
        <div className="nb-formatbar-menu">
          {ESTILOS.map((e) => (
            <button
              key={e.valor}
              type="button"
              className={`nb-fb-estilo${estilo === e.valor ? " activo" : ""}`}
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
        <button type="button" className="nb-fb" title="Tabla" onMouseDown={sinRobarFoco} onClick={onTabla}>
          ⊞
        </button>
        <button type="button" className="nb-fb" title="Enlace" onMouseDown={sinRobarFoco} onClick={onEnlace}>
          🔗
        </button>
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
    </div>
  );
}
