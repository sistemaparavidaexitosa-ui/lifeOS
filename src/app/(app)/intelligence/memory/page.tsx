import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, Chip, EmptyState } from "@/components/ui";
import { todayLocal } from "@/lib/data/dates";
import { getUserTimeZone } from "@/lib/data/profile";
import { isExpired, type MemoryItemLike, type MemoryScope } from "@/lib/domain/insights/memory.ts";
import MemoryForm from "./MemoryForm";

const SCOPE_LABEL: Record<MemoryScope, string> = {
  goal: "Meta",
  project: "Proyecto",
  finance: "Finanzas",
  decision: "Decisión",
  preference: "Preferencia",
  time: "Tiempo",
  habit: "Hábito"
};

/**
 * Memoria editable (§6). Es lo que separa un motor genérico de uno que conoce
 * al usuario: sin ella sugerirá indefinidamente cosas que ya fueron decididas.
 * Todo lo de aquí es visible, editable y borrable a propósito.
 */
export default async function MemoryPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const today = todayLocal(await getUserTimeZone());
  const { data: items } = await supabase.from("memory_items").select("*").order("created_at", { ascending: false });

  const rows: MemoryItemLike[] = (items ?? []).map((m) => ({
    id: m.id,
    scope: m.scope as MemoryScope,
    origin: m.origin as MemoryItemLike["origin"],
    text: m.text,
    validUntil: m.valid_until
  }));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="text-sm p-2.5 rounded-r-xl" style={{ background: "color-mix(in srgb, var(--c-teal) 9%, var(--surface))", borderLeft: "3px solid var(--c-teal)" }}>
        Lo que anotes aquí entra en cada análisis: <i>&quot;no trabajo sábados&quot;</i>, <i>&quot;quiero liquidar la tarjeta antes
        de diciembre&quot;</i>, <i>&quot;no me sugieras despertarme más temprano&quot;</i>. Una nota con fecha caduca sola.
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-bold">Memoria</h3>
        <div className="flex gap-2">
          <Link className="btn-ghost btn-sm" href="/intelligence">
            Recomendaciones
          </Link>
          <MemoryForm />
        </div>
      </div>

      {!rows.length && (
        <Card>
          <EmptyState icon="🧠" text="Sin notas todavía. El motor solo sabe lo que puede calcular de tus datos." />
        </Card>
      )}

      {rows.map((m) => {
        const caducada = isExpired(m, today);
        return (
          <Card key={m.id}>
            <div className="flex items-center gap-2 flex-wrap">
              <Chip kind="info">{SCOPE_LABEL[m.scope]}</Chip>
              {m.origin === "ai" && <Chip kind="purple">la escribió el motor</Chip>}
              {caducada && <Chip kind="bad">caducada</Chip>}
              {m.validUntil && !caducada && (
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  vigente hasta {m.validUntil}
                </span>
              )}
            </div>
            <p className="text-sm mt-1.5" style={{ textDecoration: caducada ? "line-through" : undefined }}>
              {m.text}
            </p>
            <MemoryForm item={{ id: m.id, scope: m.scope, text: m.text, validUntil: m.validUntil }} />
          </Card>
        );
      })}
    </div>
  );
}
