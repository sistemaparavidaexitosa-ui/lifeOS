-- 0037_identidad.sql — pgTAP: perfil, rasgos, votos, revisiones y puntuaciones (0064).

begin;
select plan(16);

insert into auth.users (id, instance_id, aud, role, email) values
  ('e1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'id-titular@test.local'),
  ('e2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'id-otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('e1111111-1111-4111-8111-111111111111', 'Titular Identidad'),
  ('e2222222-2222-4222-8222-222222222222', 'Otro Identidad')
on conflict (user_id) do nothing;

-- El rasgo ajeno se siembra como superusuario, antes de impersonar.
insert into public.identity_traits (id, user_id, name)
values ('e9999999-9999-4999-8999-999999999999', 'e2222222-2222-4222-8222-222222222222', 'Rasgo ajeno');

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.identity_profiles (user_id, desired_identity, core_values)
values ('e1111111-1111-4111-8111-111111111111', 'Soy disciplinado', '{constancia}');

select throws_ok(
  $$ update public.identity_profiles set motivational_tone = 'gritón' $$,
  '23514', null,
  'El tono solo admite sereno, directo o intenso'
);
select throws_ok(
  $$ update public.identity_profiles set inspirations = '{hill,tolkien}' $$,
  '23514', null,
  'Las inspiraciones salen de una lista cerrada'
);

-- Cambiar la identidad deja rastro de lo que había; cambiar el tono, no.
update public.identity_profiles set motivational_tone = 'sereno';
select is_empty($$ select 1 from public.identity_revisions $$, 'Cambiar el tono no es una revisión de identidad');
update public.identity_profiles set desired_identity = 'Soy libre financieramente';
select results_eq(
  $$ select desired_identity from public.identity_revisions $$,
  $$ values ('Soy disciplinado'::text) $$,
  'Cambiar la identidad guarda la versión anterior'
);
select throws_ok(
  $$ insert into public.identity_revisions (user_id, desired_identity, vision_statement, core_values)
     values ('e1111111-1111-4111-8111-111111111111', 'falsa', '', '{}') $$,
  '42501', null,
  'Nadie escribe revisiones a mano'
);

insert into public.routines (id, user_id, name, frequency)
values ('e3333333-3333-4333-8333-333333333333', 'e1111111-1111-4111-8111-111111111111', 'Mañana', 'Diario');
insert into public.habits (id, user_id, name, category, routine_id)
values ('e4444444-4444-4444-8444-444444444444', 'e1111111-1111-4111-8111-111111111111', 'Entrenar', 'Salud',
        'e3333333-3333-4333-8333-333333333333');
insert into public.identity_traits (id, user_id, name, area)
values ('e5555555-5555-4555-8555-555555555555', 'e1111111-1111-4111-8111-111111111111', 'Atleta', 'Salud');

select throws_ok(
  $$ insert into public.identity_traits (user_id, name, area)
     values ('e1111111-1111-4111-8111-111111111111', 'Raro', 'Marte') $$,
  '23514', null,
  'El área es la de personal_goals'
);

insert into public.habit_identity_traits (habit_id, trait_id)
values ('e4444444-4444-4444-8444-444444444444', 'e5555555-5555-4555-8555-555555555555');

select throws_ok(
  $$ insert into public.habit_identity_traits (habit_id, trait_id)
     values ('e4444444-4444-4444-8444-444444444444', 'e9999999-9999-4999-8999-999999999999') $$,
  'P0001', 'Un hábito solo puede votar por un rasgo de tu propia identidad.',
  'No se vota por el rasgo de otra persona'
);

select throws_ok(
  $$ insert into public.identity_scores (user_id, local_date, score, formula_version)
     values ('e1111111-1111-4111-8111-111111111111', '2026-09-15', 99, 1) $$,
  '42501', null,
  'La persona no puede escribirse su propia puntuación'
);

select is_empty(
  $$ select 1 from public.identity_traits where user_id <> 'e1111111-1111-4111-8111-111111111111' $$,
  'Los rasgos ajenos no se ven'
);

reset role;

-- El grafo: el rasgo es nodo y el voto es arista hábito → rasgo.
select isnt_empty(
  $$ select 1 from public.graph_nodes where entity_id = 'e5555555-5555-4555-8555-555555555555' and node_type = 'identity_trait' $$,
  'El rasgo se proyecta como nodo'
);
select isnt_empty(
  $$ select 1 from public.graph_edges e
       join public.graph_nodes s on s.id = e.source_id and s.entity_id = 'e4444444-4444-4444-8444-444444444444'
       join public.graph_nodes t on t.id = e.target_id and t.entity_id = 'e5555555-5555-4555-8555-555555555555'
      where e.rel_type = 'supports' $$,
  'El voto del hábito es una arista supports hacia el rasgo'
);

delete from public.habit_identity_traits where habit_id = 'e4444444-4444-4444-8444-444444444444';
select is_empty(
  $$ select 1 from public.graph_edges e
       join public.graph_nodes t on t.id = e.target_id and t.entity_id = 'e5555555-5555-4555-8555-555555555555' $$,
  'Quitar el voto borra la arista'
);

insert into public.identity_scores (user_id, local_date, score, components, formula_version)
values ('e1111111-1111-4111-8111-111111111111', '2026-09-15', 72, '[{"key":"constancia","value":80}]', 1);

select set_config('request.jwt.claims', json_build_object('sub', 'e1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;
select results_eq($$ select score from public.identity_scores $$, $$ values (72::smallint) $$, 'La persona lee su puntuación');

select set_config('request.jwt.claims', json_build_object('sub', 'e2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select is_empty($$ select 1 from public.identity_scores $$, 'La puntuación ajena no se ve');
select is_empty($$ select 1 from public.identity_profiles $$, 'El perfil ajeno no se ve');
select is_empty($$ select 1 from public.identity_revisions $$, 'Las revisiones ajenas no se ven');

select * from finish();
rollback;
