"use client";
// Editor de una nota.
//
// DECISIONES DE MÓVIL (aquí es donde se van a escribir las notas de verdad):
//
//  1. Es una PANTALLA, no un panel lateral. El drawer del tablero sube al
//     92dvh y con el teclado del iPhone abierto deja poco más de 200px útiles.
//  2. NO hay botón de guardar. Guarda solo: al parar de escribir, al perder el
//     foco y —lo más importante— cuando la pestaña deja de verse. En iOS,
//     bloquear el teléfono o cambiar de app puede congelar o descartar la
//     página: sin ese último anzuelo se pierde justo lo último escrito.
//  3. El textarea crece con su contenido. `field-sizing: content` todavía no
//     está en Safari, así que se ajusta a mano por scrollHeight. Un textarea
//     con scroll propio dentro de una página que también scrollea es de lo
//     peor que se puede tocar con el pulgar.
//  4. Las acciones van ARRIBA. Una barra fija abajo pelea con el teclado y con
//     la barra de gestos del iPhone.
//  5. El cuerpo lleva autocapitalize/autocorrect/spellcheck: se escribe prosa,
//     no identificadores.
//
// CONCURRENCIA
// La nota es una página colaborativa. `saveNote` guarda con
// `where version = $esperada`; si alguien se adelantó, la acción NO pisa su
// texto y devuelve quién fue. Entonces este editor se BLOQUEA en vez de seguir
// reintentando: lo que hay en pantalla sigue siendo tuyo y se puede copiar.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteNote, saveNote } from "./actions";
import { noteDisplayTitle } from "@/lib/domain/notes/markup.ts";
import NoteBody from "./NoteBody";
import { fdatetime } from "@/lib/format";

const RETARDO_MS = 1200;

type Estado = "limpio" | "sucio" | "guardando" | "guardado" | "conflicto" | "error";

export interface EditableNote {
  id: string;
  title: string;
  body: string;
  version: number;
  createdByName: string;
  createdAt: string;
  updatedByName: string;
  updatedAt: string;
}

export default function NoteEditor({
  note,
  backHref,
  notebookTitle,
  canWrite
}: {
  note: EditableNote;
  backHref: string;
  notebookTitle: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [estado, setEstado] = useState<Estado>("limpio");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [firma, setFirma] = useState({ name: note.updatedByName, at: note.updatedAt });
  const [leyendo, setLeyendo] = useState(false);

  // En refs y no en estado: los usa el guardado diferido, y no queremos
  // recrear el temporizador en cada tecla.
  const versionRef = useRef(note.version);
  const pendienteRef = useRef<{ title: string; body: string } | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bloqueadoRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const guardar = useCallback(async () => {
    const pendiente = pendienteRef.current;
    // Un conflicto bloquea: seguir mandando reintentos solo repetiría el aviso
    // y podría acabar pisando el texto de la otra persona.
    if (!pendiente || bloqueadoRef.current) return;

    pendienteRef.current = null;
    setEstado("guardando");

    const result = await saveNote(note.id, pendiente.title, pendiente.body, versionRef.current);

    if (result.ok && result.version) {
      versionRef.current = result.version;
      setFirma({ name: result.updatedByName ?? "", at: result.updatedAt ?? new Date().toISOString() });
      setEstado(pendienteRef.current ? "sucio" : "guardado");
      setMensaje(null);
      return;
    }

    if (result.conflict) {
      bloqueadoRef.current = true;
      setEstado("conflicto");
    } else {
      setEstado("error");
    }
    setMensaje(result.reason ?? "No se pudo guardar.");
  }, [note.id]);

  const programar = useCallback(
    (next: { title: string; body: string }) => {
      if (!canWrite || bloqueadoRef.current) return;
      pendienteRef.current = next;
      setEstado("sucio");
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => void guardar(), RETARDO_MS);
    },
    [canWrite, guardar]
  );

  // El anzuelo que evita perder lo escrito en iOS: al ocultarse la pestaña
  // (bloquear el teléfono, cambiar de app, cerrar) se guarda ya, sin esperar
  // al temporizador. `visibilitychange` es el único de los tres eventos
  // (`beforeunload`, `pagehide`, este) en el que Safari móvil es fiable.
  useEffect(() => {
    function alOcultarse() {
      if (document.visibilityState === "hidden") {
        if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
        void guardar();
      }
    }
    document.addEventListener("visibilitychange", alOcultarse);
    return () => {
      document.removeEventListener("visibilitychange", alOcultarse);
      // Al desmontar (navegar a otra nota) también hay que vaciar lo pendiente.
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      void guardar();
    };
  }, [guardar]);

  // Alto del textarea = alto de su contenido.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [body, leyendo]);

  const encabezado = noteDisplayTitle(title, body);

  return (
    <>
      <nav className="nb-crumbs" aria-label="Ruta">
        <Link href={backHref} className="nb-crumb-back">
          ← {notebookTitle}
        </Link>
        <span className="nb-crumb-sep">/</span>
        <span className="nb-crumb-current">{encabezado}</span>
      </nav>

      <div className="nb-editor">
        <div className="nb-editor-bar">
          <EstadoGuardado estado={estado} canWrite={canWrite} />
          <span className="nb-bar-spacer" />
          <button
            type="button"
            className={`ex-tab${leyendo ? " active" : ""}`}
            onClick={() => setLeyendo((v) => !v)}
            aria-pressed={leyendo}
          >
            {leyendo ? "Editando" : "Vista"}
          </button>
          {canWrite && (
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={() => {
                if (!window.confirm("¿Eliminar esta nota? No se puede deshacer.")) return;
                void deleteNote(note.id).then((result) => {
                  if (!result.ok) {
                    setEstado("error");
                    setMensaje(result.reason ?? "No se pudo eliminar.");
                    return;
                  }
                  router.push(backHref);
                  router.refresh();
                });
              }}
            >
              Eliminar
            </button>
          )}
        </div>

        {mensaje && (
          <div className="ex-alert" role="alert">
            {mensaje}
          </div>
        )}

        {leyendo ? (
          <article className="nb-read">
            <h2 className="nb-read-title">{encabezado}</h2>
            <NoteBody body={body} />
          </article>
        ) : (
          <>
            <input
              className="nb-title-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                programar({ title: e.target.value, body });
              }}
              onBlur={() => void guardar()}
              placeholder="Título de la nota"
              aria-label="Título de la nota"
              readOnly={!canWrite}
              autoCapitalize="sentences"
              enterKeyHint="next"
            />
            <textarea
              ref={textareaRef}
              className="nb-body-input"
              value={body}
              onChange={(e) => {
                setBody(e.target.value);
                programar({ title, body: e.target.value });
              }}
              onBlur={() => void guardar()}
              placeholder={"Escribe aquí…\n\n# Título   ## Subtítulo\n- viñeta      1. numerada\n**negrita**  *cursiva*  `código`\n> cita"}
              aria-label="Cuerpo de la nota"
              readOnly={!canWrite}
              autoCapitalize="sentences"
              autoCorrect="on"
              spellCheck
              rows={12}
            />
          </>
        )}

        <p className="nb-signature">
          Creada por <b>{note.createdByName || "alguien"}</b> el {fdatetime(note.createdAt)}
          {firma.name && (
            <>
              {" · "}Última edición de <b>{firma.name}</b> el {fdatetime(firma.at)}
            </>
          )}
        </p>

        {!canWrite && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Tu rol en este espacio es de solo lectura: puedes leer las notas, no modificarlas.
          </p>
        )}
      </div>
    </>
  );
}

function EstadoGuardado({ estado, canWrite }: { estado: Estado; canWrite: boolean }) {
  if (!canWrite) return <span className="nb-status">Solo lectura</span>;

  const texto: Record<Estado, string> = {
    limpio: "Guardado ✓",
    sucio: "Sin guardar",
    guardando: "Guardando…",
    guardado: "Guardado ✓",
    conflicto: "No guardado",
    error: "No guardado"
  };

  return (
    <span className={`nb-status ${estado}`} role="status" aria-live="polite">
      {texto[estado]}
    </span>
  );
}
