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
              router.push(result.workspaceId ? `/workspaces?ws=${result.workspaceId}` : "/workspaces");
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
