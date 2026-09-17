-- 0040_arquitecto_de_manifestacion.sql — pgTAP: lo que el brief gana en 0067 y
-- el libro de estilo.
--
-- Lo que de verdad se fija aquí son tres invariantes que se rompen callados:
--   · la persona puede reaccionar y marcar hecha su acción, pero NO reescribir
--     el contenido del brief ni decir que lo escribió el agente;
--   · nadie puede hacer UPDATE sobre su propio resultado medido;
--   · borrar el brief borra lo que se aprendió de él (el cascade de privacidad).

begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email) values
  ('a1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manifiesto-titular@test.local'),
  ('a2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'manifiesto-otro@test.local')
on conflict (id) do nothing;

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.identity_briefs (
  id, user_id, local_date, affirmations, visualization, identity_reminder,
  reflection_question, quote, prompt_version, mantra, daily_action, focus_area
) values (
  'a3333333-3333-4333-8333-333333333333', 'a1111111-1111-4111-8111-111111111111', '2026-09-17',
  '[{"id":"a1","text":"Cumplo lo que me prometo","trait_id":null,"category":"Disciplina"},
    {"id":"a12","text":"Mi dinero trabaja mientras duermo","trait_id":null,"category":"Dinero"}]',
  '{"title":"t","duration_min":5,"steps":[]}',
  'Hoy votas por quien quieres ser', '¿Qué hiciste hoy que haría tu yo futuro?',
  '{"text":"x","principle":"dispenza"}', 1,
  'Hoy elijo la versión de mí que no negocia sus mañanas',
  '{"text":"Llama al cliente antes de las 11","trait_id":null,"area":"Carrera"}',
  'Carrera'
);

-- --- LO QUE LA PERSONA SÍ PUEDE ESCRIBIR ------------------------------------

update public.identity_briefs set reactions = '{"a12":"resuena"}';
select results_eq(
  $$ select reactions->>'a12' from public.identity_briefs $$,
  $$ values ('resuena') $$,
  'La reacción a la afirmación número doce se guarda (no solo a1..a5)'
);

update public.identity_briefs set action_done = true;
select results_eq(
  $$ select action_done from public.identity_briefs $$,
  $$ values (true) $$,
  'La persona marca hecha la acción del día'
);

-- --- LO QUE NO ---------------------------------------------------------------

select throws_ok(
  $$ update public.identity_briefs set mantra = 'escrito a mano' $$,
  '42501', null,
  'La persona no puede reescribir su mantra'
);

select throws_ok(
  $$ update public.identity_briefs set focus_area = 'Finanzas' $$,
  '42501', null,
  'La persona no puede cambiar su área de foco'
);

select throws_ok(
  $$ update public.identity_briefs set generator = 'py' $$,
  '42501', null,
  'La persona no puede decir que su brief lo escribió el agente'
);

-- --- LOS CHECKS DE FORMA ------------------------------------------------------

select throws_ok(
  $$ insert into public.identity_briefs (user_id, local_date, affirmations, visualization, identity_reminder, reflection_question, prompt_version, focus_area)
     values ('a1111111-1111-4111-8111-111111111111', '2026-09-18', '[]', '{}', '', '', 1, 'Productividad') $$,
  '23514', null,
  'El área de foco sale de las siete de 0064, no de las once categorías'
);

select throws_ok(
  $$ insert into public.identity_briefs (user_id, local_date, affirmations, visualization, identity_reminder, reflection_question, prompt_version, mantra)
     values ('a1111111-1111-4111-8111-111111111111', '2026-09-18', '[]', '{}', '', '', 1, 'no') $$,
  '23514', null,
  'Un mantra de dos letras no es un mantra'
);

-- --- LA QUINTA INSPIRACIÓN ----------------------------------------------------

insert into public.identity_profiles (user_id, desired_identity, inspirations)
values ('a1111111-1111-4111-8111-111111111111', 'Alguien que construye', '{hill,dispenza}');
select results_eq(
  $$ select 'dispenza' = any(inspirations) from public.identity_profiles $$,
  $$ values (true) $$,
  'Dispenza es una inspiración válida'
);

select throws_ok(
  $$ update public.identity_profiles set inspirations = '{tolle}' $$,
  '23514', null,
  'El catálogo de inspiraciones sigue cerrado'
);

-- --- EL LIBRO DE ESTILO -------------------------------------------------------

insert into public.identity_brief_style (brief_id, user_id, local_date, tone, length_bucket, scene_kind, affirmation_count)
values ('a3333333-3333-4333-8333-333333333333', 'a1111111-1111-4111-8111-111111111111', '2026-09-17', 'directo', 'media', 'logro', 12);

select throws_ok(
  $$ update public.identity_brief_style set outcome_score = 100 $$,
  '42501', null,
  'Nadie maquilla su propio resultado medido'
);

select throws_ok(
  $$ insert into public.identity_brief_style (brief_id, user_id, local_date, tone, length_bucket, scene_kind, affirmation_count)
     values ('a3333333-3333-4333-8333-333333333333', 'a2222222-2222-4222-8222-222222222222', '2026-09-17', 'sereno', 'corta', 'proceso', 5) $$,
  '42501', null,
  'No se etiqueta un brief a nombre de otra persona'
);

select set_config('request.jwt.claims', json_build_object('sub', 'a2222222-2222-4222-8222-222222222222', 'role', 'authenticated')::text, true);
select is_empty($$ select 1 from public.identity_brief_style $$, 'El libro de estilo ajeno no se ve');

-- --- EL CASCADE DE PRIVACIDAD -------------------------------------------------
-- «Borrar historial de IA» borra `identity_briefs`. Lo aprendido de ese
-- historial tiene que irse con él, y nadie va a acordarse de borrarlo a mano.

select set_config('request.jwt.claims', json_build_object('sub', 'a1111111-1111-4111-8111-111111111111', 'role', 'authenticated')::text, true);
delete from public.identity_briefs;
select is_empty(
  $$ select 1 from public.identity_brief_style $$,
  'Borrar el brief borra lo que se aprendió de él'
);

select * from finish();
rollback;
