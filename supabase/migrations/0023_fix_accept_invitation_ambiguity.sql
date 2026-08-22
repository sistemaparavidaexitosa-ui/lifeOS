-- 0023_fix_accept_invitation_ambiguity.sql
--
-- FIX de la migración 0022, detectado por `supabase db test` en CI:
--
--   ERROR: column reference "workspace_id" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--   QUERY: ... on conflict (workspace_id, user_id) do update ...
--
-- CAUSA: accept_invitation declara `returns table (ok, message, workspace_id)`,
-- y en PL/pgSQL cada columna de RETURNS TABLE es también una VARIABLE de
-- salida. Dentro del cuerpo, `workspace_id` a secas resuelve a esa variable,
-- así que el destino del ON CONFLICT quedaba ambiguo. La función se CREA sin
-- problema (por eso 0022 se aplicó limpio); el error solo aparece al
-- EJECUTARLA — exactamente lo que atrapó la prueba del camino feliz en
-- supabase/tests/0006_invitations_accept.sql.
--
-- SOLUCIÓN: se elimina el ON CONFLICT y se hace el upsert explícito con la
-- tabla ALIASADA (`update public.memberships m ... where m.workspace_id = ...`).
-- Un alias no puede confundirse con una variable, así que la ambigüedad
-- desaparece de raíz, sin depender del pragma `#variable_conflict` (que
-- cambiaría la resolución en TODO el cuerpo) ni del nombre autogenerado de la
-- restricción única.
--
-- La FIRMA no cambia, así que basta CREATE OR REPLACE: no hace falta DROP y
-- la app y los tipos generados siguen igual. Sirve tanto para una base nueva
-- (aplica 0022 y luego esta) como para una donde 0022 ya se aplicó.

create or replace function public.accept_invitation(p_token uuid)
returns table (ok boolean, message text, workspace_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invitations%rowtype;
  v_user_id uuid := auth.uid();
  v_email text := auth.email();
  v_name text;
  v_member_name text;
begin
  if v_user_id is null then
    return query select false, 'Debes iniciar sesión para aceptar la invitación.'::text, null::uuid;
    return;
  end if;

  -- FOR UPDATE: dos clics simultáneos no pueden canjear el mismo token.
  select * into v_inv from public.invitations where token = p_token for update;
  if not found then
    return query select false, 'Invitación no encontrada.'::text, null::uuid;
    return;
  end if;

  if v_inv.status <> 'Pending' then
    return query select false, format('Esta invitación ya no está disponible (%s).', v_inv.status)::text, null::uuid;
    return;
  end if;

  if v_inv.expires_at < now() then
    update public.invitations set status = 'Expired' where id = v_inv.id;
    return query select false, 'La invitación expiró. Pide una nueva al administrador.'::text, null::uuid;
    return;
  end if;

  if lower(coalesce(v_email, '')) <> lower(v_inv.email) then
    return query select false,
      'Esta invitación es para otra dirección de correo. Inicia sesión con la cuenta invitada.'::text,
      null::uuid;
    return;
  end if;

  select p.name into v_name from public.profiles p where p.user_id = v_user_id;
  v_member_name := coalesce(nullif(v_name, ''), split_part(v_email, '@', 1));

  -- Upsert explícito y aliasado (ver nota de arriba). Si ya eras miembro se
  -- reactiva la membresía pero se CONSERVA tu rol actual: aceptar una
  -- invitación de "Viewer" no debe degradar a un Admin existente.
  update public.memberships m
     set status = 'Active',
         user_name = v_member_name
   where m.workspace_id = v_inv.workspace_id
     and m.user_id = v_user_id;

  if not found then
    insert into public.memberships (workspace_id, user_id, user_name, role, status)
    values (v_inv.workspace_id, v_user_id, v_member_name, v_inv.role, 'Active');
  end if;

  update public.invitations set status = 'Accepted' where id = v_inv.id;

  insert into public.workspace_activity (workspace_id, type, text, actor)
  values (v_inv.workspace_id, 'member', format('%s se unió al workspace', v_email), v_email);

  insert into public.audit_log (user_id, action, object, meta)
  values (v_user_id, 'invite.accept', v_inv.id::text, jsonb_build_object('workspace_id', v_inv.workspace_id, 'role', v_inv.role));

  return query select true, 'Listo, ya eres parte del workspace.'::text, v_inv.workspace_id;
end;
$$;

comment on function public.accept_invitation(uuid) is
  'Canjea el token de invitación: valida vigencia y que el correo de la sesión coincida con el invitado, crea o reactiva la membresía (conservando el rol si ya existía) y marca la invitación como Accepted. SECURITY DEFINER porque memberships_insert_admin exige ser Owner/Admin y el invitado todavía no lo es. No se usa en ninguna política RLS. Ver 0023: el upsert va aliasado para evitar la ambigüedad con la columna de retorno workspace_id.';

grant execute on function public.accept_invitation(uuid) to authenticated;
revoke execute on function public.accept_invitation(uuid) from anon;
