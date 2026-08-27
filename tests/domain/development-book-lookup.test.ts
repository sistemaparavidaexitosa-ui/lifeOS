// tests/domain/development-book-lookup.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanIsbn,
  dedupeByTitle,
  secureImageUrl,
  normalizeOpenLibrary,
  normalizeGoogleBooks,
  fillGaps,
  isAllowedCoverUrl,
  coverProxyUrl,
  type BookCandidate
} from "../../src/lib/domain/development/book-lookup.ts";

test("cleanIsbn: acepta ISBN-13 con guiones y espacios", () => {
  assert.strictEqual(cleanIsbn("978-0-7352-1129-2"), "9780735211292");
  assert.strictEqual(cleanIsbn(" 9780735211292 "), "9780735211292");
});

test("cleanIsbn: acepta ISBN-10 con X final, en minúscula", () => {
  assert.strictEqual(cleanIsbn("043942089x"), "043942089X");
});

test("cleanIsbn: rechaza lo que no tiene forma de ISBN", () => {
  assert.strictEqual(cleanIsbn("hábitos atómicos"), null);
  assert.strictEqual(cleanIsbn("12345"), null);
  assert.strictEqual(cleanIsbn(""), null);
});

test("secureImageUrl: sube a https la miniatura http de Google Books", () => {
  // Sin esto la portada se ve rota: la CSP permite el host en https, no en http.
  assert.strictEqual(
    secureImageUrl("http://books.google.com/books/content?id=abc&img=1"),
    "https://books.google.com/books/content?id=abc&img=1"
  );
});

test("secureImageUrl: descarta esquemas que no son http(s)", () => {
  assert.strictEqual(secureImageUrl("data:image/png;base64,AAAA"), "");
  assert.strictEqual(secureImageUrl("javascript:alert(1)"), "");
  assert.strictEqual(secureImageUrl(undefined), "");
});

test("normalizeOpenLibrary: arma la URL de portada desde el id de portada", () => {
  const [c] = normalizeOpenLibrary([
    { title: "Hábitos Atómicos", author_name: ["James Clear"], number_of_pages_median: 320, cover_i: 12345, isbn: ["978-0-7352-1129-2"] }
  ]);
  assert.strictEqual(c.title, "Hábitos Atómicos");
  assert.strictEqual(c.author, "James Clear");
  assert.strictEqual(c.totalPages, 320);
  assert.strictEqual(c.coverUrl, "https://covers.openlibrary.org/b/id/12345-M.jpg");
  assert.strictEqual(c.isbn, "9780735211292");
});

test("normalizeOpenLibrary: sin portada ni páginas devuelve vacíos, no undefined", () => {
  const [c] = normalizeOpenLibrary([{ title: "Libro raro" }]);
  assert.strictEqual(c.coverUrl, "");
  assert.strictEqual(c.totalPages, 0);
  assert.strictEqual(c.author, "");
  assert.strictEqual(c.isbn, "");
});

test("normalizeOpenLibrary: descarta documentos sin título", () => {
  assert.deepStrictEqual(normalizeOpenLibrary([{ author_name: ["Nadie"] }]), []);
});

test("normalizeGoogleBooks: lee título, autor, páginas y portada", () => {
  const [c] = normalizeGoogleBooks([
    {
      volumeInfo: {
        title: "Deep Work",
        authors: ["Cal Newport", "Otro"],
        pageCount: 296,
        imageLinks: { thumbnail: "http://books.google.com/books/content?id=xyz" },
        industryIdentifiers: [{ type: "ISBN_13", identifier: "9781455586691" }]
      }
    }
  ]);
  assert.strictEqual(c.title, "Deep Work");
  assert.strictEqual(c.author, "Cal Newport");
  assert.strictEqual(c.totalPages, 296);
  assert.strictEqual(c.coverUrl, "https://books.google.com/books/content?id=xyz");
  assert.strictEqual(c.isbn, "9781455586691");
});

test("normalizeGoogleBooks: pageCount en 0 no se propaga como dato real", () => {
  const [c] = normalizeGoogleBooks([{ volumeInfo: { title: "Sin paginar", pageCount: 0 } }]);
  assert.strictEqual(c.totalPages, 0);
});

test("fillGaps: completa las páginas que Open Library no trajo, emparejando por ISBN", () => {
  const primary: BookCandidate[] = [
    { title: "Hábitos Atómicos", author: "James Clear", totalPages: 0, coverUrl: "https://covers/1.jpg", isbn: "9780735211292", source: "openlibrary" }
  ];
  const secondary: BookCandidate[] = [
    { title: "Atomic Habits", author: "James Clear", totalPages: 320, coverUrl: "https://books/2.jpg", isbn: "9780735211292", source: "googlebooks" }
  ];
  const [r] = fillGaps(primary, secondary);
  assert.strictEqual(r.totalPages, 320);
  assert.strictEqual(r.title, "Hábitos Atómicos", "el título del primario no se pisa");
  assert.strictEqual(r.coverUrl, "https://covers/1.jpg", "la portada buena tampoco");
});

test("fillGaps: no inventa emparejamientos entre listas de varios candidatos", () => {
  const primary: BookCandidate[] = [
    { title: "A", author: "", totalPages: 0, coverUrl: "", isbn: "9780000000001", source: "openlibrary" },
    { title: "B", author: "", totalPages: 0, coverUrl: "", isbn: "9780000000002", source: "openlibrary" }
  ];
  const secondary: BookCandidate[] = [
    { title: "C", author: "", totalPages: 999, coverUrl: "https://x/c.jpg", isbn: "9789999999999", source: "googlebooks" }
  ];
  assert.deepStrictEqual(fillGaps(primary, secondary), primary);
});

test("fillGaps: sin segundo proveedor devuelve el primario intacto", () => {
  const primary: BookCandidate[] = [{ title: "A", author: "", totalPages: 0, coverUrl: "", isbn: "", source: "openlibrary" }];
  assert.deepStrictEqual(fillGaps(primary, []), primary);
});

test("isAllowedCoverUrl: acepta los hosts de portada y la cadena vacía", () => {
  assert.ok(isAllowedCoverUrl(""));
  assert.ok(isAllowedCoverUrl("https://covers.openlibrary.org/b/id/12345-M.jpg"));
  assert.ok(isAllowedCoverUrl("https://books.google.com/books/content?id=xyz"));
});

test("isAllowedCoverUrl: rechaza otro host, http y basura", () => {
  // El campo llega por un input oculto: se valida en el servidor al guardar.
  assert.ok(!isAllowedCoverUrl("https://evil.example/portada.jpg"));
  assert.ok(!isAllowedCoverUrl("http://covers.openlibrary.org/b/id/1-M.jpg"));
  assert.ok(!isAllowedCoverUrl("javascript:alert(1)"));
  assert.ok(!isAllowedCoverUrl("no soy una url"));
});

test("dedupeByTitle: se queda con el registro más completo del mismo título", () => {
  // Caso real de Open Library: la misma búsqueda por ISBN devuelve la edición
  // con datos y otra que solo trae el título.
  const flaco: BookCandidate = { title: "Atomic Habits", author: "", totalPages: 0, coverUrl: "", isbn: "", source: "openlibrary" };
  const completo: BookCandidate = { title: "Atomic Habits", author: "James Clear", totalPages: 323, coverUrl: "https://covers/1.jpg", isbn: "", source: "openlibrary" };
  assert.deepStrictEqual(dedupeByTitle([flaco, completo]), [completo]);
  assert.deepStrictEqual(dedupeByTitle([completo, flaco]), [completo]);
});

test("dedupeByTitle: no colapsa títulos distintos ni reordena", () => {
  const a: BookCandidate = { title: "Uno", author: "A", totalPages: 1, coverUrl: "", isbn: "", source: "openlibrary" };
  const b: BookCandidate = { title: "Dos", author: "B", totalPages: 2, coverUrl: "", isbn: "", source: "openlibrary" };
  assert.deepStrictEqual(dedupeByTitle([a, b]), [a, b]);
});

test("coverProxyUrl: la portada se pide a nuestro origen, nunca al proveedor", () => {
  // covers.openlibrary.org responde 302 hacia archive.org y la CSP se evalúa en
  // cada salto: pedirla directo desde el <img> deja la portada rota.
  assert.strictEqual(
    coverProxyUrl("https://covers.openlibrary.org/b/id/12539702-M.jpg"),
    "/api/development/book-cover?url=https%3A%2F%2Fcovers.openlibrary.org%2Fb%2Fid%2F12539702-M.jpg"
  );
});

test("coverProxyUrl: escapa la query del proveedor en vez de dejarla suelta", () => {
  // La miniatura de Google Books trae `&` y `?`: sin encodeURIComponent, el
  // `&img=1` se leería como otro parámetro NUESTRO y el proxy recibiría una
  // url truncada.
  const url = coverProxyUrl("https://books.google.com/books/content?id=abc&img=1&zoom=1");
  assert.strictEqual(url, "/api/development/book-cover?url=https%3A%2F%2Fbooks.google.com%2Fbooks%2Fcontent%3Fid%3Dabc%26img%3D1%26zoom%3D1");
  // Y al leerla del otro lado se recupera intacta.
  assert.strictEqual(
    new URLSearchParams(url.split("?")[1]).get("url"),
    "https://books.google.com/books/content?id=abc&img=1&zoom=1"
  );
});

test("coverProxyUrl: sin portada y url no permitida dan lo mismo, cadena vacía", () => {
  // "" hace que BookCover pinte el placeholder en vez de disparar una petición
  // que el handler rechazaría igual.
  assert.strictEqual(coverProxyUrl(""), "");
  assert.strictEqual(coverProxyUrl("https://evil.example/portada.jpg"), "");
  assert.strictEqual(coverProxyUrl("http://covers.openlibrary.org/b/id/1-M.jpg"), "");
  assert.strictEqual(coverProxyUrl("javascript:alert(1)"), "");
});
