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
 * Cuántos píxeles del viewport se está comiendo el teclado.
 *
 * En Safari de iOS el teclado NO reduce el viewport de layout, así que una
 * barra fija abajo se queda DEBAJO del teclado, invisible justo cuando se
 * necesita. `visualViewport` es la única fuente que sabe dónde está el borde
 * de verdad. Sin soporte devuelve 0 y la barra se queda estática.
 *
 * POR QUÉ NO ENTRA `offsetTop` NI SE ESCUCHA `scroll`
 * La primera versión calculaba `innerHeight - (height + offsetTop)` y se
 * suscribía a `visualViewport.scroll`. `offsetTop` no mide el teclado: mide
 * cuánto se ha desplazado el viewport visual dentro del de layout, y en Safari
 * de iOS cambia continuamente al hacer scroll y con el rebote elástico. El
 * resultado era que `bottom` se recalculaba en cada evento y la barra derivaba
 * por la pantalla. Lo reportó el uso real en un teléfono.
 */
export function useAlturaTeclado(): number {
  const [alto, setAlto] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function medir() {
      if (!vv) return;
      // Sólo la diferencia de ALTURAS. Nada que dependa del scroll.
      const teclado = window.innerHeight - vv.height;
      // Por debajo de 60px es ruido de la barra de direcciones, no un teclado.
      setAlto(teclado > 60 ? Math.round(teclado) : 0);
    }

    medir();
    // Sin `scroll`: el teclado aparece y desaparece con `resize`, y suscribirse
    // al scroll era justo lo que hacía derivar la barra.
    vv.addEventListener("resize", medir);
    return () => {
      vv.removeEventListener("resize", medir);
    };
  }, []);

  return alto;
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
  const alturaTeclado = useAlturaTeclado();

  // Nunca robar el foco al contenteditable: sin esto, la selección se deshace
  // al tocar el botón y no queda nada a lo que aplicar la marca.
  const sinRobarFoco = (e: MouseEvent) => e.preventDefault();

  return (
    <div
      className="nb-formatbar"
      style={{ bottom: alturaTeclado }}
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
