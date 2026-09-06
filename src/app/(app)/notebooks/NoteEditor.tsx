"use client";
// Editor de una nota, con formato en vivo.
//
// DECISIONES DE MÓVIL (D-040, intactas):
//
//  1. Es una PANTALLA, no un panel lateral. El drawer del tablero sube al
//     92dvh y con el teclado del iPhone abierto deja poco más de 200px útiles.
//  2. NO hay botón de guardar. Guarda solo: al parar de escribir, al perder el
//     foco y —lo más importante— cuando la pestaña deja de verse. En iOS,
//     bloquear el teléfono o cambiar de app puede congelar o descartar la
//     página: sin ese último anzuelo se pierde justo lo último escrito.
//  3. Las ACCIONES van arriba. La barra de FORMATO va abajo, anclada sobre el
//     teclado: actúa sobre la selección y tiene que estar donde está el pulgar.
//     Excepción acotada a D-040, no su derogación.
//
// EL VOLCADO ANTES DE GUARDAR
// El bloque enfocado es un contenteditable NO controlado, así que el modelo va
// un paso por detrás del DOM mientras se escribe. Antes de serializar hay que
// leer el DOM de esa línea. En `visibilitychange` sobre todo: si bloqueas el
// teléfono a media palabra, sin ese volcado se pierde exactamente lo último
// tecleado — el escenario que D-040 existe para proteger.
//
// CONCURRENCIA
// `saveNote` guarda con `where version = $esperada`; si alguien se adelantó, la
// acción NO pisa su texto y devuelve quién fue. Entonces el documento se pone
// en solo lectura: lo que hay en pantalla sigue siendo tuyo y se puede copiar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteNote, saveNote } from "./actions";
import { noteDisplayTitle, serializeNote, type Block } from "@/lib/domain/notes/markup.ts";
import {
  applyMark,
  bloquesEditables,
  hasMark,
  plainLength,
  setBlockStyle,
  sliceInlines,
  styleOf,
  textoDeBloque,
  type BlockStyle,
  type MarcaInline
} from "@/lib/domain/notes/edit.ts";
import NoteDoc, { conLinea, type Cursor } from "./NoteDoc";
import { leerDom } from "./EditableLine";
import NoteBody from "./NoteBody";
import FormatBar from "./FormatBar";
import { fdatetime } from "@/lib/format";

const RETARDO_MS = 1200;
// Escribir seguido no genera una entrada por tecla; se agrupa por pausa.
const AGRUPAR_MS = 500;
// 50 y no ilimitada: una nota larga con instantáneas sin tope es una fuga de
// memoria en un teléfono.
const MAX_HISTORIA = 50;

type Estado = "limpio" | "sucio" | "guardando" | "guardado" | "conflicto" | "error";

interface Instantanea {
  blocks: Block[];
  cursor: Cursor;
}

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

const MARCAS_POSIBLES: MarcaInline[] = ["bold", "italic", "underline", "strike", "code"];

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
  const [blocks, setBlocks] = useState<Block[]>(() => bloquesEditables(note.body));
  const [cursor, setCursor] = useState<Cursor>({ block: 0, item: 0, start: 0, end: 0 });
  const [estado, setEstado] = useState<Estado>("limpio");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [firma, setFirma] = useState({ name: note.updatedByName, at: note.updatedAt });

  // En refs y no sólo en estado: los usa el guardado diferido y la pila de
  // deshacer, y no queremos recrear el temporizador en cada tecla.
  const versionRef = useRef(note.version);
  const blocksRef = useRef<Block[]>(blocks);
  const tituloRef = useRef(title);
  const cursorRef = useRef<Cursor>(cursor);
  const guardadoRef = useRef({ title: note.title, body: note.body });
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bloqueadoRef = useRef(false);
  const docRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    blocksRef.current = blocks;
  }, [blocks]);
  useEffect(() => {
    tituloRef.current = title;
  }, [title]);
  useEffect(() => {
    cursorRef.current = cursor;
  }, [cursor]);

  // ── Deshacer ───────────────────────────────────────────────────────────
  const pasado = useRef<Instantanea[]>([]);
  const futuro = useRef<Instantanea[]>([]);
  const ultimoApunte = useRef(0);
  const [profundidad, setProfundidad] = useState({ atras: 0, adelante: 0 });

  const apuntar = useCallback((anteriores: Block[], anteriorCursor: Cursor) => {
    const ahora = Date.now();
    // Dentro de la ventana de agrupación no se apila otra entrada: así ⌘Z
    // deshace una palabra, no una letra.
    if (ahora - ultimoApunte.current < AGRUPAR_MS && pasado.current.length) {
      ultimoApunte.current = ahora;
      return;
    }
    ultimoApunte.current = ahora;
    pasado.current = [...pasado.current, { blocks: anteriores, cursor: anteriorCursor }].slice(
      -MAX_HISTORIA
    );
    futuro.current = [];
    setProfundidad({ atras: pasado.current.length, adelante: 0 });
  }, []);

  // ── Guardado ───────────────────────────────────────────────────────────
  /** Lee del DOM la línea enfocada: el modelo puede ir una tecla por detrás. */
  const volcarBloqueEnfocado = useCallback((actuales: Block[]): Block[] => {
    const el = docRef.current?.querySelector<HTMLElement>(".nb-line:focus");
    if (!el) return actuales;
    const { block, item } = cursorRef.current;
    const bloque = actuales[block];
    if (!bloque) return actuales;
    return actuales.map((b, i) => (i === block ? conLinea(b, item, leerDom(el)) : b));
  }, []);

  const guardar = useCallback(async () => {
    // Un conflicto bloquea: seguir mandando reintentos sólo repetiría el aviso
    // y podría acabar pisando el texto de la otra persona.
    if (!canWrite || bloqueadoRef.current) return;

    const frescos = volcarBloqueEnfocado(blocksRef.current);
    if (frescos !== blocksRef.current) {
      blocksRef.current = frescos;
      setBlocks(frescos);
    }
    const body = serializeNote(frescos);
    const tituloActual = tituloRef.current;
    if (body === guardadoRef.current.body && tituloActual === guardadoRef.current.title) {
      setEstado("guardado");
      return;
    }

    setEstado("guardando");
    const result = await saveNote(note.id, tituloActual, body, versionRef.current);

    if (result.ok && result.version) {
      versionRef.current = result.version;
      guardadoRef.current = { title: tituloActual, body };
      setFirma({
        name: result.updatedByName ?? "",
        at: result.updatedAt ?? new Date().toISOString()
      });
      setEstado("guardado");
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
  }, [canWrite, note.id, volcarBloqueEnfocado]);

  const programar = useCallback(() => {
    if (!canWrite || bloqueadoRef.current) return;
    setEstado("sucio");
    if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    temporizadorRef.current = setTimeout(() => void guardar(), RETARDO_MS);
  }, [canWrite, guardar]);

  // El anzuelo que evita perder lo escrito en iOS: al ocultarse la pestaña
  // (bloquear el teléfono, cambiar de app, cerrar) se guarda ya, sin esperar al
  // temporizador. `visibilitychange` es el único de los tres eventos en el que
  // Safari móvil es fiable.
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
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      void guardar();
    };
  }, [guardar]);

  // ── Mutación única ─────────────────────────────────────────────────────
  // TODA mutación de `blocks` pasa por aquí, incluido lo que se escribe: si esa
  // vía no apunta en la pila, deshacer no deshace nada.
  const cambiar = useCallback(
    (siguientes: Block[], siguienteCursor?: Cursor) => {
      apuntar(blocksRef.current, cursorRef.current);
      blocksRef.current = siguientes;
      setBlocks(siguientes);
      if (siguienteCursor) {
        cursorRef.current = siguienteCursor;
        setCursor(siguienteCursor);
      }
      programar();
    },
    [apuntar, programar]
  );

  const deshacer = useCallback(() => {
    const previa = pasado.current[pasado.current.length - 1];
    if (!previa) return;
    pasado.current = pasado.current.slice(0, -1);
    futuro.current = [{ blocks: blocksRef.current, cursor: cursorRef.current }, ...futuro.current];
    blocksRef.current = previa.blocks;
    cursorRef.current = previa.cursor;
    setBlocks(previa.blocks);
    setCursor(previa.cursor);
    setProfundidad({ atras: pasado.current.length, adelante: futuro.current.length });
    programar();
  }, [programar]);

  const rehacer = useCallback(() => {
    const siguiente = futuro.current[0];
    if (!siguiente) return;
    futuro.current = futuro.current.slice(1);
    pasado.current = [...pasado.current, { blocks: blocksRef.current, cursor: cursorRef.current }];
    blocksRef.current = siguiente.blocks;
    cursorRef.current = siguiente.cursor;
    setBlocks(siguiente.blocks);
    setCursor(siguiente.cursor);
    setProfundidad({ atras: pasado.current.length, adelante: futuro.current.length });
    programar();
  }, [programar]);

  useEffect(() => {
    function alPulsar(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) rehacer();
      else deshacer();
    }
    document.addEventListener("keydown", alPulsar);
    return () => document.removeEventListener("keydown", alPulsar);
  }, [deshacer, rehacer]);

  // ── Acciones de la barra ───────────────────────────────────────────────
  const bloqueActual = blocks[cursor.block];

  const marcasActivas = useMemo<MarcaInline[]>(() => {
    if (!bloqueActual || cursor.start === cursor.end) return [];
    const linea = textoDeBloque(bloqueActual)[cursor.item] ?? [];
    return MARCAS_POSIBLES.filter((m) => hasMark(linea, cursor.start, cursor.end, m));
  }, [bloqueActual, cursor]);

  function aplicarMarca(marca: MarcaInline) {
    if (!bloqueActual || cursor.start === cursor.end) return;
    const linea = textoDeBloque(bloqueActual)[cursor.item] ?? [];
    const marcada = applyMark(linea, cursor.start, cursor.end, marca);
    cambiar(
      blocks.map((b, i) => (i === cursor.block ? conLinea(b, cursor.item, marcada) : b)),
      cursor
    );
  }

  function aplicarEstilo(estiloNuevo: BlockStyle) {
    if (!bloqueActual) return;
    cambiar(
      blocks.map((b, i) => (i === cursor.block ? setBlockStyle(bloqueActual, estiloNuevo) : b)),
      { block: cursor.block, item: 0, start: 0, end: 0 }
    );
  }

  function ponerEnlace() {
    if (!bloqueActual || cursor.start === cursor.end) return;
    const destino = window.prompt("Dirección del enlace (https://…)");
    // El esquema se valida aquí y en el parser: un `javascript:` no se
    // construye ni por accidente ni a propósito.
    if (!destino || !/^https?:\/\//i.test(destino)) return;
    const linea = textoDeBloque(bloqueActual)[cursor.item] ?? [];
    const texto = sliceInlines(linea, cursor.start, cursor.end)
      .map((p) => p.text)
      .join("");
    const nueva = [
      ...sliceInlines(linea, 0, cursor.start),
      { kind: "link" as const, text: texto, href: destino },
      ...sliceInlines(linea, cursor.end, plainLength(linea))
    ];
    cambiar(
      blocks.map((b, i) => (i === cursor.block ? conLinea(b, cursor.item, nueva) : b)),
      cursor
    );
  }

  const cuerpo = serializeNote(blocks);
  const encabezado = noteDisplayTitle(title, cuerpo);
  const enConflicto = estado === "conflicto";

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

        {canWrite ? (
          <div ref={docRef}>
            <input
              className="nb-title-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                tituloRef.current = e.target.value;
                programar();
              }}
              onBlur={() => void guardar()}
              placeholder="Título de la nota"
              aria-label="Título de la nota"
              readOnly={enConflicto}
              autoCapitalize="sentences"
              enterKeyHint="next"
            />
            <NoteDoc
              blocks={blocks}
              cursor={cursor}
              readOnly={enConflicto}
              onCursor={setCursor}
              onChange={(siguientes, cur) => cambiar(siguientes, cur)}
            />
            {!enConflicto && (
              <FormatBar
                estilo={bloqueActual ? styleOf(bloqueActual) : "body"}
                marcasActivas={marcasActivas}
                onEstilo={aplicarEstilo}
                onMarca={aplicarMarca}
                onEnlace={ponerEnlace}
                onTabla={() => aplicarEstilo("table")}
                onDeshacer={deshacer}
                onRehacer={rehacer}
                puedeDeshacer={profundidad.atras > 0}
                puedeRehacer={profundidad.adelante > 0}
              />
            )}
          </div>
        ) : (
          <article className="nb-read">
            <h2 className="nb-read-title">{encabezado}</h2>
            <NoteBody body={cuerpo} />
          </article>
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
