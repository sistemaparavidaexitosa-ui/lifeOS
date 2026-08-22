-- 0022_workspace_invitations_accept.sql
--
-- Cierra el flujo de invitaciones a workspaces, que estaba a medias: la app
-- insertaba una fila en `invitations` y ahí terminaba todo.
--
-- QUÉ FALTABA (y por qué invitar no servía de nada):
--   1. El `token` se generaba en la base y NINGUNA línea de la app lo usaba.
--   2. No existía pantalla ni acción para aceptar una invitación.
--   3. Aunque existiera, RLS lo impedía por diseño:
--        - `invitations_all_admin` es FOR ALL restringido a Owner/Admin, así
--          que el invitado no puede ni LEER su propia invitación;
--        - `memberships_insert_admin` exige ser Owner/Admin para insertar una
--          membresía, y el invitado todavía no es miembro de nada.
--      Es el clásico problema del huevo y la gallina: el invitado necesita
--      permiso que solo obtendría después de aceptar.
--   4. `status` y `expires_at` eran decorativos: nada los leía ni actualizaba,
--      así que una invitación seguía "Pending" para siempre.
--
-- SOLUCIÓN: dos funciones SECURITY DEFINER que reciben el token como
-- credencial de un solo uso y hacen la validación completa dentro de la base.
--
-- ⚠️ Sobre SECURITY DEFINER y las migraciones 0011-0015: el riesgo de
-- recursión de RLS que se corrigió allí venía de funciones invocadas DESDE
-- una política. Estas dos NO se referencian en ninguna política — la app las
-- llama directo por RPC. No tocan, reescriben ni relajan ninguna política
-- existente: `invitations` y `memberships` conservan exactamente las suyas.

-- Un token es una credencial: debe ser único y estar indexado.
create unique index if not exists idx_invitations_token on public.invitations(token);
create index if not exists idx_invitations_email_status on public.invitations(lower(email), status);

-- =============================================================================
-- invitation_preview — qué ve el invitado ANTES de aceptar
-- =============================================================================
-- Devuelve lo mínimo para decidir (nombre del workspace, rol ofrecido y si
-- sigue vigente). Deliberadamente NO expone el email invitado completo ni la
-- lista de miembros: quien tenga el link no debe poder enumerar el equipo.
create or replace function public.invitation_preview(p_token uuid)
returns table (
  workspace_name text,
  role text,
  state text,
  expires_at timestamptz,
  email_hint text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inv public.invitations%rowtype;
  v_ws_name text;
begin
  select * into v_inv from public.invitations where token = p_token;
  if not found then
    return query select null::text, null::text, 'NotFound'::text, null::timestamptz, null::text;
    return;
  end if;

  select w.name into v_ws_name from public.workspaces w where w.id = v_inv.workspace_id;

  return query
  select
    v_ws_name,
    v_inv.role,
    case
      when v_inv.status <> 'Pending' then v_inv.status
      when v_inv.expires_at < now() then 'Expired'
      else 'Pending'
    end,
    v_inv.expires_at,
    -- "lu***@gmail.com": suficiente para que el invitado sepa con qué cuenta
    -- entrar, sin filtrar la dirección completa a quien reenvíe el link.
    regexp_replace(v_inv.email, '^(.{1,2})[^@]*@', '\1***@');
end;
$$;

comment on function public.invitation_preview(uuid) is
  'Datos mínimos de una invitación para la pantalla /invite/[token]. SECURITY DEFINER porque el invitado aún no puede leer la tabla (invitations_all_admin). No se usa en ninguna política RLS.';

-- =============================================================================
-- accept_invitation — canjea el token y crea la membresía
-- =============================================================================
-- Reglas, todas verificadas aquí y de forma atómica:
--   * el token debe existir y estar 'Pending';
--   * no debe haber expirado (BR-013);
--   * el correo de la sesión debe ser EL MISMO de la invitación (sin
--     distinguir mayúsculas). Sin esto, cualquiera con el link entraría al
--     workspace — que es justo lo que el token por sí solo no garantiza;
--   * un solo uso: la fila pasa a 'Accepted' en la misma transacción;
--   * idempotente: si ya eras miembro, no duplica (unique workspace_id+user_id)
--     y conserva tu rol actual en vez de degradarlo.
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

  insert into public.memberships (workspace_id, user_id, user_name, role, status)
  values (v_inv.workspace_id, v_user_id, coalesce(nullif(v_name, ''), split_part(v_email, '@', 1)), v_inv.role, 'Active')
  on conflict (workspace_id, user_id) do update
    set status = 'Active',
        user_name = excluded.user_name;

  update public.invitations set status = 'Accepted' where id = v_inv.id;

  insert into public.workspace_activity (workspace_id, type, text, actor)
  values (v_inv.workspace_id, 'member', format('%s se unió al workspace', v_email), v_email);

  insert into public.audit_log (user_id, action, object, meta)
  values (v_user_id, 'invite.accept', v_inv.id::text, jsonb_build_object('workspace_id', v_inv.workspace_id, 'role', v_inv.role));

  return query select true, 'Listo, ya eres parte del workspace.'::text, v_inv.workspace_id;
end;
$$;

comment on function public.accept_invitation(uuid) is
  'Canjea el token de invitación: valida vigencia y que el correo de la sesión coincida con el invitado, crea la membresía (idempotente) y marca la invitación como Accepted. SECURITY DEFINER porque memberships_insert_admin exige ser Owner/Admin y el invitado todavía no lo es. No se usa en ninguna política RLS.';

-- =============================================================================
-- GRANTS (F9 — sin esto el RPC devuelve "permission denied")
-- =============================================================================
-- invitation_preview también para `anon`: la pantalla de la invitación debe
-- poder mostrar "te invitaron a X" ANTES de que el invitado inicie sesión.
grant execute on function public.invitation_preview(uuid) to anon, authenticated;
-- accept_invitation solo para sesiones reales: el canje exige identidad.
revoke execute on function public.accept_invitation(uuid) from anon;
grant execute on function public.accept_invitation(uuid) to authenticated;
