"use client";
// Conmutador de vistas de la biblioteca.
//
// La vista viaja en `?por=` y no en estado de cliente: así el enlace es
// compartible, el botón de atrás del teléfono hace lo que se espera, y el
// Server Component agrupa en el servidor en vez de mandar los tres
// agrupamientos y esconder dos.
//
// Usa `.seg`, un control segmentado NEUTRO, y no `.ex-tab`. El prefijo `.ex-`
// era de Ejecución y se fue colando en otros módulos hasta dejar de significar
// nada; esto empieza a devolverle su sitio en vez de agrandar el problema.
import Link from "next/link";

export type LibraryView = "estado" | "categoria" | "todos" | "plan";

const VISTAS: { value: LibraryView; label: string }[] = [
  { value: "estado", label: "Por estado" },
  { value: "categoria", label: "Por categoría" },
  // "Plan" agrupa por SEMANA en vez de por un atributo del libro: es la única
  // vista que contesta "¿qué toca ahora?" en lugar de "¿qué tengo?".
  { value: "plan", label: "Plan" },
  { value: "todos", label: "Todos" }
];

export default function LibraryViews({ view }: { view: LibraryView }) {
  return (
    <div className="seg" role="tablist" aria-label="Cómo agrupar la biblioteca">
      {VISTAS.map((v) => (
        <Link
          key={v.value}
          href={v.value === "estado" ? "/development/library" : `/development/library?por=${v.value}`}
          className={`seg-item${view === v.value ? " active" : ""}`}
          role="tab"
          aria-selected={view === v.value}
        >
          {v.label}
        </Link>
      ))}
    </div>
  );
}
