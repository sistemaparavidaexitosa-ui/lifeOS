"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { acceptInvitation } from "./actions";

export default function AcceptButton({ token }: { token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className="btn-primary"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await acceptInvitation(token);
            if (result.ok) {
              // /workspaces ya no existe como pantalla: los espacios viven
              // dentro de Proyectos y Tareas. Aterrizar directamente en la
              // cartera del espacio recién aceptado es además lo que el
              // invitado espera ver — sus proyectos, no una lista de equipos.
              router.push(result.workspaceId ? `/execution?ws=${result.workspaceId}` : "/execution");
            } else {
              setError(result.message);
            }
          })
        }
      >
        {pending ? "Aceptando…" : "Aceptar invitación"}
      </button>
      {error && (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
