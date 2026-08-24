-- 0026_book_cover.sql
-- Personal Development OS · Fase 4, primera rebanada: metadatos de libros
-- desde Open Library / Google Books (§5.1 del spec del módulo).
--
-- El buscador de metadatos devuelve título, autor, total de páginas y la URL
-- de una portada. Los tres primeros ya tienen columna; la portada no, y sin
-- ella el dato se perdería al guardar: el formulario la mostraría una vez y
-- la biblioteca seguiría pintando el mismo placeholder.
--
-- Se guarda la URL, NO el archivo: nada de Storage, nada de copiar imágenes
-- de terceros a nuestro bucket. Si el proveedor cambia o borra la portada, la
-- vista degrada al placeholder de siempre — una portada rota no puede tumbar
-- la biblioteca.
--
-- Cadena vacía en vez de NULL para no obligar a cada lectura a distinguir
-- entre "sin portada" y "portada desconocida": el mismo criterio que
-- books.author, que ya usa default ''.
alter table public.books
  add column if not exists cover_url text not null default '';

comment on column public.books.cover_url is
  'Fase 4 (§5.1): URL de la portada devuelta por Open Library o Google Books. Es una URL externa, nunca un archivo propio. Vacía = sin portada, la UI pinta su placeholder. El host debe estar permitido en img-src de la CSP (middleware.ts).';

-- Sin cambios de RLS/GRANT: la columna nueva hereda las políticas y grants ya
-- existentes de public.books (books_own, ver 0004_planning_time_habits.sql).
-- Mismo criterio que 0017_budget_quincenal_income.sql.
