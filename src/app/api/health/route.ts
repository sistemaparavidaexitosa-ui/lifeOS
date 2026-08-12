import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Smoke check post-deploy (§8bis, DEPLOY.md paso 4). No requiere autenticación. */
export function GET() {
  return NextResponse.json({ status: "ok", time: new Date().toISOString() });
}
