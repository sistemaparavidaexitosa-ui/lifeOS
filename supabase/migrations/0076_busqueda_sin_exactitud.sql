-- 0076 · Búsqueda sin exactitud
--
-- «Le he consultado cosas y en ocasiones no las encuentra y tengo que ser muy
-- muy exacto.» Dos causas, las dos en la base:
--
--  1. `graph_search` (0054) FILTRABA con `label ilike '%texto%'`: exigía el
--     texto literal. Una errata o un acento de menos no encontraban nada; la
--     similitud por trigramas estaba, pero solo ORDENABA lo que ya había
--     pasado el filtro literal.
--  2. No había forma de buscar «esa cosa que se llama así» en todas las tablas
--     a la vez: `consultar` va tabla por tabla y con ventana de fechas.
--
-- Esta migración añade la regla de coincidencia —sin acentos, sin mayúsculas,
-- por subcadena O por parecido de palabra— y la usa en los dos sitios.

create extension if not exists unaccent with schema extensions;

-- 1) SIN ACENTOS, E INMUTABLE
--
-- `unaccent(text)` a secas es `stable`, no `immutable`: depende del
-- `search_path` para encontrar su diccionario. Nombrando el diccionario con su
-- esquema, el resultado ya no depende del `search_path` y se puede declarar
-- inmutable, que es lo que permite indexarla (ver el índice de más abajo).
--
-- SIN cláusula `set search_path`: el cuerpo ya nombra todo con su esquema y
-- el `SET` solo añadía guardar y restaurar el GUC en cada llamada. Lo que NO
-- se consigue es inlinearla: `unaccent(regdictionary, text)` es STABLE, y una
-- función IMMUTABLE cuyo cuerpo no lo es nunca se inlinea (medido: ~5 µs por
-- llamada con o sin SET, frente a ~1,5 µs de `unaccent` directo). Por eso el
-- coste se ataca calculando el texto normalizado UNA vez por fila en quien la
-- usa (ver `buscar_en_todo` y `graph_search`), no aquí.
--
-- La salvedad de «inmutable»: el resultado depende de `unaccent.rules`. Si
-- alguien edita ese archivo del servidor, los índices construidos sobre esta
-- expresión quedan desfasados sin avisar y hay que hacerles `reindex`.
create or replace function public.sin_acentos(p_texto text)
returns text
language sql
immutable
strict
parallel safe
as $fn$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_texto);
$fn$;

comment on function public.sin_acentos(text) is
  'unaccent con el diccionario nombrado por su esquema, y por eso inmutable (sin SET para que se inlinee). Si cambia unaccent.rules, reindexar los índices que la usan. La usan graph_search y buscar_en_todo.';

-- 2) EL GRAFO, TOLERANTE
--
-- Misma firma y mismas columnas que en la 0054, para que nada que la llame
-- cambie. Encuentra si la consulta es SUBCADENA de la etiqueta (sin acentos ni
-- mayúsculas) o si se PARECE a alguna palabra de ella (`word_similarity` ≥
-- 0.4, que es lo que tolera «Malpso» por «Malpaso»).
--
-- El parecido difuso solo con TRES letras o más: con dos, una palabra entera
-- son tres trigramas y cualquier coincidencia parcial ya «se parece». Con dos
-- letras vale la subcadena y nada más.
--
-- Escrito con `like` y `<%` —y no con `strpos` y `word_similarity() >=`— para
-- que el índice de trigramas de abajo pueda servir los dos ramales. El texto
-- del modelo se escapa antes del `like`: un `%` o un `_` suyo no es comodín.
-- El umbral de `<%` es el GUC `pg_trgm.word_similarity_threshold`, puesto a
-- 0.4 solo dentro de la función.
--
-- Sigue SIN `security definer`: la RLS de graph_nodes es la que filtra.
-- `set pg_trgm.…` en la definición exige que la librería de pg_trgm ya esté
-- cargada en esta sesión: si no, PostgreSQL ve un parámetro desconocido y solo
-- deja fijarlo a un superusuario (y `postgres` en Supabase no lo es). Llamar a
-- cualquier función de la extensión la carga.
select extensions.similarity('a', 'a');

create or replace function public.graph_search(p_query text, p_limit integer default 20)
returns table (node_id uuid, label text, node_type text, entity_table text, entity_id uuid, similitud real)
language sql
stable
set search_path = public
set pg_trgm.word_similarity_threshold = 0.4
as $fn$
  -- La consulta se normaliza una sola vez, no una por fila.
  with q as materialized (
    select x.t,
           '%' || replace(replace(replace(x.t, '\', '\\'), '%', '\%'), '_', '\_') || '%' as patron
    from (select public.sin_acentos(lower(btrim(coalesce(p_query, '')))) as t) x
  ),
  -- El predicado repite `sin_acentos(lower(n.label))` tal cual a propósito:
  -- es la expresión del índice, y solo así la reconoce el planificador.
  m as materialized (
    select n.id, n.label, n.node_type, n.entity_table, n.entity_id,
           public.sin_acentos(lower(n.label)) as l, q.t
    from public.graph_nodes n, q
    where n.archived_at is null
      and char_length(q.t) >= 2
      and (
        public.sin_acentos(lower(n.label)) like q.patron
        or (char_length(q.t) >= 3 and q.t operator(extensions.<%) public.sin_acentos(lower(n.label)))
      )
  )
  select m.id, m.label, m.node_type, m.entity_table, m.entity_id,
         greatest(extensions.similarity(m.t, m.l), extensions.word_similarity(m.t, m.l))::real
  from m
  order by (strpos(m.l, m.t) > 0) desc, 6 desc, m.label
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$fn$;

comment on function public.graph_search(text, integer) is
  'Búsqueda tolerante sobre las etiquetas (0076): sin acentos ni mayúsculas, por subcadena (desde 2 letras) o por word_similarity >= 0.4 (desde 3). NO es security definer: la RLS de graph_nodes filtra.';

-- El índice de la 0054 (`label gin_trgm_ops`) ya no le sirve al predicado
-- nuevo, que compara la etiqueta normalizada. Este indexa esa misma expresión.
create index if not exists idx_graph_nodes_label_sin_acentos_trgm
  on public.graph_nodes using gin (public.sin_acentos(lower(label)) extensions.gin_trgm_ops);

-- 3) BUSCAR EN TODO
--
-- Una sola llamada que busca por nombre en todos los catálogos del usuario.
-- Solo mira las tablas que vengan en `p_tablas`: la aplicación pasa las de los
-- dominios que el usuario autorizó para la IA, y lo que no se nombra no se
-- toca. La lista tiene que coincidir con `TABLAS_DE_BUSQUEDA`
-- (src/lib/domain/ai/tools.ts).
--
-- SECURITY INVOKER, a propósito: la RLS de cada tabla decide qué filas son
-- tuyas. Una versión `definer` tendría que reescribir a mano, tabla por tabla,
-- la política de cada una —incluidas las compartidas por espacio— y la primera
-- que se escribiera mal enseñaría filas ajenas.
--
-- En `books` se busca también por autor: la etiqueta sigue siendo el título.
create or replace function public.buscar_en_todo(p_texto text, p_tablas text[], p_limite integer default 30)
returns table (tabla text, id uuid, etiqueta text, similitud real)
language sql
stable
security invoker
set search_path = public
as $fn$
  with q as (
    select public.sin_acentos(lower(btrim(coalesce(p_texto, '')))) as t
  ),
  -- El texto normalizado se calcula UNA vez por fila candidata: `materialized`
  -- impide que el planificador lo vuelva a copiar en cada sitio donde se usa.
  candidatos (tabla, id, etiqueta, n) as materialized (
              select 'projects', x.id, x.title, public.sin_acentos(lower(x.title)) from public.projects x where 'projects' = any(p_tablas)
    union all select 'tasks', x.id, x.title, public.sin_acentos(lower(x.title)) from public.tasks x where 'tasks' = any(p_tablas)
    union all select 'habits', x.id, x.name, public.sin_acentos(lower(x.name)) from public.habits x where 'habits' = any(p_tablas)
    union all select 'routines', x.id, x.name, public.sin_acentos(lower(x.name)) from public.routines x where 'routines' = any(p_tablas)
    union all select 'books', x.id, x.title, public.sin_acentos(lower(x.title)) from public.books x where 'books' = any(p_tablas)
    union all select 'books', x.id, x.title, public.sin_acentos(lower(x.author)) from public.books x where 'books' = any(p_tablas)
    union all select 'notes', x.id, x.title, public.sin_acentos(lower(x.title)) from public.notes x where 'notes' = any(p_tablas)
    union all select 'notebooks', x.id, x.title, public.sin_acentos(lower(x.title)) from public.notebooks x where 'notebooks' = any(p_tablas)
    union all select 'personal_goals', x.id, x.title, public.sin_acentos(lower(x.title)) from public.personal_goals x where 'personal_goals' = any(p_tablas)
    union all select 'key_results', x.id, x.title, public.sin_acentos(lower(x.title)) from public.key_results x where 'key_results' = any(p_tablas)
    union all select 'debts', x.id, x.name, public.sin_acentos(lower(x.name)) from public.debts x where 'debts' = any(p_tablas)
    union all select 'accounts', x.id, x.name, public.sin_acentos(lower(x.name)) from public.accounts x where 'accounts' = any(p_tablas)
    union all select 'savings_goals', x.id, x.name, public.sin_acentos(lower(x.name)) from public.savings_goals x where 'savings_goals' = any(p_tablas)
    union all select 'financial_goals', x.id, x.name, public.sin_acentos(lower(x.name)) from public.financial_goals x where 'financial_goals' = any(p_tablas)
    union all select 'investments', x.id, x.name, public.sin_acentos(lower(x.name)) from public.investments x where 'investments' = any(p_tablas)
    union all select 'assets', x.id, x.name, public.sin_acentos(lower(x.name)) from public.assets x where 'assets' = any(p_tablas)
    union all select 'liabilities', x.id, x.name, public.sin_acentos(lower(x.name)) from public.liabilities x where 'liabilities' = any(p_tablas)
    union all select 'occupations', x.id, x.title, public.sin_acentos(lower(x.title)) from public.occupations x where 'occupations' = any(p_tablas)
    union all select 'family_members', x.id, x.name, public.sin_acentos(lower(x.name)) from public.family_members x where 'family_members' = any(p_tablas)
    union all select 'cashback_cards', x.id, x.name, public.sin_acentos(lower(x.name)) from public.cashback_cards x where 'cashback_cards' = any(p_tablas)
    union all select 'identity_traits', x.id, x.name, public.sin_acentos(lower(x.name)) from public.identity_traits x where 'identity_traits' = any(p_tablas)
  ),
  puntuados as materialized (
    select c.tabla, c.id, c.etiqueta,
           strpos(c.n, q.t) > 0 as literal,
           extensions.word_similarity(q.t, c.n) as ws,
           extensions.similarity(q.t, c.n) as s,
           char_length(q.t) as largo
    from candidatos c, q
    where c.n is not null
  ),
  -- Subcadena desde dos letras; parecido difuso solo desde tres (con dos,
  -- cualquier coincidencia parcial de trigramas ya «se parece»).
  hallados as (
    select p.tabla, p.id, p.etiqueta, p.literal, greatest(p.s, p.ws) as sim
    from puntuados p
    where p.largo >= 2
      and (p.literal or (p.largo >= 3 and p.ws >= 0.4))
  ),
  -- Un libro puede coincidir por título y por autor: una fila, la mejor.
  unicos as (
    select h.tabla, h.id, max(h.etiqueta) as etiqueta, bool_or(h.literal) as literal, max(h.sim) as sim
    from hallados h
    group by h.tabla, h.id
  )
  select u.tabla, u.id, u.etiqueta, u.sim::real
  from unicos u
  order by u.literal desc, u.sim desc, u.etiqueta
  limit least(greatest(coalesce(p_limite, 30), 1), 100);
$fn$;

comment on function public.buscar_en_todo(text, text[], integer) is
  'Busca por nombre/título (y autor en books) en los catálogos nombrados en p_tablas, sin acentos, por subcadena (desde 2 letras) o word_similarity >= 0.4 (desde 3). SECURITY INVOKER: la RLS de cada tabla filtra.';

-- 4) PERMISOS (D-186, D-187)
--
-- Toda función nueva nace con EXECUTE para PUBLIC —y `anon` lo hereda— y
-- además con el EXPLÍCITO que reparte la 0010. Hacen falta los dos `revoke`:
-- uno quita lo heredado y otro lo escrito. Ninguna de las dos le da nada a
-- `anon` (son invoker y la RLS no le enseña filas), pero lo que no se usa sin
-- sesión no se deja abierto sin sesión.
revoke execute on function public.sin_acentos(text) from public, anon;
revoke execute on function public.buscar_en_todo(text, text[], integer) from public, anon;
grant execute on function public.sin_acentos(text) to authenticated, service_role;
grant execute on function public.buscar_en_todo(text, text[], integer) to authenticated, service_role;

-- graph_search nació en la 0054 sin `revoke`, así que seguía ejecutable por
-- PUBLIC y por `anon` (y `create or replace` conserva la ACL). Se cierra aquí
-- igual que las otras dos: la RLS ya no le daba filas a `anon`, pero lo que
-- no se usa sin sesión no se deja abierto sin sesión.
revoke execute on function public.graph_search(text, integer) from public, anon;
grant execute on function public.graph_search(text, integer) to authenticated, service_role;
