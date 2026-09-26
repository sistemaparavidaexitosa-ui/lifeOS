"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { confirmarCambio, descartarCambio } from "@/lib/centro/escritura/confirmar";
import type { CampoDeTarjeta, ItemDeCambio } from "@/lib/domain/centro/runtime/secciones.ts";
import { registrarSeccion, type PropsDeSeccion } from "../registro";

type Estado = "pendiente" | "guardado" | "descartado";

/**
 * Cambios que el Centro propone (D-203). Nada existe hasta que la persona
 * pulsa Guardar; lo que se escribe es lo que el servidor validó al proponer,
 * más lo que la persona corrija aquí (que el servidor vuelve a validar).
 */
export default function SeccionPropuestaCambio({ data }: PropsDeSeccion<"propuestaCambio">) {
  const [estados, setEstados] = useState<Record<string, Estado>>({});
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [correcciones, setCorrecciones] = useState<Record<string, Record<string, string>>>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const pendientes = data.items.filter((it) => (estados[it.propuestaId] ?? "pendiente") === "pendiente");

  async function guardarUno(it: ItemDeCambio) {
    try {
      const r = await confirmarCambio(it.propuestaId, correcciones[it.propuestaId] ?? {});
      if (r.ok || r.yaGuardado) {
        setEstados((e) => ({ ...e, [it.propuestaId]: "guardado" }));
        setErrores((e) => ({ ...e, [it.propuestaId]: "" }));
      } else setErrores((e) => ({ ...e, [it.propuestaId]: r.reason ?? "No se pudo guardar." }));
    } catch {
      setErrores((e) => ({ ...e, [it.propuestaId]: "No se pudo guardar. Inténtalo de nuevo." }));
    }
  }

  function guardar(items: ItemDeCambio[]) {
    startTransition(async () => {
      // Uno a uno: no es transaccional entre tablas, y cada tarjeta dice lo suyo.
      for (const it of items) await guardarUno(it);
      router.refresh();
    });
  }

  function descartar(it: ItemDeCambio) {
    startTransition(async () => {
      await descartarCambio(it.propuestaId).catch(() => null);
      setEstados((e) => ({ ...e, [it.propuestaId]: "descartado" }));
    });
  }

  function corregir(it: ItemDeCambio, campo: string, valor: string) {
    setCorrecciones((c) => ({ ...c, [it.propuestaId]: { ...(c[it.propuestaId] ?? {}), [campo]: valor } }));
  }

  if (!pendientes.length && data.items.every((it) => estados[it.propuestaId] === "descartado")) return null;

  return (
    <div className="ag-card">
      {data.items.map((it) => {
        const estado = estados[it.propuestaId] ?? "pendiente";
        if (estado === "descartado") return null;
        const borrar = it.operacion === "borrar";
        return (
          <div key={it.propuestaId} className="ag-cambio">
            <h3 className="ag-card-titulo">
              {borrar ? "Borrar" : it.operacion === "crear" ? "Nueva" : "Cambiar"} · {it.etiquetaTabla}: {it.titulo}
            </h3>
            <dl>
              {it.campos.map((c) => (
                <Campo
                  key={c.campo}
                  c={c}
                  borrar={borrar}
                  editable={estado === "pendiente" && c.editable}
                  valor={correcciones[it.propuestaId]?.[c.campo]}
                  onChange={(v) => corregir(it, c.campo, v)}
                />
              ))}
            </dl>
            {errores[it.propuestaId] && <p className="ag-tono-bad">{errores[it.propuestaId]}</p>}
            {estado === "guardado" ? (
              <p className="ag-acciones">
                <span className="ag-tono-ok">{borrar ? "Borrado ✓" : "Guardado ✓"}</span>
              </p>
            ) : (
              <p className="ag-acciones">
                <button type="button" className={borrar ? "ag-boton-chico ag-tono-bad" : "ag-boton-chico"} disabled={pending} onClick={() => guardar([it])}>
                  {pending ? "…" : borrar ? "Borrar" : "Guardar"}
                </button>
                <button type="button" className="ag-boton-chico" disabled={pending} onClick={() => descartar(it)}>
                  Descartar
                </button>
              </p>
            )}
          </div>
        );
      })}
      {pendientes.filter((it) => it.operacion !== "borrar").length > 1 && (
        <p className="ag-acciones">
          <button type="button" className="ag-boton-chico" disabled={pending} onClick={() => guardar(pendientes.filter((it) => it.operacion !== "borrar"))}>
            Guardar todo
          </button>
        </p>
      )}
    </div>
  );
}

function Campo(p: { c: CampoDeTarjeta; borrar: boolean; editable: boolean; valor: string | undefined; onChange: (v: string) => void }) {
  const { c } = p;
  const actual = p.valor ?? c.despues ?? "";
  return (
    <>
      <dt className="ag-muted">{c.etiqueta}</dt>
      <dd>
        {c.antes !== null && !p.borrar && <s className="ag-muted">{c.antes}</s>}
        {c.antes !== null && !p.borrar && " → "}
        {p.borrar ? (
          <span className="ag-tono-bad">{c.antes}</span>
        ) : !p.editable ? (
          <b>{c.despues ?? "—"}</b>
        ) : c.tipo === "opcion" && c.opciones ? (
          <select value={actual} onChange={(e) => p.onChange(e.target.value)}>
            {c.opciones.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        ) : c.tipo === "texto" && (c.despues ?? "").length > 80 ? (
          <textarea value={actual} rows={4} onChange={(e) => p.onChange(e.target.value)} />
        ) : (
          <input
            type={c.tipo === "fecha" ? "date" : c.tipo === "numero" || c.tipo === "entero" ? "number" : "text"}
            value={actual}
            onChange={(e) => p.onChange(e.target.value)}
          />
        )}
      </dd>
    </>
  );
}

registrarSeccion("propuestaCambio", SeccionPropuestaCambio);
