-- =============================================================================
-- 0061 · EL DINERO Y LOS CUADERNOS ENTRAN AL GRAFO
-- =============================================================================
--
-- Primer milestone que usa el registro para lo que se construyó: ampliar la
-- cobertura sin escribir plpgsql. Seis fuentes nuevas y tres reglas de arista,
-- casi todo en filas.
--
-- QUÉ ENTRA Y POR QUÉ
--   · Money OS — `accounts`, `debts`, `savings_goals`, `financial_goals`,
--     `liabilities`. La vista Dinero enseñaba inversiones, presupuestos y
--     activos, o sea el patrimonio sin las cuentas ni las deudas. Con esto
--     enseña el dinero.
--   · `notebooks`. Una nota colgaba del ESPACIO porque no existía el nodo
--     Cuaderno (0054 lo dejó escrito como limitación). Ahora cuelga de su
--     cuaderno y el cuaderno del espacio, que es la jerarquía real.
--
-- QUÉ SE QUEDA FUERA, A CONCIENCIA
--   · **El tiempo** (`occupations`, `daily_plans`, `reminders`). Se ofreció y
--     se pospuso el 2026-09-10; no se reabre por cuenta propia.
--   · **`knowledge_items`.** Es privada y su `project_id` apunta a un proyecto
--     que casi siempre vive en un espacio compartido, así que la única arista
--     que tendría está PROHIBIDA por la frontera (D-120) — igual que le pasa a
--     la bitácora. Sería un nodo isla en una vista donde no pega. Cuando haya
--     una vista de conocimiento privado, entra.
--   · **`folders`.** Un proyecto ya pertenece a su espacio, y una segunda
--     regla `belongs_to` sobre la misma fila se pisaría con la primera (ver §2).
--     Agrupar en el tablero no es una relación del dominio.
--   · **Hogar** (`family_members`). Puede guardar el nombre de un menor, y
--     `docs/SECURITY.md` tiene eso como decisión legal abierta (OD-016).
--     Proyectarlo a una tabla nueva no es algo que se haga de pasada.
--
-- Y DOS ARREGLOS a la maquinaria de 0058 que esta ampliación destapa. Los dos
-- son inofensivos hoy y habrían mordido en cuanto alguien añadiera la regla
-- equivocada: van primero, antes de tocar ningún dato.
--
-- Ver `docs/UNIVERSAL_GRAPH_ROADMAP.md` §M5 y D-148/D-149.
-- =============================================================================


-- =============================================================================
-- 1) ARREGLO · `graph_edges_expected` ignoraba `direction` en los arrays
--
-- La rama de `uuid_array` sacaba siempre la arista de la fila hacia cada uuid
-- del array. `financial_goals.account_ids` es la primera regla que va al revés
-- —son las CUENTAS las que apoyan a la meta—, así que sin esto el conjunto
-- derivado no cuadraría con el que produce la función generada y la migración
-- abortaría sin explicar el motivo.
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
      -- El `direction` también manda aquí. En 0058 esta rama lo ignoraba y
      -- siempre sacaba la arista de la fila hacia cada uuid del array, porque
      -- ninguna regla combinaba array con `in` todavía. La primera que lo hace
      -- —`financial_goals.account_ids`, donde son las CUENTAS las que apoyan a
      -- la meta— habría hecho que el conjunto derivado no cuadrara con el que
      -- produce la función generada, y la migración habría abortado sin decir
      -- por qué.
      v_sql := format(
        'select %s, %L, %s
           from public.%I f, unnest(coalesce(f.%I, ''{}''::uuid[])) as d
          where public.graph_node_of(f.%I) is not null
            and public.graph_node_of(d) is not null%s',
        case when r.direction = 'in' then 'public.graph_node_of(d)'
             else format('public.graph_node_of(f.%I)', v_ancla) end,
        r.rel_type,
        case when r.direction = 'in' then format('public.graph_node_of(f.%I)', v_ancla)
             else 'public.graph_node_of(d)' end,
        r.source_table, r.source_column, v_ancla, v_filtro);

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

-- =============================================================================
-- 2) ARREGLO · dos reglas con la misma relación sobre la misma fila se pisan
--
-- `graph_system_edges(origen, rel, destinos[])` RECONCILIA el conjunto: borra
-- las aristas `system` de ese par (origen, rel) que no estén en la lista. Dos
-- reglas que compartan tabla, relación y ancla se llamarían una detrás de otra
-- y cada una borraría lo que acaba de poner la anterior — el resultado
-- dependería del orden alfabético del nombre de la regla.
--
-- Hoy no ocurre, y no es porque nada lo impidiera: es que ninguna pareja ha
-- coincidido todavía. Al intentar añadir `folders` («un proyecto pertenece a su
-- carpeta» junto a «pertenece a su espacio») apareció de frente. El índice lo
-- convierte en un error de migración en vez de en aristas que parpadean.
-- =============================================================================

create unique index if not exists idx_graph_edge_rules_una_por_relacion
  on public.graph_edge_rules (source_table, rel_type, coalesce(anchor_column, ''));

comment on index public.idx_graph_edge_rules_una_por_relacion is
  'Una sola regla por (tabla, relación, ancla): graph_system_edges reconcilia el conjunto, así que dos reglas que compartan las tres se borrarían la una a la otra. Ver 0061 §2.';


-- =============================================================================
-- 3) EL INSTALADOR TAMBIÉN CREA EL TRIGGER DE ARISTAS
--
-- 0058 sustituía CUERPOS de funciones que ya existían, así que `create or
-- replace function` bastaba y no hacía falta tocar ningún trigger. Una fuente
-- NUEVA no tiene ninguno de los dos, y sin trigger la función generada no la
-- llama nadie: las aristas no aparecerían y nada daría error.
-- =============================================================================

create or replace function public.graph_edges_trigger_ddl(p_source_table text)
returns text
language plpgsql
stable
set search_path = public
as $fn$
declare
  v_fn      text;
  v_puente  boolean;
  v_cols    text;
begin
  perform public.graph_edges_validar(p_source_table);

  select distinct implementado_por into v_fn
    from public.graph_edge_rules where source_table = p_source_table;
  select bool_or(anchor_column is not null) into v_puente
    from public.graph_edge_rules where source_table = p_source_table;

  if v_puente then
    -- Una tabla puente tiene que despertar también al BORRAR: quitar la fila es
    -- exactamente lo que debe quitar la arista.
    return format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.%I()',
      'trg_graph_' || p_source_table || '_b_aristas', p_source_table, v_fn);
  end if;

  select string_agg(distinct quote_ident(source_column), ', ') into v_cols
    from public.graph_edge_rules where source_table = p_source_table;

  return format(
    'create trigger %I after insert or update of %s on public.%I for each row execute function public.%I()',
    'trg_graph_' || p_source_table || '_b_aristas', v_cols, p_source_table, v_fn);
end;
$fn$;

comment on function public.graph_edges_trigger_ddl(text) is
  'La sentencia CREATE TRIGGER de aristas que corresponde a las reglas de una tabla. Solo hace falta para una fuente nueva: las de 0054 ya lo tienen. Ver 0061 §3.';


create or replace function public.graph_install_edges(p_source_table text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $fn$
declare
  v_fn text;
begin
  execute public.graph_edges_ddl(p_source_table);

  select distinct implementado_por into v_fn
    from public.graph_edge_rules where source_table = p_source_table;

  -- El trigger solo se crea si no está. Volver a crearlo pediría ACCESS
  -- EXCLUSIVE sobre la tabla para dejarlo idéntico, que es justo lo que D-139
  -- y D-143 evitan.
  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname = 'public'
      and c.relname = p_source_table
      and t.tgfoid::regproc::text = v_fn
  ) then
    execute public.graph_edges_trigger_ddl(p_source_table);
  end if;
end;
$fn$;

revoke execute on function public.graph_edges_trigger_ddl(text) from public, anon;
grant  execute on function public.graph_edges_trigger_ddl(text) to authenticated;
revoke execute on function public.graph_install_edges(text) from public, anon, authenticated;


-- =============================================================================
-- 4) LOS TIPOS DE NODO NUEVOS
--
-- Un INSERT, como prometía 0054 («un catálogo crece con un INSERT mientras que
-- un CHECK crece con una migración»). Las posiciones se intercalan entre las
-- que ya había para que la leyenda salga agrupada por mundos y no por orden de
-- llegada.
--
-- `savings_goals` y `financial_goals` comparten el tipo `financial_goal`: son
-- dos tablas y una misma cosa a ojos de quien mira el mapa. El tipo no tiene
-- por qué ser la tabla — `entity_id` es único en todo el sistema, así que dos
-- fuentes pueden alimentar el mismo tipo sin ambigüedad.
-- =============================================================================

insert into public.graph_node_types (node_type, label, label_plural, color, is_projected, position) values
  ('notebook',       'Cuaderno',        'cuadernos',         'var(--c-blue)',  true,  75),
  ('account',        'Cuenta',          'cuentas',           'var(--c-green)', true, 115),
  ('debt',           'Deuda',           'deudas',            'var(--danger)',  true, 125),
  ('financial_goal', 'Meta financiera', 'metas financieras', 'var(--c-green)', true, 135),
  ('liability',      'Pasivo',          'pasivos',           'var(--danger)',  true, 145)
on conflict (node_type) do nothing;


-- =============================================================================
-- 5) LAS SEIS FUENTES
--
-- Todas de ámbito PRIVADO menos `notebooks`, y eso no es un detalle: Money OS
-- no tiene `workspace_id` en ninguna tabla y esa es la garantía que sostiene
-- BR-012. Declararlas `user` es lo que hace que la assertion nº 10 de
-- `0028_registro_del_grafo.sql` —que recorre este mismo registro— las cubra sin
-- que nadie escriba una prueba nueva.
--
-- Las listas blancas de metadatos llevan cifras y nombres, que es lo que el
-- lienzo necesita para la ficha del nodo. Lo que NO llevan, y es deliberado:
-- `financial_goals.family_member_id`. Apunta a `family_members`, que puede
-- guardar el nombre de un menor (OD-016), y no hay ninguna razón para que ese
-- vínculo viaje a una tabla nueva.
-- =============================================================================

insert into public.graph_sources (
  entity_table, node_type, scope, projector, label_column, tenant_column,
  metadata_fields, watch_columns, route_template, notes
) values
  ('accounts', 'account', 'user', 'user_row', 'name', 'user_id',
   '{type,currency,opening_balance}',
   '{name,type,currency,opening_balance}', '/money', ''),

  ('debts', 'debt', 'user', 'user_row', 'name', 'user_id',
   '{balance,rate,min_payment,due_day}',
   '{name,balance,rate,min_payment,due_day}', '/debt', ''),

  ('savings_goals', 'financial_goal', 'user', 'user_row', 'name', 'user_id',
   '{type,target,current_amount,target_date,priority,monthly}',
   '{name,type,target,current_amount,target_date,priority,monthly}', '/savings',
   'Comparte tipo con financial_goals: dos tablas, una misma cosa en el mapa.'),

  ('financial_goals', 'financial_goal', 'user', 'user_row', 'name', 'user_id',
   '{target,horizon,priority,current_amount}',
   '{name,target,horizon,priority,current_amount}', '/goals',
   'family_member_id se queda fuera de la lista blanca a propósito (OD-016).'),

  ('liabilities', 'liability', 'user', 'user_row', 'name', 'user_id',
   '{value,currency,as_of,source}',
   '{name,value,currency,as_of,source}', '/wealth', ''),

  ('notebooks', 'notebook', 'workspace', 'ws_row', 'title', 'workspace_id',
   '{icon,color}',
   '{title,icon,color}', '/notebooks',
   'Da a las notas el padre que les faltaba: hasta 0061 colgaban del espacio.');

-- project_column vacío y no null: `graph_project_ws_row` lee tg_argv[3] y usa la
-- cadena vacía como «esta tabla no tiene proyecto». Mismo contrato que
-- `workspaces` y `memberships` desde 0054.
update public.graph_sources set project_column = ''
 where entity_table = 'notebooks';

do $$
declare t text;
begin
  foreach t in array array['accounts','debts','savings_goals','financial_goals','liabilities','notebooks'] loop
    perform public.graph_install_source(t);
    perform public.graph_backfill_source(t);
  end loop;
end $$;


-- =============================================================================
-- 6) LAS ARISTAS
--
-- Dos reglas nuevas y una que CAMBIA de destino.
--
-- `financial_goals.account_ids` es la primera regla de array que va hacia
-- dentro: la arista sale de cada CUENTA y entra en la meta, no al revés. Se
-- eligió así porque es la dirección que contesta la pregunta útil —«si esta
-- cuenta se mueve, ¿qué metas se ven afectadas?»— y porque `supports` no está
-- marcada como `reversed`, así que el impacto viaja de la cuenta hacia la meta
-- igual que un hábito viaja hacia la meta que sostiene (0054).
--
-- Y la nota deja de colgar del espacio. 0054 lo dejó escrito como lo que era:
-- «no hay nodo de Cuaderno —no está entre los tipos que pide el producto—, así
-- que la nota cuelga directamente del espacio». Ahora lo hay.
-- =============================================================================

insert into public.graph_edge_rules (
  source_table, rel_type, nombre, source_column, column_kind, anchor_column,
  target_table, direction, implementado_por, notes
) values
  ('financial_goals', 'supports', 'cuentas', 'account_ids', 'uuid_array', null,
   'accounts', 'in', 'graph_edges_financial_goals',
   'La arista sale de la CUENTA y entra en la meta: es la dirección que contesta «si esta cuenta se mueve, ¿qué metas se ven afectadas?».'),

  ('notebooks', 'belongs_to', 'espacio', 'workspace_id', 'scalar_fk', null,
   'workspaces', 'out', 'graph_edges_notebooks', '');

-- La nota pasa de colgar del espacio (dos saltos, `via_lookup`) a colgar de su
-- cuaderno (una FK directa). El backfill de más abajo reconcilia: la arista
-- vieja hacia el espacio desaparece sola, porque `graph_system_edges` borra del
-- par (nota, belongs_to) lo que no esté en la lista nueva.
update public.graph_edge_rules
   set column_kind = 'scalar_fk',
       target_table = 'notebooks',
       lookup_table = null, lookup_key = null, lookup_value = null,
       notes = 'Hasta 0061 saltaba el cuaderno y colgaba del espacio, porque no existía el tipo de nodo Cuaderno.'
 where source_table = 'notes' and rel_type = 'belongs_to';

do $$
declare t text;
begin
  foreach t in array array['financial_goals','notebooks','notes'] loop
    perform public.graph_install_edges(t);
    perform public.graph_backfill_edges(t);
  end loop;
end $$;


-- =============================================================================
-- 7) QUE TODO CUADRE
--
-- Tres conjuntos vacíos: los triggers instalados coinciden con lo que el
-- registro declara, no falta ni sobra ningún nodo, y no falta ni sobra ninguna
-- arista. Si algo de lo de arriba proyectó de más o de menos, aquí aborta.
-- =============================================================================

do $$
declare
  v_n int;
  v_detalle text;
begin
  select count(*), string_agg(format('  · %s / %s: %s', entity_table, trigger_name, motivo), e'\n')
    into v_n, v_detalle from public.graph_registry_diff();
  if v_n > 0 then
    raise exception 'graph: los triggers no coinciden con el registro:%', e'\n' || v_detalle
      using errcode = 'P0001';
  end if;

  select count(*), string_agg(format('  · %s: faltan %s, sobran %s', entity_table, faltan, sobran), e'\n')
    into v_n, v_detalle from public.graph_registry_deriva();
  if v_n > 0 then
    raise exception 'graph: hay nodos sin proyectar o proyectados de más:%', e'\n' || v_detalle
      using errcode = 'P0001';
  end if;

  select count(*), string_agg(format('  · %s %s → %s (%s)', lado, source_id, target_id, rel_type), e'\n')
    into v_n, v_detalle from public.graph_edges_deriva();
  if v_n > 0 then
    raise exception 'graph: las aristas vivas no coinciden con las reglas:%', e'\n' || v_detalle
      using errcode = 'P0001';
  end if;
end $$;


-- =============================================================================
-- CÓMO SE REVIERTE
--
-- Las seis fuentes nuevas se sueltan enteras; la regla de `notes` hay que
-- devolverla a su forma de 0058 y reconstruir sus aristas, o quedará apuntando
-- a un cuaderno que ya no es nodo.
--
--   drop trigger if exists trg_graph_accounts_a_nodo on public.accounts;  -- y _z_borrado
--   …ídem para debts, savings_goals, financial_goals, liabilities, notebooks…
--   drop trigger if exists trg_graph_financial_goals_b_aristas on public.financial_goals;
--   drop trigger if exists trg_graph_notebooks_b_aristas on public.notebooks;
--   drop function if exists public.graph_edges_financial_goals();
--   drop function if exists public.graph_edges_notebooks();
--   delete from public.graph_edge_rules where source_table in ('financial_goals','notebooks');
--   update public.graph_edge_rules
--      set column_kind='via_lookup', target_table='workspaces',
--          lookup_table='notebooks', lookup_key='id', lookup_value='workspace_id'
--    where source_table='notes' and rel_type='belongs_to';
--   select public.graph_install_edges('notes');
--   select public.graph_backfill_edges('notes');
--   delete from public.graph_sources where entity_table in
--     ('accounts','debts','savings_goals','financial_goals','liabilities','notebooks');
--   delete from public.graph_nodes where entity_table in
--     ('accounts','debts','savings_goals','financial_goals','liabilities','notebooks');
--   delete from public.graph_node_types where node_type in
--     ('account','debt','financial_goal','liability','notebook');
--
-- Y regenerar `catalog.generated.ts`.
-- =============================================================================
