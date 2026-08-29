"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IconClose } from "@/components/icons";

/**
 * Divulgación en panel para los formularios de Desarrollo Personal.
 *
 * POR QUÉ EXISTE
 * Cada formulario del módulo (meta, resultado clave, hábito, rutina, paso,
 * libro) se abría *en el sitio del botón*: el `<button>` se sustituía por un
 * `.card` con el formulario dentro. Ese botón casi nunca vive solo — está en
 * una fila `flex ... flex-wrap` junto al título y a tres o cuatro chips, o en
 * un `justify-end` al final de la tarjeta. Al abrirse, la tarjeta del
 * formulario heredaba ese contexto y se convertía en un ítem flex más:
 *
 *   - en la biblioteca quedaba a la derecha de la portada, en ~120px de ancho,
 *     con el buscador de metadatos y una rejilla de tres columnas dentro;
 *   - en rutinas nacía dentro de la fila de botones "Editar paso", alineada a
 *     la derecha y empujando al resto fuera de la pantalla;
 *   - en metas se colaba entre los chips de área y estado.
 *
 * En un móvil de 360px eso es un formulario ilegible. La causa no es el ancho
 * de la pantalla: es que un formulario de página completa no cabe en el hueco
 * que deja un botón de 90px. Sacarlo del flujo lo arregla de raíz.
 *
 * Reutiliza el panel que Ejecución ya tiene en globals.css (.td-backdrop /
 * .td-drawer): lateral en escritorio, hoja que sube desde abajo en móvil, con
 * safe-area y cuerpo con scroll propio. Cero CSS nuevo y una sola forma de
 * abrir formularios en toda la app.
 */
export default function FormSheet({
  label,
  title,
  variant = "ghost",
  block = false,
  className = "",
  children
}: {
  /** Texto del botón que abre el panel. */
  label: ReactNode;
  /** Encabezado del panel; también es su nombre accesible. */
  title: string;
  variant?: "ghost" | "primary";
  /** Ancho completo en móvil: para los botones de acción al pie de una tarjeta. */
  block?: boolean;
  className?: string;
  /** Recibe `close` para que el formulario cierre el panel al guardar. */
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // Escape cierra: el panel tapa el contenido y en escritorio el clic fuera no
  // siempre está a mano.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={`btn-${variant} btn-sm ${block ? "w-full sm:w-auto" : ""} ${className}`}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open && (
        <>
          <div className="td-backdrop" onClick={() => setOpen(false)} />
          <aside className="td-drawer" role="dialog" aria-modal="true" aria-label={title}>
            <div className="td-drawer-header">
              <b className="td-drawer-title">{title}</b>
              <button type="button" className="td-drawer-close" onClick={() => setOpen(false)} aria-label="Cerrar">
                <IconClose />
              </button>
            </div>
            <div className="td-drawer-body">{children(() => setOpen(false))}</div>
          </aside>
        </>
      )}
    </>
  );
}

/**
 * Nota de contexto que abre cada vista del módulo (regla de negocio, alcance).
 * Estaba copiada con su `style` inline en las cuatro páginas; aquí además
 * parte las palabras largas, que en 360px se salían de la tarjeta.
 */
export function ModuleNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="text-sm p-2.5 rounded-r-xl"
      style={{
        background: "color-mix(in srgb, var(--c-orange) 9%, var(--surface))",
        borderLeft: "3px solid var(--c-orange)",
        overflowWrap: "anywhere"
      }}
    >
      {children}
    </div>
  );
}

/**
 * Encabezado de tarjeta: título y acción en la primera línea, chips debajo.
 *
 * Antes todo iba en un único `flex-wrap` y el título llevaba `grow`: en móvil
 * se quedaba con el ancho sobrante de la primera línea —a veces dos palabras—
 * y los chips caían desordenados alrededor del botón "Editar". Separar las dos
 * filas hace que el título siempre mande y que los chips se envuelvan entre
 * ellos, no contra el título.
 */
export function CardHeader({ title, meta, action }: { title: ReactNode; meta?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <b className="grow min-w-0" style={{ overflowWrap: "anywhere" }}>
          {title}
        </b>
        {action && <span className="flex-shrink-0">{action}</span>}
      </div>
      {meta && <div className="flex items-center gap-1.5 flex-wrap">{meta}</div>}
    </div>
  );
}

/** Cabecera de sección: "Título" + acción, sin que la acción se estruje. */
export function SectionHeader({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="font-bold min-w-0" style={{ overflowWrap: "anywhere" }}>
        {children}
      </h3>
      {action && <span className="flex-shrink-0">{action}</span>}
    </div>
  );
}

/**
 * Pie de formulario. En móvil "Guardar" ocupa toda su línea —es la acción que
 * el pulgar busca a ciegas— y "Eliminar" cae al final, lejos de ella; desde
 * `sm` vuelve a ser la fila de siempre con Eliminar a la izquierda.
 */
export function FormActions({
  pending,
  onCancel,
  onDelete,
  saveLabel = "Guardar"
}: {
  pending: boolean;
  onCancel: () => void;
  onDelete?: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="flex flex-col-reverse sm:flex-row sm:items-center gap-2 mt-1">
      {onDelete && (
        <button type="button" className="btn-danger btn-sm w-full sm:w-auto" disabled={pending} onClick={onDelete}>
          Eliminar
        </button>
      )}
      <span className="hidden sm:block grow" />
      <div className="flex gap-2">
        <button type="button" className="btn-ghost btn-sm grow sm:grow-0" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn-primary btn-sm grow sm:grow-0" disabled={pending}>
          {pending ? "\u2026" : saveLabel}
        </button>
      </div>
    </div>
  );
}

/** Campo con su etiqueta encima: en un panel angosto la etiqueta al lado no cabe. */
export function Field({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`text-xs flex flex-col gap-1 ${className}`} style={{ color: "var(--muted)" }}>
      {label}
      {children}
    </label>
  );
}
