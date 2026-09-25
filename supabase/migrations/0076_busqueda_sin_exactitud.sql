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
-- esquema, el resultado ya no depende de nada y se puede declarar inmutable
-- (lo que permitiría indexarla el día que haga falta).
create or replace function public.sin_acentos(p_texto text)
returns text
language sql
immutable
strict
parallel safe
set search_path = ''
as $fn$
  select extensions.unaccent('extensions.unaccent'::regdictionary, p_texto);
$fn$;

comment on function public.sin_acentos(text) is
  'unaccent con el diccionario nombrado por su esquema, y por eso inmutable. La usan graph_search y buscar_en_todo.';

-- 2) EL GRAFO, TOLERANTE
--
-- Misma firma y mismas columnas que en la 0054, para que nada que la llame
-- cambie. Encuentra si la consulta es SUBCADENA de la etiqueta (sin acentos ni
-- mayúsculas) o si se PARECE a alguna palabra de ella (`word_similarity` ≥
-- 0.4, que es lo que tolera «Malpso» por «Malpaso»). Se usa `strpos` y no
-- `like`: con `like` un `%` o un `_` escrito por el modelo sería un comodín.
--
-- Sigue SIN `security definer`: la RLS de graph_nodes es la que filtra.
create or replace function public.graph_search(p_query text, p_limit integer default 20)
returns table (node_id uuid, label text, node_type text, entity_table text, entity_id uuid, similitud real)
language sql
stable
set search_path = public
as $fn$
  with q as (
    select public.sin_acentos(lower(btrim(coalesce(p_query, '')))) as t
  ),
  c as (
    select n.id, n.label, n.node_type, n.entity_table, n.entity_id,
           public.sin_acentos(lower(n.label)) as l
    from public.graph_nodes n
    where n.archived_at is null
  ),
  m as (
    select c.*, q.t,
           greatest(extensions.similarity(q.t, c.l), extensions.word_similarity(q.t, c.l)) as sim
    from c, q
    where length(q.t) >= 2
      and (strpos(c.l, q.t) > 0 or extensions.word_similarity(q.t, c.l) >= 0.4)
  )
  select m.id, m.label, m.node_type, m.entity_table, m.entity_id, m.sim::real
  from m
  order by (strpos(m.l, m.t) > 0) desc, m.sim desc, m.label
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$fn$;

comment on function public.graph_search(text, integer) is
  'Búsqueda tolerante sobre las etiquetas (0076): sin acentos ni mayúsculas, por subcadena o por word_similarity >= 0.4. NO es security definer: la RLS de graph_nodes filtra.';

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
  candidatos (tabla, id, etiqueta, texto) as (
              select 'projects', x.id, x.title, x.title from public.projects x where 'projects' = any(p_tablas)
    union all select 'tasks', x.id, x.title, x.title from public.tasks x where 'tasks' = any(p_tablas)
    union all select 'habits', x.id, x.name, x.name from public.habits x where 'habits' = any(p_tablas)
    union all select 'routines', x.id, x.name, x.name from public.routines x where 'routines' = any(p_tablas)
    union all select 'books', x.id, x.title, x.title from public.books x where 'books' = any(p_tablas)
    union all select 'books', x.id, x.title, x.author from public.books x where 'books' = any(p_tablas)
    union all select 'notes', x.id, x.title, x.title from public.notes x where 'notes' = any(p_tablas)
    union all select 'notebooks', x.id, x.title, x.title from public.notebooks x where 'notebooks' = any(p_tablas)
    union all select 'personal_goals', x.id, x.title, x.title from public.personal_goals x where 'personal_goals' = any(p_tablas)
    union all select 'key_results', x.id, x.title, x.title from public.key_results x where 'key_results' = any(p_tablas)
    union all select 'debts', x.id, x.name, x.name from public.debts x where 'debts' = any(p_tablas)
    union all select 'accounts', x.id, x.name, x.name from public.accounts x where 'accounts' = any(p_tablas)
    union all select 'savings_goals', x.id, x.name, x.name from public.savings_goals x where 'savings_goals' = any(p_tablas)
    union all select 'financial_goals', x.id, x.name, x.name from public.financial_goals x where 'financial_goals' = any(p_tablas)
    union all select 'investments', x.id, x.name, x.name from public.investments x where 'investments' = any(p_tablas)
    union all select 'assets', x.id, x.name, x.name from public.assets x where 'assets' = any(p_tablas)
    union all select 'liabilities', x.id, x.name, x.name from public.liabilities x where 'liabilities' = any(p_tablas)
    union all select 'occupations', x.id, x.title, x.title from public.occupations x where 'occupations' = any(p_tablas)
    union all select 'family_members', x.id, x.name, x.name from public.family_members x where 'family_members' = any(p_tablas)
    union all select 'cashback_cards', x.id, x.name, x.name from public.cashback_cards x where 'cashback_cards' = any(p_tablas)
    union all select 'identity_traits', x.id, x.name, x.name from public.identity_traits x where 'identity_traits' = any(p_tablas)
  ),
  hallados as (
    select c.tabla, c.id, c.etiqueta,
           (strpos(public.sin_acentos(lower(c.texto)), q.t) > 0) as literal,
           greatest(
             extensions.similarity(q.t, public.sin_acentos(lower(c.texto))),
             extensions.word_similarity(q.t, public.sin_acentos(lower(c.texto)))
           ) as sim
    from candidatos c, q
    where length(q.t) >= 2
      and c.texto is not null
      and (strpos(public.sin_acentos(lower(c.texto)), q.t) > 0
           or extensions.word_similarity(q.t, public.sin_acentos(lower(c.texto))) >= 0.4)
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
  'Busca por nombre/título (y autor en books) en los catálogos nombrados en p_tablas, sin acentos, por subcadena o word_similarity >= 0.4. SECURITY INVOKER: la RLS de cada tabla filtra.';

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

-- `create or replace` conserva la ACL de graph_search; se re-emite lo que la
-- aplicación necesita para que quede escrito en algún sitio.
grant execute on function public.graph_search(text, integer) to authenticated, service_role;
