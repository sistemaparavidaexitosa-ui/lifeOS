-- 0006_invitations_accept.sql — pgTAP: canje de invitaciones (migración 0022).
-- ⚠️ NO EJECUTADO en el entorno del asistente (sin supabase CLI/Docker aquí,
-- igual que 0001-0005 — ver /docs/CHECKS.md). Correr con: `supabase test db`.
--
-- Cubre exactamente los agujeros que tenía el flujo antes de la 0022:
-- token inexistente, correo distinto al invitado, invitación expirada,
-- doble canje (un solo uso) y el camino feliz creando la membresía.

begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email) values
  ('c1111111-1111-4111-8111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-inv@test.local'),
  ('c2222222-2222-4222-8222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'invitado@test.local'),
  ('c3333333-3333-4333-8333-333333333333', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'intruso@test.local')
on conflict (id) do nothing;

insert into public.profiles (user_id, name) values
  ('c1111111-1111-4111-8111-111111111111', 'OwnerInv'),
  ('c2222222-2222-4222-8222-222222222222', 'Invitado'),
  ('c3333333-3333-4333-8333-333333333333', 'Intruso')
on conflict (user_id) do nothing;

insert into public.workspaces (id, owner_id, name)
values ('c9999999-9999-4999-8999-999999999999', 'c1111111-1111-4111-8111-111111111111', 'Equipo de prueba');

insert into public.memberships (workspace_id, user_id, user_name, role, status)
values ('c9999999-9999-4999-8999-999999999999', 'c1111111-1111-4111-8111-111111111111', 'OwnerInv', 'Owner', 'Active');

-- Invitación vigente para invitado@test.local y otra ya vencida.
insert into public.invitations (id, workspace_id, email, role, token, expires_at)
values
  ('caaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'c9999999-9999-4999-8999-999999999999', 'invitado@test.local', 'Member',
   'c0000000-0000-4000-8000-000000000001', now() + interval '7 days'),
  ('cbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'c9999999-9999-4999-8999-999999999999', 'invitado@test.local', 'Member',
   'c0000000-0000-4000-8000-000000000002', now() - interval '1 day');

-- =========================================================================
-- invitation_preview: público, expone lo mínimo
-- =========================================================================
select is(
  (select state from public.invitation_preview('c0000000-0000-4000-8000-000000000001')),
  'Pending',
  'preview: una invitación vigente se reporta Pending'
);

select is(
  (select workspace_name from public.invitation_preview('c0000000-0000-4000-8000-000000000001')),
  'Equipo de prueba',
  'preview: devuelve el nombre del workspace'
);

select is(
  (select state from public.invitation_preview('c0000000-0000-4000-8000-000000000002')),
  'Expired',
  'preview: una invitación vencida se reporta Expired aunque status siga Pending'
);

select is(
  (select state from public.invitation_preview('c0000000-0000-4000-8000-00000000ffff')),
  'NotFound',
  'preview: un token inexistente no revela nada'
);

select isnt(
  (select email_hint from public.invitation_preview('c0000000-0000-4000-8000-000000000001')),
  'invitado@test.local',
  'preview: el correo se enmascara, no se expone completo'
);

-- =========================================================================
-- accept_invitation: rechazos
-- =========================================================================
set local role authenticated;
set local request.jwt.claims = '{"sub":"c3333333-3333-4333-8333-333333333333","email":"intruso@test.local","role":"authenticated"}';

select is(
  (select ok from public.accept_invitation('c0000000-0000-4000-8000-000000000001')),
  false,
  'accept: otro correo NO puede canjear la invitación aunque tenga el enlace'
);

select is(
  (select count(*)::int from public.memberships
    where workspace_id = 'c9999999-9999-4999-8999-999999999999'
      and user_id = 'c3333333-3333-4333-8333-333333333333'),
  0,
  'accept: el intruso no quedó como miembro'
);

set local request.jwt.claims = '{"sub":"c2222222-2222-4222-8222-222222222222","email":"invitado@test.local","role":"authenticated"}';

select is(
  (select ok from public.accept_invitation('c0000000-0000-4000-8000-000000000002')),
  false,
  'accept: una invitación vencida se rechaza (BR-013)'
);

-- =========================================================================
-- accept_invitation: camino feliz y un solo uso
-- =========================================================================
select is(
  (select ok from public.accept_invitation('c0000000-0000-4000-8000-000000000001')),
  true,
  'accept: el invitado correcto canjea su invitación'
);

select is(
  (select role from public.memberships
    where workspace_id = 'c9999999-9999-4999-8999-999999999999'
      and user_id = 'c2222222-2222-4222-8222-222222222222'),
  'Member',
  'accept: se creó la membresía con el rol invitado'
);

select is(
  (select ok from public.accept_invitation('c0000000-0000-4000-8000-000000000001')),
  false,
  'accept: el mismo token no sirve dos veces (un solo uso)'
);

-- =========================================================================
-- Regresiones de la migración 0023
-- =========================================================================
-- Aceptar una invitación de rol MENOR no debe degradar a un miembro que ya
-- tiene un rol mayor (el upsert conserva el rol existente).
insert into public.invitations (workspace_id, email, role, token)
values ('c9999999-9999-4999-8999-999999999999', 'owner-inv@test.local', 'Viewer',
        'c0000000-0000-4000-8000-000000000003');

set local request.jwt.claims = '{"sub":"c1111111-1111-4111-8111-111111111111","email":"owner-inv@test.local","role":"authenticated"}';

select is(
  (select ok from public.accept_invitation('c0000000-0000-4000-8000-000000000003')),
  true,
  'accept: un miembro existente puede aceptar sin error (upsert aliasado, fix 0023)'
);

select is(
  (select role from public.memberships
    where workspace_id = 'c9999999-9999-4999-8999-999999999999'
      and user_id = 'c1111111-1111-4111-8111-111111111111'),
  'Owner',
  'accept: aceptar una invitación de Viewer NO degrada a un Owner existente'
);

select * from finish();
rollback;
