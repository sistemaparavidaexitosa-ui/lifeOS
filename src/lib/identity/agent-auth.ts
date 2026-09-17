// src/lib/identity/agent-auth.ts
import "server-only";
import { NextResponse } from "next/server";
import { requireManifestationAgentSecret } from "@/config/env";
import { secretoValido } from "@/lib/api/secreto";

/**
 * La puerta de las rutas de `/api/agents/manifestation/*`.
 *
 * Corren SIN SESIÓN —quien llama es un servicio en otra máquina, no un
 * navegador—, así que lo único que las protege es el secreto. El middleware las
 * deja pasar explícitamente por eso mismo.
 *
 * ESTE SECRETO NO ES COMO EL DE pg_cron, aunque el mecanismo sea idéntico.
 * `PUSH_DISPATCH_SECRET` dispara trabajo; este DEVUELVE la identidad, la
 * visión, las reflexiones y los hechos de cualquier persona cuyo id se pida.
 * De ahí que sea otra variable, que cada lectura se audite y que haya un tope
 * diario: si un secreto puede leer la vida interior de cualquiera, la persona
 * tiene que poder ver cuándo se leyó la suya.
 */
export type Guardia = { ok: true; secreto: string } | { ok: false; respuesta: NextResponse };

export function comprobarSecretoDelAgente(request: Request): Guardia {
  let esperado: string;
  try {
    esperado = requireManifestationAgentSecret();
  } catch {
    // Sin secreto configurado la ruta no existe a efectos prácticos. 503 y no
    // 500: no está rota, está apagada — y el agente sabe distinguirlas.
    return { ok: false, respuesta: NextResponse.json({ ok: false, reason: "El agente no está configurado." }, { status: 503 }) };
  }

  if (!secretoValido(request.headers.get("x-agent-secret"), esperado)) {
    return { ok: false, respuesta: NextResponse.json({ ok: false, reason: "No autorizado" }, { status: 401 }) };
  }

  return { ok: true, secreto: esperado };
}
