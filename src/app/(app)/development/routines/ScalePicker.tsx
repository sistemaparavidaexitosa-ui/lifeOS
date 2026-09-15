"use client";

/**
 * Escala de 1 a 5 con botones, anulable: tocar el valor elegido lo quita.
 *
 * Botones y no un `<input type="range">` porque el ánimo no es continuo y un
 * deslizador obliga a apuntar; en el teléfono cinco dianas de 40px se aciertan
 * con el pulgar sin mirar. Anulable porque «no lo sé» es una respuesta honesta,
 * y forzar un 3 ensucia justo los datos de los que luego se sacan patrones.
 */
export default function ScalePicker({
  label,
  value,
  onChange,
  hints
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  /** Qué significan los extremos, p. ej. ["Agotado", "A tope"]. */
  hints: [string, string];
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-xs font-semibold mb-1" style={{ color: "var(--muted)" }}>
        {label}
      </legend>
      <div className="flex gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => {
          const activo = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={activo}
              onClick={() => onChange(activo ? null : n)}
              className="grow rounded-xl text-sm font-semibold"
              style={{
                minHeight: 40,
                border: `1px solid ${activo ? "var(--accent)" : "var(--line)"}`,
                background: activo ? "color-mix(in srgb, var(--accent) 16%, var(--surface))" : "var(--surface)",
                color: activo ? "var(--accent)" : "inherit"
              }}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px]" style={{ color: "var(--muted)" }}>
        <span>{hints[0]}</span>
        <span>{hints[1]}</span>
      </div>
    </fieldset>
  );
}
