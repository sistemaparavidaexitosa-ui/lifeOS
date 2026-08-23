-- 0025_fix_accept_invitation_ambiguity.sql
-- Arregla un bug REAL de producción, no solo de las pruebas: aceptar una
-- invitación a un workspace fallaba siempre con
--
--   ERROR: column reference "workspace_id" is ambiguous
--   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
--   CONTEXT: PL/pgSQL function accept_invitation(uuid) line 40
--
-- POR QUÉ PASABA
-- `accept_invitation` declara `returns table (ok boolean, message text,
-- workspace_id uuid)`. En PL/pgSQL esos nombres son parámetros OUT, es decir
-- variables dentro del cuerpo. El `on conflict (workspace_id, user_id)` del
-- INSERT sobre `memberships` nombra columnas, pero `workspace_id` también es
-- una de esas variables, y Postgres se niega a adivinar cuál quisiste.
--
-- El bug estaba latente desde la 0022 y lo detectó el job `db` de CI:
-- supabase/tests/0006_invitations_accept.sql abortaba con "Bad plan. You
-- planned 11 tests but ran 8". Esa prueba ya existía y ya cubría este camino
-- —el camino feliz que crea la membresía—, así que no hace falta una prueba
-- nueva: con este arreglo, 0006 pasa completa.
--
-- POR QUÉ ESTE ARREGLO Y NO OTRO
--   * Renombrar los parámetros OUT romperia la app: src/app/invite/[token]/
--     actions.ts lee `row.ok`, `row.message` y `row.workspace_id` del RPC.
--   * `on conflict on constraint memberships_workspace_id_user_id_key` habría
--     funcionado, pero ata la función al nombre que Postgres le generó solo a
--     una restricción anónima de la 0003.
--   * `#variable_conflict use_column` es la respuesta documentada de PL/pgSQL
--     para exactamente este caso: ante un nombre ambiguo, gana la columna.
--     Es seguro aquí porque el resto de las variables van prefijadas (`v_`,
--     `p_`) y los tres parámetros OUT nunca se leen como variables — los
--     valores de retorno salen por `return query select ...`.
--
-- `create or replace function` conserva los GRANT/REVOKE de la 0022, así que
-- no se repiten aquí.

create or replace function public.accept_invitation(p_token uuid)
returns table (ok boolean, message text, workspace_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
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
