-- 0032_dinero_y_cuadernos.sql — pgTAP: la cobertura de Money OS (0061).
--
-- POR QUÉ EXISTE, Y POR QUÉ LA PRUEBA Nº 3 ES LA QUE IMPORTA
-- Este es el milestone que mete Money OS en `graph_nodes`, que es la única
-- tabla del sistema donde una fila de dinero y una de un proyecto compartido
-- viven bajo la misma política (D-120). Ninguna tabla de Money OS tiene
-- `workspace_id` —esa es la garantía que sostiene BR-012 según
-- `docs/SECURITY.md`— y proyectarlas no puede abrir una puerta por detrás.
--
-- La assertion nº 10 de `0028_registro_del_grafo.sql` ya cubre esto de forma
-- genérica, recorriendo el registro: cada fuente nueva nace con esa
-- comprobación puesta. Lo de aquí es la otra mitad, la concreta: que una
-- persona de tu espacio de trabajo no alcance tus cuentas ni tus deudas por
-- ningún camino del grafo.

begin;
select plan(9);

insert into auth.users (id, instance_id, aud, role, email) values
  ('e9111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dinero-ana@test.local'),
  ('e9222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'dinero-beto@test.local')
on conflict (id) do nothing;

insert into public.workspaces (id, owner_id, name, is_personal)
values ('e9999999-9999-4999-8999-999999999999', 'e9111111-1111-4111-8111-111111111111', 'Espacio del dinero', false);
insert into public.memberships (workspace_id, user_id, user_name, role, status) values
  ('e9999999-9999-4999-8999-999999999999', 'e9111111-1111-4111-8111-111111111111', 'Ana',  'Owner',  'Active'),
  ('e9999999-9999-4999-8999-999999999999', 'e9222222-2222-4222-8222-222222222222', 'Beto', 'Member', 'Active');

-- El dinero de Ana.
insert into public.accounts (id, user_id, name, type, currency, opening_balance)
values ('e9aa0000-0000-4000-8000-000000000001', 'e9111111-1111-4111-8111-111111111111', 'Cuenta de ahorro', 'bank', 'MXN', 1000);
insert into public.debts (id, user_id, name, balance, rate, min_payment, due_day)
values ('e9bb0000-0000-4000-8000-000000000001', 'e9111111-1111-4111-8111-111111111111', 'Tarjeta', 5000, 0.3, 500, 15);
insert into public.financial_goals (id, user_id, name, target, account_ids)
values ('e9cc0000-0000-4000-8000-000000000001', 'e9111111-1111-4111-8111-111111111111', 'Enganche', 200000,
        array['e9aa0000-0000-4000-8000-000000000001'::uuid]);

-- Un cuaderno con su nota, en el espacio compartido.
insert into public.notebooks (id, workspace_id, title)
values ('e9dd0000-0000-4000-8000-000000000001', 'e9999999-9999-4999-8999-999999999999', 'Cuaderno del equipo');
insert into public.notes (id, notebook_id, title)
values ('e9ee0000-0000-4000-8000-000000000001', 'e9dd0000-0000-4000-8000-000000000001', 'Un acta');


-- ===========================================================================
-- 1-2) LAS SEIS FUENTES PROYECTAN
-- ===========================================================================
select is(
  (select count(*)::int from public.graph_nodes
    where entity_id in ('e9aa0000-0000-4000-8000-000000000001',
                        'e9bb0000-0000-4000-8000-000000000001',
                        'e9cc0000-0000-4000-8000-000000000001',
                        'e9dd0000-0000-4000-8000-000000000001')),
  4,
  'La cuenta, la deuda, la meta financiera y el cuaderno son nodos'
);

select is(
  (select string_agg(distinct node_type, ',' order by node_type) from public.graph_nodes
    where entity_table in ('accounts', 'debts', 'financial_goals', 'savings_goals')),
  'account,debt,financial_goal',
  'Cada tabla de dinero proyecta su tipo, y las dos de metas comparten uno'
);


-- ===========================================================================
-- 3) BR-012 · EL DINERO SIGUE SIENDO PRIVADO
--
-- La que importa. Si una fuente de Money OS se declarara de ámbito espacio por
-- error, sus filas quedarían bajo `graph_nodes_select_espacio` y las verían los
-- compañeros. Aquí se comprueba por los dos caminos: la RLS directa y el
-- recorrido, que camina con la RLS apagada y se protege solo.
-- ===========================================================================
select is(
  (select count(*)::int from public.graph_sources
    where entity_table in ('accounts','debts','savings_goals','financial_goals','liabilities')
      and scope <> 'user'),
  0,
  'Ninguna fuente de Money OS se declara de ámbito espacio'
);

select set_config('request.jwt.claims',
  json_build_object('sub', 'e9222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
set local role authenticated;

select is_empty(
  $$ select id from public.graph_nodes
      where entity_table in ('accounts', 'debts', 'financial_goals') $$,
  'Un compañero de espacio no ve por RLS ni una cuenta, ni una deuda, ni una meta financiera ajena'
);

select is(
  (select count(*)::int from public.graph_all(
     array['account','debt','financial_goal','liability'], 'user', 500)),
  0,
  'Ni las alcanza recorriendo: graph_all camina con la RLS apagada y se protege solo'
);

reset role;
select set_config('request.jwt.claims', null, true);


-- ===========================================================================
-- 4-5) LA JERARQUÍA NUEVA
-- ===========================================================================
select is(
  (select tn.node_type from public.graph_edges e
     join public.graph_nodes sn on sn.id = e.source_id
     join public.graph_nodes tn on tn.id = e.target_id
    where sn.entity_id = 'e9ee0000-0000-4000-8000-000000000001'
      and e.rel_type = 'belongs_to'),
  'notebook',
  'Una nota cuelga de su CUADERNO, no del espacio: hasta 0061 no había dónde colgarla'
);

-- La arista va de la cuenta HACIA la meta, no al revés: es la dirección que
-- contesta «si esta cuenta se mueve, ¿qué metas se ven afectadas?».
select is(
  (select sn.node_type || '->' || tn.node_type from public.graph_edges e
     join public.graph_nodes sn on sn.id = e.source_id
     join public.graph_nodes tn on tn.id = e.target_id
    where tn.entity_id = 'e9cc0000-0000-4000-8000-000000000001'
      and e.rel_type = 'supports'),
  'account->financial_goal',
  'La cuenta apoya a la meta financiera, y la flecha sale de la cuenta'
);

update public.financial_goals set account_ids = '{}'
 where id = 'e9cc0000-0000-4000-8000-000000000001';
select is_empty(
  $$ select e.source_id from public.graph_edges e
       join public.graph_nodes tn on tn.id = e.target_id
      where tn.entity_id = 'e9cc0000-0000-4000-8000-000000000001'
        and e.rel_type = 'supports' $$,
  'Quitar la cuenta del array borra la arista: un array que va hacia dentro reconcilia igual que uno que va hacia fuera'
);


-- ===========================================================================
-- 6) DOS REGLAS CON LA MISMA RELACIÓN SOBRE LA MISMA FILA SE RECHAZAN
--
-- `graph_system_edges` reconcilia el conjunto de (origen, relación), así que
-- dos reglas que compartan tabla, relación y ancla se borrarían la una a la
-- otra y el resultado dependería del orden alfabético del nombre. Apareció al
-- intentar añadir `folders` en 0061 y se cerró con un índice único.
-- ===========================================================================
select throws_ok(
  $$ insert into public.graph_edge_rules
       (source_table, rel_type, nombre, source_column, column_kind,
        target_table, implementado_por)
     values ('notebooks', 'belongs_to', 'otra', 'workspace_id', 'scalar_fk',
             'workspaces', 'graph_edges_notebooks') $$,
  '23505', null,
  'No se puede declarar una segunda regla `belongs_to` sobre la misma tabla: se pisarían'
);

select * from finish();
rollback;
