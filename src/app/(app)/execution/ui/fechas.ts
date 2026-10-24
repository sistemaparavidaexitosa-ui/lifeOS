import { fcorta } from "@/lib/format";
import { diffDays } from "@/lib/domain/datetime.ts";

/**
 * Una fecha dicha como se dice en voz alta: «hoy», «mañana», «vie» dentro de
 * la semana, y «15 nov» más allá. Lo vencido también se cuenta en días.
 */
export function fechaRelativa(iso: string, hoy: string): string {
  const d = diffDays(hoy, iso);
  if (d === 0) return "hoy";
  if (d === 1) return "mañana";
  if (d === -1) return "ayer";
  if (d > 1 && d < 7) {
    return new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`)).replace(".", "");
  }
  return fcorta(iso, hoy);
}
