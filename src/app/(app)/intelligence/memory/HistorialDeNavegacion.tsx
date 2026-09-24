"use client";
// El historial de por dónde navegas, y el botón para borrarlo (D-185).
//
// Vive junto a la memoria y no en Configuración a propósito: las dos cosas son
// «lo que el sistema cree saber de ti», y tenerlas en pantallas distintas haría
// que quien viene a borrar una no supiera que existe la otra.

import { useState, useTransition } from "react";
import { borrarHistorialDeNavegacion } from "@/lib/comando/visitas";
import { Card, Chip } from "@/components/ui";

export default function HistorialDeNavegacion({ visitas, desde }: { visitas: number; desde: string | null }) {
  const [borrado, setBorrado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, startTransition] = useTransition();

  function borrar() {
    startTransition(async () => {
      const r = await borrarHistorialDeNavegacion();
      if (!r.ok) {
        setError(r.reason ?? "No se pudo borrar.");
        return;
      }
      setBorrado(true);
      setConfirmando(false);
    });
  }

  return (
    <Card>
      <div className="flex items-center gap-2 flex-wrap">
        <Chip kind="info">por dónde navegas</Chip>
        {borrado && <Chip kind="ok">borrado</Chip>}
      </div>

      <p className="text-sm mt-1.5">
        {borrado || visitas === 0
          ? "No hay nada guardado sobre por dónde navegas."
          : `${visitas} ${visitas === 1 ? "visita guardada" : "visitas guardadas"}${desde ? `, desde el ${desde}` : ""}.`}
      </p>

      {/* Se dice PARA QUÉ sirve antes de ofrecer borrarlo: un botón de borrar
          sobre un dato cuyo propósito no se explica invita a borrarlo siempre. */}
      <p className="text-xs mt-1" style={{ color: "var(--muted)" }}>
        Sirve para que el centro te ofrezca lo que sueles mirar a cada hora. Solo se guardan la ruta, la franja del día
        y la fecha. Se olvida solo pasados treinta días.
      </p>

      {!borrado && visitas > 0 && (
        <div className="flex gap-2 mt-2 flex-wrap">
          {confirmando ? (
            <>
              <button className="btn-primary btn-sm" disabled={pendiente} onClick={borrar}>
                Sí, borrar todo
              </button>
              <button className="btn-ghost btn-sm" disabled={pendiente} onClick={() => setConfirmando(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button className="btn-ghost btn-sm" onClick={() => setConfirmando(true)}>
              Borrar el historial
            </button>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs mt-1.5" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </Card>
  );
}
