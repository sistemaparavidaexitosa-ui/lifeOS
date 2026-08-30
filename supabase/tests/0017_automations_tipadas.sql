-- 0017_automations_tipadas.sql — pgTAP: automatizaciones tipadas (0040).
-- Lo que se prueba es la barrera de la BASE: que los enums estén acotados y que
-- nadie vea ni cree reglas de otro. La decisión de qué dispara qué vive en el
-- dominio y se prueba sin base de datos.

begin;
select plan(6);

insert into auth.users (id, instance_id, aud, role, email) values
  ('d1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aut-duena@test.local'),
  ('d2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'aut-otra@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('d1111111-1111-4111-8111-111111111111', 'Dueña Aut'),
  ('d2222222-2222-4222-8222-222222222222', 'Otra Aut')
on conflict (user_id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'd1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.automations (id, user_id, name, trigger_type, trigger_params, action_type, action_params, authorized)
values ('e1111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'Anotar cierres',
        'task.status_changed', '{"to":"Completed"}'::jsonb, 'log_entry', '{"text":"Cerrada"}'::jsonb, true);

select is(
  (select trigger_params->>'to' from public.automations where id = 'e1111111-1111-4111-8111-111111111111'),
  'Completed',
  'Los parámetros del disparador se guardan tipados, no como una frase'
);

-- Los enums están acotados: la base es la última barrera, después de zod.
select throws_ok(
  $$ insert into public.automations (user_id, name, trigger_type, action_type)
     values ('d1111111-1111-4111-8111-111111111111', 'Inventada', 'cada.lunes', 'log_entry') $$,
  '23514',
  null,
  'Un disparador que no existe se rechaza: no hay disparos por tiempo'
);

select throws_ok(
  $$ insert into public.automations (user_id, name, trigger_type, action_type)
     values ('d1111111-1111-4111-8111-111111111111', 'Inventada', 'comment.added', 'borrar_todo') $$,
  '23514',
  null,
  'Una acción que no existe se rechaza'
);

-- El registro distingue lo ejecutado de lo PROPUESTO (FR-AUT-002).
insert into public.automation_runs (automation_id, result, outcome, detail)
values ('e1111111-1111-4111-8111-111111111111', 'Anotar cierres', 'proposed', 'sin autorizar');

select throws_ok(
  $$ insert into public.automation_runs (automation_id, result, outcome)
     values ('e1111111-1111-4111-8111-111111111111', 'x', 'exploto') $$,
  '23514',
  null,
  'El resultado de una ejecución está acotado: ran / proposed / failed / skipped'
);

-- Otra usuaria.
select set_config('request.jwt.claims', json_build_object('sub', 'd2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);

select is_empty(
  $$ select 1 from public.automations $$,
  'Las reglas son privadas: nadie ve las de otro'
);

select throws_ok(
  $$ insert into public.automations (user_id, name, trigger_type, action_type)
     values ('d1111111-1111-4111-8111-111111111111', 'Ajena', 'comment.added', 'log_entry') $$,
  'new row violates row-level security policy for table "automations"',
  'Nadie puede crear una regla en nombre de otra persona'
);

select * from finish();
rollback;
