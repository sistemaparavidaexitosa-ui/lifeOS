-- 0039_insights_nocturnos.sql — pgTAP: la guarda de los trabajos de IA del reloj (0066).

begin;
select plan(4);

insert into auth.users (id, instance_id, aud, role, email) values
  ('a7777777-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'jobs@test.local')
on conflict (id) do nothing;

insert into public.ai_job_runs (user_id, job, local_date, facts_hash)
values ('a7777777-1111-4111-8111-111111111111', 'insights.habits', '2026-09-15', 'abc');

select throws_ok(
  $$ insert into public.ai_job_runs (user_id, job, local_date) values ('a7777777-1111-4111-8111-111111111111', 'insights.habits', '2026-09-15') $$,
  '23505', null,
  'Un intento por trabajo, persona y día'
);
select lives_ok(
  $$ insert into public.ai_job_runs (user_id, job, local_date) values ('a7777777-1111-4111-8111-111111111111', 'insights.habits', '2026-09-16') $$,
  'Otro día es otro intento'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a7777777-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

select throws_ok($$ select 1 from public.ai_job_runs $$, '42501', null, 'La persona no lee la tabla de trabajos');
select throws_ok(
  $$ insert into public.ai_job_runs (user_id, job, local_date) values ('a7777777-1111-4111-8111-111111111111', 'x', '2026-09-17') $$,
  '42501', null,
  'La persona no escribe en la tabla de trabajos'
);

select * from finish();
rollback;
