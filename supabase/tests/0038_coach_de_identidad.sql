-- 0038_coach_de_identidad.sql — pgTAP: el brief del día (0065).

begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('f1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'brief-titular@test.local'),
  ('f2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'brief-otro@test.local')
on conflict (id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.identity_briefs (id, user_id, local_date, affirmations, visualization, identity_reminder, reflection_question, quote, prompt_version)
values ('f3333333-3333-4333-8333-333333333333', 'f1111111-1111-4111-8111-111111111111', '2026-09-15',
        '[{"id":"a1","text":"Cumplo lo que me prometo","trait_id":null}]', '{"title":"t","duration_min":3,"steps":[]}',
        'Hoy votas por quien quieres ser', '¿Qué hiciste hoy que haría tu yo futuro?', '{"text":"x","principle":"clear"}', 1);

select throws_ok(
  $$ insert into public.identity_briefs (user_id, local_date, affirmations, visualization, identity_reminder, reflection_question, prompt_version)
     values ('f1111111-1111-4111-8111-111111111111', '2026-09-15', '[]', '{}', '', '', 1) $$,
  '23505', null,
  'Un brief por día'
);

update public.identity_briefs set reactions = '{"a1":"resuena"}';
select results_eq($$ select reactions->>'a1' from public.identity_briefs $$, $$ values ('resuena') $$, 'La persona reacciona a su brief');

select throws_ok(
  $$ update public.identity_briefs set identity_reminder = 'escrito a mano' $$,
  '42501', null,
  'La persona no puede reescribir el contenido del brief'
);

select throws_ok(
  $$ insert into public.identity_briefs (user_id, local_date, affirmations, visualization, identity_reminder, reflection_question, prompt_version, generation)
     values ('f1111111-1111-4111-8111-111111111111', '2026-09-16', '[]', '{}', '', '', 1, 4) $$,
  '23514', null,
  'Como mucho tres generaciones'
);

select throws_ok(
  $$ insert into public.identity_briefs (user_id, local_date, affirmations, visualization, identity_reminder, reflection_question, prompt_version)
     values ('f2222222-2222-4222-8222-222222222222', '2026-09-16', '[]', '{}', '', '', 1) $$,
  '42501', null,
  'No se escribe un brief a nombre de otra persona'
);

select set_config('request.jwt.claims', json_build_object('sub', 'f2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select is_empty($$ select 1 from public.identity_briefs $$, 'El brief ajeno no se ve');

select set_config('request.jwt.claims', json_build_object('sub', 'f1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
delete from public.identity_briefs;
select is_empty($$ select 1 from public.identity_briefs $$, 'La persona puede borrar su brief (borrar historial de IA)');

select * from finish();
rollback;
