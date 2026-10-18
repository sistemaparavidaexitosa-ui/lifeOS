"use client";

import { useTransition, useState } from "react";
import { toggleTheme } from "./actions";

/**
 * Apariencia (rediseño): negro por defecto, claro si la persona lo prefiere.
 * Se pinta al instante en <html> y la acción guarda cookie + perfil.
 */
export default function TemaSelector({ actual }: { actual: "light" | "dark" }) {
  const [tema, setTema] = useState(actual);
  const [, start] = useTransition();
  function elegir(t: "light" | "dark") {
    setTema(t);
    document.documentElement.dataset.theme = t;
    start(() => toggleTheme(t));
  }
  return (
    <div className="flex gap-1.5" role="radiogroup" aria-label="Tema">
      {(["dark", "light"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={tema === t}
          className={tema === t ? "btn-primary btn-sm" : "btn-ghost btn-sm"}
          onClick={() => elegir(t)}
        >
          {t === "dark" ? "Negro" : "Claro"}
        </button>
      ))}
    </div>
  );
}
