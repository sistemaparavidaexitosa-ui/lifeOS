"use client";

import { registrarSeccion, type PropsDeSeccion } from "../registro";

/**
 * `emptyState` y `error` comparten forma y no significado: vacío es «esto aún
 * no sabe llenarse», error es «sabía y esta vez no pudo». Dos componentes para
 * que el CSS —y quien lea— los distinga.
 */
export function SeccionVacia({ data, title }: PropsDeSeccion<"emptyState">) {
  return (
    <div className="rt-bloque">
      {title && <h2 className="rt-bloque-titulo">{title}</h2>}
      <p className="rt-vacio">{data.mensaje}</p>
    </div>
  );
}

export function SeccionError({ data, title }: PropsDeSeccion<"error">) {
  return (
    <div className="rt-bloque">
      {title && <h2 className="rt-bloque-titulo">{title}</h2>}
      <p className="rt-vacio rt-vacio-error" role="status">
        {data.mensaje}
      </p>
    </div>
  );
}

registrarSeccion("emptyState", SeccionVacia);
registrarSeccion("error", SeccionError);
