-- 0046_busqueda_sin_exactitud.sql — pgTAP: migración 0076.
--
-- «Tengo que ser muy muy exacto.» Lo que se prueba es que ya no: sin acentos,
-- sin mayúsculas y con una errata, `buscar_en_todo` y `graph_search` encuentran
-- lo que se nombró. Y lo que no puede romperse al aflojar la coincidencia: que
-- una usuaria siga sin ver lo de otra (las dos son SECURITY INVOKER y confían
-- en la RLS) y que `anon` no pueda llamar a la búsqueda nueva.

begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email) values
  ('e7111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sinexact-duena@test.local'),
  ('e7222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'sinexact-otra@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('e7111111-1111-4111-8111-111111111111', 'Dueña SinExact'),
  ('e7222222-2222-4222-8222-222222222222', 'Otra SinExact')
on conflict (user_id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'e7111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.books (id, user_id, title, author)
values ('e7333333-3333-4333-8333-333333333333', 'e7111111-1111-4111-8111-111111111111', 'Hábitos Atómicos', 'James Clear');
insert into public.debts (id, user_id, name)
values ('e7444444-4444-4444-8444-444444444444', 'e7111111-1111-4111-8111-111111111111', 'Préstamo Malpaso');

-- (a) Sin acentos ni mayúsculas.
select is(
  (select id from public.buscar_en_todo('habitos atomicos', array['books'])),
  'e7333333-3333-4333-8333-333333333333'::uuid,
  '«habitos atomicos» encuentra el libro «Hábitos Atómicos»'
);

select is(
  (select etiqueta from public.buscar_en_todo('james clear', array['books'])),
  'Hábitos Atómicos',
  'En books se busca también por autor, y la etiqueta sigue siendo el título'
);

-- (b) Una errata.
select is(
  (select id from public.buscar_en_todo('Malpso', array['debts'])),
  'e7444444-4444-4444-8444-444444444444'::uuid,
  'Una errata («Malpso») encuentra «Préstamo Malpaso»'
);

select is_empty(
  $$ select 1 from public.buscar_en_todo('malpaso', array['books']) $$,
  'Solo busca en las tablas de p_tablas: la deuda no sale si no se pidió debts'
);

-- (e) El grafo, sin acentos. El libro se proyectó a graph_nodes por su trigger.
select is(
  (select entity_id from public.graph_search('habitos atomicos') where entity_table = 'books'),
  'e7333333-3333-4333-8333-333333333333'::uuid,
  'graph_search encuentra «Hábitos Atómicos» escribiendo «habitos atomicos»'
);

select isnt_empty(
  $$ select 1 from public.graph_search('malpso') where entity_table = 'debts' $$,
  'graph_search tolera una errata'
);

-- (c) La otra usuaria no ve nada de la primera, con la búsqueda más ancha.
select set_config('request.jwt.claims', json_build_object('sub', 'e7222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.buscar_en_todo('habitos atomicos',
       array['projects','tasks','habits','routines','books','notes','notebooks','personal_goals','key_results','debts',
             'accounts','savings_goals','financial_goals','investments','assets','liabilities','occupations',
             'family_members','cashback_cards','identity_traits'])
     where id in ('e7333333-3333-4333-8333-333333333333', 'e7444444-4444-4444-8444-444444444444') $$,
  'Otra usuaria no encuentra el libro ajeno (SECURITY INVOKER: filtra la RLS)'
);

select is_empty(
  $$ select 1 from public.buscar_en_todo('malpaso', array['debts'])
     where id = 'e7444444-4444-4444-8444-444444444444' $$,
  'Otra usuaria no encuentra la deuda ajena'
);

select is_empty(
  $$ select 1 from public.graph_search('habitos atomicos')
     where entity_id = 'e7333333-3333-4333-8333-333333333333' $$,
  'Otra usuaria no encuentra el nodo ajeno en el grafo'
);

reset role;

-- (d) `anon` no la ejecuta: ni por la línea explícita ni por PUBLIC.
select ok(
  not has_function_privilege('anon', 'public.buscar_en_todo(text, text[], integer)', 'execute')
  and not has_function_privilege('anon', 'public.sin_acentos(text)', 'execute'),
  'anon no puede ejecutar buscar_en_todo ni sin_acentos'
);

select * from finish();
rollback;
