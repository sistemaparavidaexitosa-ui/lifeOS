"use client";
// Pinta el cuerpo de una nota a partir del árbol que devuelve `parseNote`.
//
// Crea elementos de React, NUNCA `dangerouslySetInnerHTML`. El cuerpo lo
// escribe un colaborador y esa es la garantía de que nada de lo que escriba
// pueda ejecutarse en el navegador de su equipo: el texto entra como texto y
// sale como texto. Los `href` ya vienen restringidos a http(s) desde el propio
// patrón del parser (src/lib/domain/notes/markup.ts).
import { parseNote, type Inline } from "@/lib/domain/notes/markup.ts";

export default function NoteBody({ body }: { body: string }) {
  const blocks = parseNote(body);

  if (!blocks.length) {
    return (
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Esta nota está vacía.
      </p>
    );
  }

  return (
    <div className="nb-prose">
      {blocks.map((block, i) => {
        switch (block.kind) {
          case "heading": {
            // h2/h3/h4 y no h1/h2/h3: el h1 de la página es el título de la
            // nota, y el cuerpo no puede competir con él en la jerarquía.
            const Tag = block.level === 1 ? "h2" : block.level === 2 ? "h3" : "h4";
            return <Tag key={i}>{renderInline(block.content)}</Tag>;
          }
          case "bullets":
            return (
              <ul key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          case "ordered":
            return (
              <ol key={i}>
                {block.items.map((item, j) => (
                  <li key={j}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          case "quote":
            return <blockquote key={i}>{renderInline(block.content)}</blockquote>;
          case "mono":
            return (
              <pre key={i} className="nb-mono">
                <code>{block.text}</code>
              </pre>
            );
          case "todo":
            return (
              <ul key={i} className="nb-todo">
                {block.items.map((item, j) => (
                  <li key={j} className={item.done ? "hecha" : undefined}>
                    <input type="checkbox" checked={item.done} disabled readOnly />
                    <span>{renderInline(item.content)}</span>
                  </li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={i} className="nb-table-wrap">
                <table className="nb-table">
                  <thead>
                    <tr>
                      {block.head.map((celda, j) => (
                        <th key={j}>{renderInline(celda)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((fila, j) => (
                      <tr key={j}>
                        {fila.map((celda, k) => (
                          <td key={k}>{renderInline(celda)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return <p key={i}>{renderInline(block.content)}</p>;
        }
      })}
    </div>
  );
}

function renderInline(content: Inline[]) {
  return content.map((part, i) => {
    switch (part.kind) {
      case "bold":
        return <b key={i}>{part.text}</b>;
      case "italic":
        return <i key={i}>{part.text}</i>;
      case "underline":
        return <u key={i}>{part.text}</u>;
      case "strike":
        return <s key={i}>{part.text}</s>;
      case "code":
        return <code key={i}>{part.text}</code>;
      case "link":
        return (
          // noopener/noreferrer siempre: el destino lo escribe un colaborador.
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        );
      default:
        return <span key={i}>{part.text}</span>;
    }
  });
}
