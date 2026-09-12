-- =============================================================================
-- 0058 · LAS ARISTAS SE VUELVEN DECLARATIVAS
-- =============================================================================
--
-- 0057 dejó el registro a medias a propósito. `graph_sources` pasó a EJECUTAR
-- la proyección de nodos —de ahí salen el instalador, el backfill y la
-- detección de deriva—, pero `graph_edge_rules` se quedó DESCRIBIENDO lo que
-- siete funciones escritas a mano seguían haciendo. La columna
-- `implementado_por` se añadió justamente para que el registro no pareciera más
-- de lo que era mientras tanto.
--
-- Esta migración invierte esa relación: la fila pasa a ser lo que se ejecuta.
-- Las siete funciones siguen existiendo y con el mismo nombre, pero su cuerpo lo
-- GENERA `graph_edges_ddl()` a partir de las once reglas.
--
-- POR QUÉ IMPORTA, dicho sin rodeos: hoy, proyectar una entidad nueva que tenga
-- relaciones seguía pidiendo plpgsql a mano, así que el registro solo abarataba
-- la mitad del trabajo. Con esto, una relación nueva es una fila. Es el
-- prerrequisito de ampliar la cobertura a Money OS y al tiempo.
--
-- DOS DECISIONES QUE VIENEN DE 0057 Y AQUÍ SE REPITEN:
--
--   · El SQL dinámico corre en tiempo de DDL, nunca por fila (D-138). El
--     generador emite un cuerpo plpgsql ESTÁTICO, con las reglas ya inlineadas
--     como literales: en cada UPDATE no se consulta el registro ni se arma
--     ninguna sentencia. El camino caliente no se entera de que hay un registro.
--
--   · No se toca ningún trigger (D-139). `create or replace function` mantiene
--     el mismo oid, y los triggers apuntan a la función por oid: se sustituye el
--     cuerpo sin pedir ACCESS EXCLUSIVE sobre `tasks` ni sobre nada. Por eso las
--     funciones generadas conservan los nombres de 0054 en vez de estrenar unos
--     coherentes — el nombre feo (`graph_edges_key_result`, en singular) vale
--     más que la ventana de bloqueo que costaría arreglarlo.
--
-- Y LA PRUEBA: antes de sustituir nada, el §4 exige que el conjunto de aristas
-- que las reglas DERIVAN sea idéntico, fila a fila, al que las siete funciones
-- mantienen. Si el modelo declarativo no reprodujera exactamente lo que hay, la
-- migración aborta y no sustituye nada.
--
-- Ver `docs/UNIVERSAL_GRAPH_ROADMAP.md` §M2 y D-142…D-144.
-- =============================================================================


-- =============================================================================
-- 1) LO QUE LE FALTABA AL REGISTRO PARA PODER EJECUTARSE
--
-- `scalar_fk`, `uuid_array` y `polymorphic` se resuelven sin saber nada de la
-- tabla del otro extremo, y eso es una propiedad del esquema que conviene dejar
-- escrita: `graph_node_of()` busca por `entity_id`, que es único en TODO el
-- sistema (idx_graph_nodes_entity, 0054:201), así que resolver el nodo de un
-- uuid no necesita saber de qué tabla salió. Por eso una columna polimórfica sin
-- FK —`key_results.source_id`, que apunta a cinco tablas distintas— se resuelve
-- exactamente igual que una FK normal.
--
-- `via_lookup` es el único que necesita saberlo: la nota cuelga del espacio de
-- su cuaderno, y la persona asignada es la fila de `memberships` de ESE espacio.
-- =============================================================================

alter table public.graph_edge_rules
  add column if not exists lookup_table        text,
  add column if not exists lookup_key          text,
  add column if not exists lookup_value        text,
  add column if not exists lookup_scope_column text;

comment on column public.graph_edge_rules.lookup_table is
  'Solo para column_kind = via_lookup: la tabla por la que se pasa para llegar al otro extremo. notes -> notebooks -> el espacio.';
-- El filtro se escribe SIN CUALIFICAR («source_id is not null»), y no es
-- descuido: lo evalúan dos sitios con alias distintos —`r` dentro de la función
-- generada y `f` dentro de graph_edges_expected()—, así que cualquier prefijo lo
-- rompería en uno de los dos.
comment on column public.graph_edge_rules.row_filter is
  'Condición SQL que decide qué filas de la tabla puente generan arista. Se escribe SIN cualificar con alias: la evalúan la función generada (alias r) y graph_edges_expected() (alias f).';
comment on column public.graph_edge_rules.lookup_scope_column is
  'Solo para via_lookup cuando la búsqueda es ambigua sin el inquilino: la misma persona puede ser miembro de varios espacios, así que la fila de memberships que toca es la del espacio del nodo ancla.';

update public.graph_edge_rules
   set lookup_table = 'notebooks', lookup_key = 'id', lookup_value = 'workspace_id'
 where source_table = 'notes' and column_kind = 'via_lookup';

update public.graph_edge_rules
   set lookup_table = 'memberships', lookup_key = 'user_id', lookup_value = 'id',
       lookup_scope_column = 'workspace_id',
       row_filter = 'user_id is not null'
 where source_table = 'task_assignees';

-- 0057 sembró solo la mitad del filtro, porque describía y no ejecutaba. La otra
-- mitad estaba dentro de `graph_edges_key_result`: un resultado clave sin fuente
-- no genera arista.
update public.graph_edge_rules
   set row_filter = 'source_id is not null and source_kind in (''habit'', ''book'')'
 where source_table = 'key_results';


-- Las restricciones van DESPUÉS de la siembra: antes, las filas de 0057 aún
-- no tienen los datos que exigen y el ALTER no pasaría.
alter table public.graph_edge_rules
  add constraint graph_edge_rules_lookup_completo check (
    column_kind <> 'via_lookup'
    or (lookup_table is not null and lookup_key is not null and lookup_value is not null)
  );

-- Un `row_filter` se evalúa contra la fila de origen con el alias `r`, y eso
-- solo existe cuando la regla agrega sobre la tabla puente. Declararlo en una
-- regla de ancla propia sería escribir una condición que nunca se mira.
alter table public.graph_edge_rules
  add constraint graph_edge_rules_filtro_solo_en_puente check (
    row_filter is null or anchor_column is not null
  );


-- =============================================================================
-- 2) LAS ARISTAS QUE LAS REGLAS DERIVAN
--
-- El equivalente para aristas de lo que `graph_registry_diff()` es para nodos, y
-- tiene dos usos distintos: aquí abajo demuestra que el modelo declarativo
-- reproduce exactamente lo que las siete funciones venían haciendo, y a partir
-- de hoy es el detector de deriva de `graph_edges_deriva()`.
--
-- Es SQL dinámico y aquí sí se puede: esto es una herramienta de diagnóstico que
-- se llama a mano o desde CI, no un trigger que corre por fila. Lo que D-138
-- prohíbe es el intérprete en el camino caliente.
-- =============================================================================

create or replace function public.graph_edges_expected()
returns table (source_id uuid, rel_type text, target_id uuid)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $fn$
declare
  r         public.graph_edge_rules%rowtype;
  v_destino text;
  v_filtro  text;
  v_ancla   text;
  v_sql     text;
begin
  for r in select * from public.graph_edge_rules
            order by source_table, rel_type, nombre loop

    v_filtro := case when r.row_filter is null then ''
                     else ' and (' || r.row_filter || ')' end;
    v_ancla  := coalesce(r.anchor_column, 'id');

    -- Cómo se llega al uuid de ENTIDAD del otro extremo desde la fila `f`.
    if r.column_kind = 'via_lookup' then
      v_destino := format(
        '(select l.%I from public.%I l where l.%I = f.%I%s)',
        r.lookup_value, r.lookup_table, r.lookup_key, r.source_column,
        case when r.lookup_scope_column is null then ''
             else format(
               ' and l.%I = (select n.workspace_id from public.graph_nodes n where n.entity_id = f.%I)',
               r.lookup_scope_column, v_ancla) end);
    else
      v_destino := format('f.%I', r.source_column);
    end if;

    if r.column_kind = 'uuid_array' then
      v_sql := format(
        'select public.graph_node_of(f.id), %L, public.graph_node_of(d)
           from public.%I f, unnest(coalesce(f.%I, ''{}''::uuid[])) as d
          where public.graph_node_of(f.id) is not null
            and public.graph_node_of(d) is not null%s',
        r.rel_type, r.source_table, r.source_column, v_filtro);

    elsif r.direction = 'in' then
      -- La arista ENTRA en el ancla: sale de la fuente resuelta y llega a la
      -- meta. Es el caso de `key_results`, donde la fila puente no es ninguno de
      -- los dos extremos.
      v_sql := format(
        'select public.graph_node_of(%s), %L, public.graph_node_of(f.%I)
           from public.%I f
          where public.graph_node_of(%s) is not null
            and public.graph_node_of(f.%I) is not null%s',
        v_destino, r.rel_type, v_ancla, r.source_table,
        v_destino, v_ancla, v_filtro);

    else
      v_sql := format(
        'select public.graph_node_of(f.%I), %L, public.graph_node_of(%s)
           from public.%I f
          where public.graph_node_of(f.%I) is not null
            and public.graph_node_of(%s) is not null%s',
        v_ancla, r.rel_type, v_destino, r.source_table,
        v_ancla, v_destino, v_filtro);
    end if;

    return query execute v_sql;
  end loop;
end;
$fn$;

comment on function public.graph_edges_expected() is
  'El conjunto de aristas `system` que las reglas de graph_edge_rules derivan de los datos actuales. Lo que graph_registry_diff() es para los nodos. Ver 0058.';


create or replace function public.graph_edges_deriva()
returns table (lado text, source_id uuid, rel_type text, target_id uuid)
language sql
stable
security definer
set search_path = public
set row_security = off
as $fn$
  select 'falta'::text, e.source_id, e.rel_type, e.target_id
    from (select source_id, rel_type, target_id from public.graph_edges_expected()
          except
          select source_id, rel_type, target_id from public.graph_edges where origin = 'system') e
  union all
  select 'sobra'::text, e.source_id, e.rel_type, e.target_id
    from (select source_id, rel_type, target_id from public.graph_edges where origin = 'system'
          except
          select source_id, rel_type, target_id from public.graph_edges_expected()) e;
$fn$;

comment on function public.graph_edges_deriva() is
  'Aristas `system` que las reglas esperan y no están («falta»), y que están y las reglas no esperan («sobra»). Vacío = la proyección de aristas sigue siendo cierta. Ver 0058.';


-- =============================================================================
-- 3) LA PRUEBA, ANTES DE SUSTITUIR NADA
--
-- Si el modelo declarativo no reprodujera exactamente el conjunto que las siete
-- funciones mantienen, sustituirlas sería cambiar el comportamiento a ciegas.
-- Esto lo impide: se comprueba PRIMERO, con las funciones viejas todavía en su
-- sitio, y si difiere en una sola arista la migración aborta entera.
-- =============================================================================

do $$
declare
  v_n int;
  v_detalle text;
begin
  select count(*), string_agg(format('  · %s %s → %s (%s)', lado, source_id, target_id, rel_type), e'\n')
    into v_n, v_detalle
  from public.graph_edges_deriva();

  if v_n > 0 then
    raise exception
      'graph: las reglas de graph_edge_rules no reproducen las aristas vivas (% diferencia(s)):%',
      v_n, e'\n' || v_detalle
      using errcode = 'P0001';
  end if;
end $$;


-- =============================================================================
-- 4) VALIDACIÓN DE LAS REGLAS DE ARISTA
-- =============================================================================

create or replace function public.graph_edges_validar(p_source_table text)
returns void
language plpgsql
stable
set search_path = public
as $fn$
declare
  r      public.graph_edge_rules%rowtype;
  v_oid  oid;
  v_n    int;
begin
  select count(*) into v_n from public.graph_edge_rules where source_table = p_source_table;
  if v_n = 0 then
    raise exception 'graph: «%» no tiene reglas de arista en el registro.', p_source_table
      using errcode = 'P0001';
  end if;

  -- Todas las reglas de una tabla las mantiene UNA función: es lo que permite
  -- sustituir el cuerpo con `create or replace` sin tocar el trigger.
  select count(distinct implementado_por) into v_n
    from public.graph_edge_rules where source_table = p_source_table;
  if v_n <> 1 then
    raise exception 'graph: las reglas de «%» nombran % funciones distintas y tiene que ser una.',
      p_source_table, v_n using errcode = 'P0001';
  end if;

  -- Y o todas cuelgan de la fila propia, o todas de un ancla ajena: el cuerpo
  -- generado tiene una forma u otra, no las dos a la vez.
  select count(distinct (anchor_column is null)) into v_n
    from public.graph_edge_rules where source_table = p_source_table;
  if v_n <> 1 then
    raise exception 'graph: «%» mezcla reglas de ancla propia y de tabla puente.', p_source_table
      using errcode = 'P0001';
  end if;

  v_oid := to_regclass('public.' || quote_ident(p_source_table));
  if v_oid is null then
    raise exception 'graph: «%» no existe.', p_source_table using errcode = 'P0001';
  end if;

  for r in select * from public.graph_edge_rules where source_table = p_source_table loop
    if r.column_kind = 'uuid_array' and r.anchor_column is not null then
      raise exception
        'graph: la regla «%/%» combina tabla puente con columna de array, y el generador no lo cubre.',
        r.source_table, r.nombre using errcode = 'P0001';
    end if;

    if not exists (select 1 from pg_attribute a
                    where a.attrelid = v_oid and a.attname = r.source_column
                      and a.attnum > 0 and not a.attisdropped) then
      raise exception 'graph: la regla «%/%» declara la columna «%», que no existe en «%».',
        r.source_table, r.nombre, r.source_column, p_source_table using errcode = 'P0001';
    end if;

    if r.anchor_column is not null
       and not exists (select 1 from pg_attribute a
                        where a.attrelid = v_oid and a.attname = r.anchor_column
                          and a.attnum > 0 and not a.attisdropped) then
      raise exception 'graph: la regla «%/%» ancla en «%», que no existe en «%».',
        r.source_table, r.nombre, r.anchor_column, p_source_table using errcode = 'P0001';
    end if;

    if r.column_kind = 'via_lookup' then
      if to_regclass('public.' || quote_ident(r.lookup_table)) is null then
        raise exception 'graph: la regla «%/%» pasa por «%», que no existe.',
          r.source_table, r.nombre, r.lookup_table using errcode = 'P0001';
      end if;
      if not exists (select 1 from pg_attribute a
                      where a.attrelid = to_regclass('public.' || quote_ident(r.lookup_table))
                        and a.attname in (r.lookup_key, r.lookup_value)
                        and a.attnum > 0 and not a.attisdropped
                      having count(*) = 2) then
        raise exception 'graph: la regla «%/%» busca «%»/«%» en «%» y alguna no existe.',
          r.source_table, r.nombre, r.lookup_key, r.lookup_value, r.lookup_table
          using errcode = 'P0001';
      end if;
    end if;
  end loop;
end;
$fn$;

comment on function public.graph_edges_validar(text) is
  'Comprueba que las reglas de arista de una tabla sean generables: una sola función, una sola forma de ancla, y todas las columnas declaradas existentes. Ver 0058.';


-- =============================================================================
-- 5) EL GENERADOR
--
-- Emite un cuerpo plpgsql ESTÁTICO con las reglas ya inlineadas como literales.
-- En tiempo de ejecución no se consulta `graph_edge_rules` ni se arma ninguna
-- sentencia: el trigger hace exactamente las mismas llamadas a
-- `graph_system_edges` que hacía el código escrito a mano.
--
-- Un detalle que NO es cosmético: donde 0054 escribía
-- `case when x is null then '{}' else array[graph_node_of(x)] end`, el generador
-- escribe `array_remove(array[graph_node_of(x)], null)`. Cubre lo mismo y además
-- el caso que el original dejaba abierto: si el otro extremo existe pero NO está
-- proyectado, `graph_node_of` devuelve null y el original pasaba `{null}` — y
-- `x = any('{null}')` es NULL, así que el DELETE de reconciliación de
-- `graph_system_edges` no borraba nada y la arista vieja sobrevivía. Hoy no es
-- alcanzable (todas las columnas nulables de las once reglas ya iban guardadas),
-- pero lo sería en cuanto alguien añadiera una regla hacia una tabla no
-- proyectada, y ese fallo no da error: deja una arista mintiendo.
-- =============================================================================

create or replace function public.graph_edges_ddl(p_source_table text)
returns text
language plpgsql
stable
set search_path = public
as $fn$
declare
  r          public.graph_edge_rules%rowtype;
  v_fn       text;
  v_puente   boolean;
  v_ancla    text;
  v_necesita_scope boolean;
  v_destino  text;
  v_expr     text;
  v_decl     text;
  v_cuerpo   text := '';
  v_llamada  text;
begin
  perform public.graph_edges_validar(p_source_table);

  select distinct implementado_por into v_fn
    from public.graph_edge_rules where source_table = p_source_table;
  select bool_or(anchor_column is not null),
         bool_or(lookup_scope_column is not null)
    into v_puente, v_necesita_scope
    from public.graph_edge_rules where source_table = p_source_table;
  select max(anchor_column) into v_ancla
    from public.graph_edge_rules where source_table = p_source_table;

  if v_puente then
    v_decl := format(
      '  -- En un trigger de DELETE, NEW es un registro nulo y `new.%I` vale null.'
      || E'\n  v_clave uuid := coalesce(new.%I, old.%I);'
      || E'\n  v_node  uuid;'
      || E'\n  v_t     uuid[];',
      v_ancla, v_ancla, v_ancla)
      || case when v_necesita_scope then E'\n  v_scope uuid;' else '' end;
    v_cuerpo := E'  v_node := public.graph_node_of(v_clave);\n'
             || E'  if v_node is null then return null; end if;\n'
             || case when v_necesita_scope then
                  E'  select n.workspace_id into v_scope from public.graph_nodes n where n.id = v_node;\n'
                else '' end;
  else
    v_decl := '  v_node uuid := public.graph_node_of(new.id);';
    v_cuerpo := E'  if v_node is null then return null; end if;\n';
  end if;

  for r in select * from public.graph_edge_rules
            where source_table = p_source_table
            order by rel_type, nombre loop

    v_llamada := case when r.direction = 'in'
                      then 'public.graph_system_edges_in'
                      else 'public.graph_system_edges' end;

    if v_puente then
      -- Se reconstruye el conjunto ENTERO del ancla, no solo esta fila: es lo
      -- que hace que quitar un asignado borre su arista y deje las demás.
      if r.column_kind = 'via_lookup' then
        v_destino := format(
          '(select l.%I from public.%I l where l.%I = r.%I%s)',
          r.lookup_value, r.lookup_table, r.lookup_key, r.source_column,
          case when r.lookup_scope_column is null then ''
               else format(' and l.%I = v_scope', r.lookup_scope_column) end);
      else
        v_destino := format('r.%I', r.source_column);
      end if;

      v_cuerpo := v_cuerpo || format(
        E'\n  select coalesce(array_agg(x) filter (where x is not null), ''{}''::uuid[]) into v_t\n'
        || E'    from public.%I r\n'
        || E'    cross join lateral (select public.graph_node_of(%s) as x) lx\n'
        || E'   where r.%I = v_clave%s;\n'
        || E'  perform %s(v_node, %L, v_t);\n',
        p_source_table, v_destino, v_ancla,
        case when r.row_filter is null then '' else ' and (' || r.row_filter || ')' end,
        v_llamada, r.rel_type);

    else
      if r.column_kind = 'uuid_array' then
        v_expr := format(
          '(select coalesce(array_agg(x) filter (where x is not null), ''{}''::uuid[])'
          || E'\n       from unnest(coalesce(new.%I, ''{}''::uuid[])) as d'
          || E'\n       cross join lateral (select public.graph_node_of(d) as x) lx)',
          r.source_column);
      elsif r.column_kind = 'via_lookup' then
        v_expr := format(
          'array_remove(array[public.graph_node_of('
          || E'\n      (select l.%I from public.%I l where l.%I = new.%I))], null)',
          r.lookup_value, r.lookup_table, r.lookup_key, r.source_column);
      else
        v_expr := format('array_remove(array[public.graph_node_of(new.%I)], null)', r.source_column);
      end if;

      v_cuerpo := v_cuerpo || format(
        E'\n  -- %s · %s\n  perform %s(v_node, %L,\n    %s);\n',
        r.nombre, coalesce(nullif(r.notes, ''), r.column_kind), v_llamada, r.rel_type, v_expr);
    end if;
  end loop;

  return format(
    E'create or replace function public.%I() returns trigger\n'
    || E'language plpgsql\n'
    || E'security definer\n'
    || E'set search_path = public\n'
    || E'set row_security = off\n'
    || E'as $gen$\n'
    || E'-- GENERADA por public.graph_edges_ddl() a partir de graph_edge_rules.\n'
    || E'-- No editar a mano: `supabase test db` compara el resultado contra las\n'
    || E'-- reglas y cualquier cambio que no salga de ellas sale en rojo.\n'
    || E'declare\n%s\n'
    || E'begin\n%s'
    || E'  return null;\n'
    || E'end;\n'
    || E'$gen$;',
    v_fn, v_decl, v_cuerpo);
end;
$fn$;

comment on function public.graph_edges_ddl(text) is
  'El texto de la función de aristas que corresponde a las reglas de una tabla. Función pura: no instala nada. Ver 0058.';


create or replace function public.graph_install_edges(p_source_table text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
begin
  execute public.graph_edges_ddl(p_source_table);
end;
$fn$;

comment on function public.graph_install_edges(text) is
  'Sustituye el CUERPO de la función de aristas de una tabla por el que generan sus reglas. `create or replace` conserva el oid, así que el trigger sigue apuntando a ella y no hace falta ningún bloqueo sobre la tabla. Ver D-143.';


-- =============================================================================
-- 6) LA SUSTITUCIÓN
--
-- Siete `create or replace function`. Ni un `create trigger`, ni un `drop`, ni
-- un bloqueo sobre ninguna tabla de negocio.
-- =============================================================================

do $$
declare t text;
begin
  for t in select distinct source_table from public.graph_edge_rules order by 1 loop
    perform public.graph_install_edges(t);
  end loop;
end $$;


-- =============================================================================
-- 7) QUE LAS FUNCIONES GENERADAS SE HAYAN EJECUTADO DE VERDAD
--
-- `create or replace function` sobre plpgsql comprueba la SINTAXIS del cuerpo,
-- no que las columnas que menciona existan: una función generada con un nombre
-- de columna mal puesto se crearía sin protestar y fallaría en el primer
-- guardado de un usuario. Eso no puede salir de aquí sin ejecutarse.
--
-- Se dispara cada trigger sobre UNA fila real —un `update` que pone la columna a
-- su propio valor—, y después se vuelve a exigir que las reglas y las aristas
-- vivas coincidan. Una fila por tabla, no la tabla entera: basta para recorrer
-- todos los caminos del cuerpo generado y no cuesta una reescritura masiva.
--
-- `task_files` queda fuera y conviene saber por qué: su trigger de aristas es de
-- INSERT solamente (0054), así que ningún UPDATE lo despierta. Lo cubre la
-- prueba pgTAP, que inserta un archivo.
-- =============================================================================

do $$
declare
  v_t       text;
  v_col     text;
  v_fila    tid;
  v_actualiza boolean;
  v_hechas  text[] := '{}';
  v_n       int;
  v_detalle text;
begin
  for v_t in select distinct source_table from public.graph_edge_rules order by 1 loop
    -- ¿Despierta un UPDATE al trigger de aristas de esta tabla? El bit 16 de
    -- tgtype es UPDATE.
    select bool_or((t.tgtype & 16) <> 0) into v_actualiza
      from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join public.graph_edge_rules r on r.source_table = c.relname
     where not t.tgisinternal
       and c.relname = v_t
       and t.tgfoid::regproc::text = r.implementado_por;

    if not coalesce(v_actualiza, false) then
      continue;
    end if;

    select coalesce(anchor_column, source_column) into v_col
      from public.graph_edge_rules
     where source_table = v_t
     order by rel_type, nombre
     limit 1;

    -- Por `ctid` y no por `id`: `task_assignees` es una tabla puente con clave
    -- primaria compuesta y no tiene columna `id`. El ctid lo tiene toda fila.
    execute format('select ctid from public.%I limit 1', v_t) into v_fila;
    if v_fila is null then
      continue;   -- tabla vacía: no hay nada que ejercitar
    end if;

    execute format('update public.%I set %I = %I where ctid = %L', v_t, v_col, v_col, v_fila);
    v_hechas := v_hechas || v_t;
  end loop;

  raise notice 'graph: funciones de arista ejercitadas sobre una fila de: %',
    coalesce(array_to_string(v_hechas, ', '), '(ninguna — base vacía)');

  select count(*), string_agg(format('  · %s %s → %s (%s)', lado, source_id, target_id, rel_type), e'\n')
    into v_n, v_detalle
  from public.graph_edges_deriva();

  if v_n > 0 then
    raise exception
      'graph: tras sustituir las funciones de arista, las aristas vivas ya no coinciden con las reglas (% diferencia(s)):%',
      v_n, e'\n' || v_detalle
      using errcode = 'P0001';
  end if;
end $$;


-- =============================================================================
-- 8) EL BACKFILL DE ARISTAS
--
-- La otra mitad de `graph_backfill_source()` (0057 §9), y con el mismo
-- principio: no reimplementa la proyección, vuelve a disparar la que hay.
-- =============================================================================

create or replace function public.graph_backfill_edges(p_source_table text)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $fn$
declare
  v_col       text;
  v_actualiza boolean;
  v_n         bigint;
begin
  perform public.graph_edges_validar(p_source_table);

  select bool_or((t.tgtype & 16) <> 0) into v_actualiza
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join public.graph_edge_rules r on r.source_table = c.relname
   where not t.tgisinternal
     and c.relname = p_source_table
     and t.tgfoid::regproc::text = r.implementado_por;

  if not coalesce(v_actualiza, false) then
    raise exception
      'graph: el trigger de aristas de «%» no se dispara con UPDATE (en 0054 nació solo de INSERT), así que no se puede reconstruir volviendo a guardar.',
      p_source_table using errcode = 'P0001';
  end if;

  select coalesce(anchor_column, source_column) into v_col
    from public.graph_edge_rules
   where source_table = p_source_table
   order by rel_type, nombre
   limit 1;

  execute format('update public.%I set %I = %I', p_source_table, v_col, v_col);
  get diagnostics v_n = row_count;
  return v_n;
end;
$fn$;

comment on function public.graph_backfill_edges(text) is
  'Reconstruye las ARISTAS de una tabla volviendo a disparar su propio trigger. Complemento de graph_backfill_source(), que hace lo mismo con los nodos. Reescribe toda la tabla: es mantenimiento, no operación. Ver 0058 §8.';


-- =============================================================================
-- 9) PERMISOS DE EJECUCIÓN — mismo criterio que 0057 §11
-- =============================================================================

revoke execute on function public.graph_edges_validar(text) from public, anon;
revoke execute on function public.graph_edges_ddl(text)     from public, anon;
grant  execute on function public.graph_edges_validar(text) to authenticated;
grant  execute on function public.graph_edges_ddl(text)     to authenticated;

-- Emiten DDL, escriben tablas de negocio o leen aristas de todo el mundo.
revoke execute on function public.graph_install_edges(text)  from public, anon, authenticated;
revoke execute on function public.graph_backfill_edges(text) from public, anon, authenticated;
revoke execute on function public.graph_edges_expected()     from public, anon, authenticated;
revoke execute on function public.graph_edges_deriva()       from public, anon, authenticated;


-- =============================================================================
-- CÓMO SE REVIERTE
--
-- Las siete funciones conservan su nombre y su firma, así que revertir es
-- volver a ejecutar su `create or replace function` original — están literales
-- en `0054_execution_graph.sql` §10 (`graph_edges_task`, `graph_edges_project`,
-- `graph_edges_habit`, `graph_edges_note`, `graph_edges_task_file`,
-- `graph_edges_assignee`, `graph_edges_key_result`) y la de `graph_edges_project`
-- reescrita en `0056_dependencias_entre_proyectos.sql` §2, que es la vigente.
-- Los triggers no se han tocado, así que siguen apuntando a ellas.
--
-- Y después, si se quiere dejar el registro como estaba:
--
--   drop function if exists public.graph_backfill_edges(text);
--   drop function if exists public.graph_install_edges(text);
--   drop function if exists public.graph_edges_ddl(text);
--   drop function if exists public.graph_edges_validar(text);
--   drop function if exists public.graph_edges_deriva();
--   drop function if exists public.graph_edges_expected();
--   alter table public.graph_edge_rules
--     drop constraint graph_edge_rules_filtro_solo_en_puente,
--     drop constraint graph_edge_rules_lookup_completo,
--     drop column lookup_scope_column, drop column lookup_value,
--     drop column lookup_key, drop column lookup_table;
-- =============================================================================
