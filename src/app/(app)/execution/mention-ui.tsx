"use client";
// Las dos piezas de una mención: cómo se PINTA y cómo se ESCRIBE.
//
// POR QUÉ ESTÁN AQUÍ Y NO DENTRO DEL HILO DE UNA TAREA
// Vivían dentro de TaskThreadPanel, que era el único sitio donde se comentaba.
// Al abrir el hilo del PROYECTO, copiarlas habría dejado dos implementaciones
// del mismo casado de nombres — exactamente lo que advierte la cabecera de
// domain/execution/mentions.ts: «una segunda implementación se desviaría».
//
// La lógica de casar sigue estando allí, pura y probada. Esto es solo su
// interfaz: un input que abre el roster tras el `@` y un cuerpo que pinta en
// negrita lo que resultó ser una persona.

import { useMemo, useRef, useState } from "react";
import { matchRoster, mentionQueryAt, splitBody, type RosterMember } from "@/lib/domain/execution/mentions.ts";
import MenuSurface from "@/components/MenuSurface";

/** El texto de un mensaje, con las menciones resueltas en negrita. */
export function CommentBody({ body, roster }: { body: string; roster: RosterMember[] }) {
  const segments = useMemo(() => splitBody(body, roster), [body, roster]);
  return (
    <>
      {segments.map((s, i) =>
        s.kind === "mention" ? (
          <span key={i} style={{ color: "var(--accent-d)", fontWeight: 800 }}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}

/**
 * El campo de escribir, con el menú de menciones anclado a sí mismo.
 *
 * Controlado desde fuera (`value`/`onChange`) porque quien envía es quien tiene
 * que vaciarlo, y solo él sabe si el envío salió bien.
 *
 * Cuántas mostrar: seis. Es lo que cabe sin que el menú tape el hilo, y con más
 * de seis lo que ayuda es seguir tecleando, no bajar por una lista.
 */
const MAX_CANDIDATOS = 6;

export function MentionComposer({
  roster,
  value,
  onChange,
  onSend,
  pending,
  placeholder = "Escribe un mensaje, usa @ para mencionar…",
  sendLabel = "Enviar"
}: {
  roster: RosterMember[];
  value: string;
  onChange: (next: string) => void;
  onSend: () => void;
  pending: boolean;
  placeholder?: string;
  sendLabel?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  // El menú se ancla al propio campo: nace justo debajo de donde se está
  // escribiendo, y MenuSurface se encarga de voltearlo si no cabe.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [query, setQuery] = useState<string | null>(null);

  const candidates = useMemo(
    () => (query === null ? [] : matchRoster(roster, query).slice(0, MAX_CANDIDATOS)),
    [roster, query]
  );

  function close() {
    setQuery(null);
    setAnchor(null);
  }

  function onType(next: string, caret: number) {
    onChange(next);
    const q = mentionQueryAt(next, caret);
    setQuery(q);
    setAnchor(q === null ? null : inputRef.current);
  }

  /** Sustituye el fragmento que se estaba tecleando por el nombre completo. */
  function pick(member: RosterMember) {
    const caret = inputRef.current?.selectionStart ?? value.length;
    const upto = value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) return;
    onChange(`${value.slice(0, at)}@${member.name} ${value.slice(caret)}`);
    close();
    inputRef.current?.focus();
  }

  return (
    <>
      <div className="row" style={{ marginTop: 8, display: "flex", gap: 8 }}>
        <input
          ref={inputRef}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onType(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={(e) => {
            // Con el menú abierto, Enter elige al primero en vez de enviar a
            // medio escribir el nombre.
            if (e.key === "Enter" && candidates.length && query !== null) {
              e.preventDefault();
              const first = candidates[0];
              if (first) pick(first);
              return;
            }
            if (e.key === "Enter" && value.trim() && !pending) onSend();
            if (e.key === "Escape" && query !== null) close();
          }}
        />
        <button className="btn-primary btn-sm" disabled={pending || !value.trim()} onClick={onSend}>
          {pending ? "…" : sendLabel}
        </button>
      </div>

      {anchor && candidates.length > 0 && (
        <MenuSurface
          anchor={anchor}
          align="start"
          width={220}
          label="Mencionar a alguien del espacio"
          onClose={close}
        >
          {candidates.map((m) => (
            <button key={m.userId} className="ex-menu-item" onClick={() => pick(m)}>
              {m.name}
            </button>
          ))}
        </MenuSurface>
      )}
    </>
  );
}
