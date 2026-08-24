-- 0008_rls_intelligence.sql — pgTAP: Intelligence OS (migraciones 0008 y 0027).
-- Se corre con `supabase test db` (local, sobre Docker) y en el job `db` de CI.
--
-- Cubre lo que la Fase 2 añadió a la base: el índice parcial que impide que un
-- análisis repetido duplique recomendaciones, el opt-in apagado por defecto, y
-- que ni las recomendaciones ni la memoria de un usuario sean visibles para otro
-- (BR-012: el módulo entero es privado por user_id).

begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-titular@test.local'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ai-otro@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'Titular IA'),
  ('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'Otro IA')
on conflict (user_id) do nothing;

-- El opt-in nace vacío: ningún dominio sale hacia el modelo hasta que el
-- usuario lo encienda (§4.2).
select is(
  (select ai_domains from public.profiles where user_id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'),
  '{}'::text[],
  'ai_domains arranca vacío: el opt-in está apagado por defecto'
);

select set_config('request.jwt.claims', json_build_object('sub', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'role', 'authenticated')::text, true);
set local role authenticated;

insert into public.recommendations (id, user_id, type, text, confidence, domain, impact, status, fingerprint)
values ('cccccccc-3333-4333-8333-cccccccccccc', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'presupuesto', 'Alimentos excedido', 'Alta', 'money', 'Alto', 'Presented', 'huella-1');

insert into public.memory_items (id, user_id, scope, text)
values ('dddddddd-4444-4444-8444-dddddddddddd', 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'finance', 'Liquidar la tarjeta antes de diciembre');

-- Analizar dos veces no puede duplicar la misma recomendación viva (§5.2).
select throws_ok(
  $$ insert into public.recommendations (user_id, type, text, confidence, domain, impact, status, fingerprint)
     values ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'presupuesto', 'Alimentos excedido otra vez', 'Alta', 'money', 'Alto', 'Presented', 'huella-1') $$,
  '23505',
  null,
  'una recomendación viva con la misma huella no se puede duplicar'
);

-- Pero una ya resuelta no bloquea el tema para siempre: si las cifras cambian,
-- el motor tiene que poder volver a plantearlo.
update public.recommendations set status = 'Dismissed' where id = 'cccccccc-3333-4333-8333-cccccccccccc';
insert into public.recommendations (user_id, type, text, confidence, domain, impact, status, fingerprint)
values ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'presupuesto', 'Alimentos excedido de nuevo', 'Alta', 'money', 'Alto', 'Presented', 'huella-1');
select is(
  (select count(*)::int from public.recommendations where fingerprint = 'huella-1'),
  2,
  'con la anterior descartada, la misma huella puede volver a entrar'
);

-- La memoria solo admite los dos orígenes del diseño (§6).
select throws_ok(
  $$ insert into public.memory_items (user_id, scope, text, origin)
     values ('aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', 'finance', 'origen falso', 'inventado') $$,
  '23514',
  null,
  'memory_items.origin solo acepta user o ai'
);

-- El otro usuario no ve nada de esto.
select set_config('request.jwt.claims', json_build_object('sub', 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', 'role', 'authenticated')::text, true);
select is_empty(
  $$ select 1 from public.recommendations $$,
  'Otro usuario no ve las recomendaciones del titular (BR-012)'
);
select is_empty(
  $$ select 1 from public.memory_items $$,
  'Otro usuario no ve la memoria del titular'
);
select is_empty(
  $$ select 1 from public.audit_log $$,
  'Otro usuario no ve la bitácora de análisis del titular'
);

select * from finish();
rollback;
