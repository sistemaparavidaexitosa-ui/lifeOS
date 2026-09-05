"use client";

import { useEffect, useState, useTransition } from "react";
import { activarPush, desactivarPush, estadoPush, type EstadoPush } from "@/lib/push/client";
import { sendTestPush } from "@/lib/push/actions";

/**
 * Activar las notificaciones en ESTE dispositivo.
 *
 * «Este dispositivo» no es un detalle de redacción: la suscripción es del
 * navegador, no de la cuenta. Quien active en el teléfono seguirá sin recibir
 * nada en el portátil, y decirlo aquí evita el reporte de «me llegan a veces».
 */
export default function PushNotifications() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // El estado solo se puede saber en el cliente (permiso del navegador,
  // suscripción existente, si iOS está instalado). `null` mientras tanto: un
  // botón que cambia de texto al hidratar parpadea en cada carga.
  useEffect(() => {
    void estadoPush().then(setEstado);
  }, []);

  function refrescar() {
    void estadoPush().then(setEstado);
  }

  if (estado === null) return <p className="text-xs" style={{ color: "var(--muted)" }}>Comprobando este dispositivo…</p>;

  if (estado === "ios-sin-instalar") {
    return (
      <div>
        <p className="text-sm mb-2">
          En iPhone y iPad, las notificaciones solo funcionan si añades Life OS a la pantalla de inicio. Es un
          límite de iOS, no de la app.
        </p>
        <ol className="text-sm" style={{ color: "var(--muted)", paddingLeft: 18, listStyle: "decimal" }}>
          <li>Toca el botón Compartir de Safari.</li>
          <li>Elige «Añadir a pantalla de inicio».</li>
          <li>Abre Life OS desde el icono nuevo y vuelve aquí.</li>
        </ol>
      </div>
    );
  }

  if (estado === "no-soportado") {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Este navegador no admite notificaciones push. Prueba con Chrome en Android o instalando la app en iPhone.
      </p>
    );
  }

  if (estado === "bloqueado") {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Bloqueaste las notificaciones en este navegador. Para reactivarlas hay que hacerlo desde sus ajustes de
        sitio: desde aquí ya no se puede volver a preguntar.
      </p>
    );
  }

  return (
    <div>
      <p className="text-sm mb-2">
        {estado === "activo"
          ? "Este dispositivo recibe avisos de menciones, tareas asignadas, recordatorios y vencimientos."
          : "Recibe un aviso cuando te mencionen, te asignen una tarea o venza algo, aunque no tengas la app abierta."}
      </p>

      <div className="flex gap-1.5 flex-wrap">
        {estado === "activo" ? (
          <>
            <button
              className="btn-ghost btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await sendTestPush();
                  // Se reporta SIEMPRE el resultado real. Decir «enviada»
                  // cuando no salió es justo lo que hace que alguien confíe en
                  // un aviso que nunca va a llegar (D-021).
                  setMensaje(r.ok ? "Enviada. Debería sonar en un momento." : (r.reason ?? "No se pudo enviar."));
                })
              }
            >
              Enviar una de prueba
            </button>
            <button
              className="btn-ghost btn-sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await desactivarPush();
                  setMensaje(r.ok ? "Desactivadas en este dispositivo." : (r.reason ?? "No se pudo desactivar."));
                  refrescar();
                })
              }
            >
              Desactivar aquí
            </button>
          </>
        ) : (
          <button
            className="btn-sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await activarPush();
                setMensaje(r.ok ? "Listo: este dispositivo ya recibe avisos." : (r.reason ?? "No se pudo activar."));
                refrescar();
              })
            }
          >
            Activar en este dispositivo
          </button>
        )}
      </div>

      {mensaje && (
        <p className="text-xs" style={{ marginTop: 8, color: "var(--muted)" }}>
          {mensaje}
        </p>
      )}

      {/*
        Dicho aquí y no solo en la documentación: son límites de la plataforma
        web que la gente descubriría a base de esperar un sonido que no llega.
      */}
      <p className="text-xs" style={{ marginTop: 8, color: "var(--muted)" }}>
        Suena con el tono de notificación del sistema; el tono se cambia desde los ajustes del teléfono, no desde
        aquí. No hay alarma insistente, y con No Molestar activado el aviso espera.
      </p>
    </div>
  );
}
