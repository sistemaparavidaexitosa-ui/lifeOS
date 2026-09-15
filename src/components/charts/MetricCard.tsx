import { Card } from "@/components/ui";

/**
 * Tarjeta de un indicador: etiqueta, valor y, si hay, el cambio y una ayuda.
 *
 * El color del cambio dice si es bueno, no si sube: aquí subir siempre es
 * bueno, pero la tarjeta no lo supone — lo recibe. Y nunca va solo el color:
 * el signo y la palabra cargan el significado.
 */
export default function MetricCard({
  label,
  value,
  delta,
  hint
}: {
  label: string;
  value: string;
  /** Texto del cambio ya formateado, con su sentido. */
  delta?: { text: string; good: boolean | null };
  hint?: string;
}) {
  const color = delta?.good === true ? "var(--ok)" : delta?.good === false ? "var(--danger)" : "var(--muted)";
  return (
    <Card className="flex flex-col gap-1 min-w-0">
      <span className="text-xs font-semibold" style={{ color: "var(--muted)" }}>
        {label}
      </span>
      <span className="text-2xl font-bold leading-tight">{value}</span>
      {delta && (
        <span className="text-xs font-semibold" style={{ color }}>
          {delta.text}
        </span>
      )}
      {hint && (
        <span className="text-[11px] leading-snug" style={{ color: "var(--muted)" }}>
          {hint}
        </span>
      )}
    </Card>
  );
}
