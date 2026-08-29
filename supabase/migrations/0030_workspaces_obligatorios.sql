-- 0030_workspaces_obligatorios.sql
--
-- TODO PROYECTO VIVE EN UN WORKSPACE (modelo Notion/monday.com).
--
-- QUÉ ESTABA MAL
-- `projects.workspace_id` era nullable y eso daba dos clases de proyecto con
-- reglas distintas: el personal (workspace_id null, invisible para cualquier
-- colaborador) y el de workspace. La app usaba `workspace_id is null` como
-- sinónimo de "personal" en tres sitios (lib/data/development.ts,
-- development/goals/page.tsx y su acción), y la ÚNICA forma de meter un
-- proyecto a un workspace era la pantalla /workspaces → "Compartir un proyecto
-- personal", que además exigía una fila en project_shares para que un Member
-- lo viera siquiera.
--
-- QUÉ HACE ESTA MIGRACIÓN
--   1. Marca los workspaces personales (`is_personal`), uno por usuario.
--   2. Crea el personal que le falta a cada usuario ya registrado y le mete a
--      su dueño como Owner.
--   3. Adopta los proyectos huérfanos en el personal de su dueño.
--   4. Recién entonces vuelve `workspace_id` NOT NULL.
--   5. Deja el trigger de alta creando el espacio personal, para que un
--      usuario nuevo tenga dónde crear su primer proyecto desde el segundo
--      cero.
--   6. Pone en la base las tres reglas que el espacio personal no puede
--      perder: no se invita a nadie, no entra nadie más, y no se borra.
--
-- El orden importa: el UPDATE del paso 3 va ANTES del SET NOT NULL del paso 4
-- y dentro de la misma transacción. Si quedara un solo proyecto sin adoptar,
-- la migración aborta entera y no deja la base a medias.
--
-- Las políticas RLS del modelo nuevo (membresía = acceso) van aparte, en
-- 0031_rls_acceso_por_workspace.sql.

-- =============================================================================
-- 1) workspaces.is_personal
-- =============================================================================
alter table public.workspaces
  add column if not exists is_personal boolean not null default false;

comment on column public.workspaces.is_personal is
  'true = espacio privado del usuario, creado automáticamente al registrarse. Sustituye al viejo "projects.workspace_id is null" como definición de PROYECTO PERSONAL (BR-012): un resultado clave solo puede medirse contra proyectos de un workspace personal. No admite invitaciones, ni miembros ajenos, ni borrado (ver triggers al final de este archivo).';

-- Uno por usuario, garantizado por la base y no por la app.
create unique index if not exists idx_workspaces_one_personal
  on public.workspaces(owner_id)
  where is_personal;

-- =============================================================================
-- 2) Espacio personal para cada usuario ya registrado
-- =============================================================================
insert into public.workspaces (owner_id, name, is_personal)
select u.id, 'Mi espacio', true
from auth.users u
where not exists (
  select 1 from public.workspaces w where w.owner_id = u.id and w.is_personal
);

insert into public.memberships (workspace_id, user_id, user_name, role, status)
select
  w.id,
  w.owner_id,
  coalesce(nullif(p.name, ''), split_part(u.email, '@', 1), 'Yo'),
  'Owner',
  'Active'
from public.workspaces w
join auth.users u on u.id = w.owner_id
left join public.profiles p on p.user_id = w.owner_id
where w.is_personal
on conflict (workspace_id, user_id) do nothing;

-- =============================================================================
-- 3) Adopción de los proyectos huérfanos
-- =============================================================================
update public.projects pr
set workspace_id = w.id
from public.workspaces w
where pr.workspace_id is null
  and w.owner_id = pr.owner_id
  and w.is_personal;

-- =============================================================================
-- 4) workspace_id obligatorio
-- =============================================================================
alter table public.projects
  alter column workspace_id set not null;

comment on column public.projects.workspace_id is
  'Obligatorio desde 0030: todo proyecto vive en un workspace (personal o de equipo). Ser miembro activo del workspace ya da acceso al proyecto — ver 0031_rls_acceso_por_workspace.sql.';

-- La FK era `on delete set null`, que es justo la salida que acabamos de
-- cerrar. Pasa a CASCADE, y el borrado de un workspace con proyectos se
-- bloquea con el trigger de más abajo (que sí puede dar un mensaje legible).
-- Hacerlo al revés — RESTRICT — rompería el borrado de una cuenta: al
-- eliminar un usuario, `workspaces` y `projects` caen los dos por cascada
-- desde auth.users y el orden entre esas dos cascadas no está garantizado.
alter table public.projects
  drop constraint if exists projects_workspace_id_fkey;
alter table public.projects
  add constraint projects_workspace_id_fkey
  foreign key (workspace_id) references public.workspaces(id) on delete cascade;

-- =============================================================================
-- 5) Alta de usuario: perfil + espacio personal, en la misma transacción
-- =============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_workspace_id uuid;
begin
  v_name := coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1));

  insert into public.profiles (user_id, name)
  values (new.id, v_name)
  on conflict (user_id) do nothing;

  -- Sin esto, un usuario recién registrado no tendría NINGÚN workspace y,
  -- con workspace_id obligatorio, tampoco forma de crear su primer proyecto.
  insert into public.workspaces (owner_id, name, is_personal)
  values (new.id, 'Mi espacio', true)
  on conflict do nothing
  returning id into v_workspace_id;

  if v_workspace_id is null then
    select w.id into v_workspace_id
    from public.workspaces w
    where w.owner_id = new.id and w.is_personal;
  end if;

  if v_workspace_id is not null then
    insert into public.memberships (workspace_id, user_id, user_name, role, status)
    values (v_workspace_id, new.id, coalesce(nullif(v_name, ''), 'Yo'), 'Owner', 'Active')
    on conflict (workspace_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user is
  'Alta de usuario: crea su perfil (0002) y su workspace personal + membresía Owner (0030). Lo segundo es obligatorio desde que projects.workspace_id es NOT NULL.';

-- =============================================================================
-- 6) Reglas del espacio personal, en la base
-- =============================================================================
-- La app también las respeta, pero estas tres son de las que no se puede
-- depender de que "nadie llame al endpoint equivocado": un espacio personal
-- que admitiera un invitado dejaría de ser la frontera de privacidad sobre la
-- que descansa BR-012.

create or replace function public.guard_personal_workspace_invitation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.workspaces w where w.id = new.workspace_id and w.is_personal) then
    -- errcode P0001 (el de por defecto) a propósito: describeDbError()
    -- traduce 23514 a un genérico "algún valor no es válido" y se comería
    -- este mensaje, que es justo el que el admin necesita leer.
    raise exception 'Tu espacio personal no admite invitaciones. Crea un espacio de equipo para colaborar.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_personal_workspace_invitation on public.invitations;
create trigger trg_guard_personal_workspace_invitation
  before insert or update on public.invitations
  for each row execute function public.guard_personal_workspace_invitation();

create or replace function public.guard_personal_workspace_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1 from public.workspaces w
    where w.id = new.workspace_id and w.is_personal and w.owner_id <> new.user_id
  ) then
    raise exception 'Un espacio personal solo puede tener a su dueño como miembro.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_personal_workspace_membership on public.memberships;
create trigger trg_guard_personal_workspace_membership
  before insert or update on public.memberships
  for each row execute function public.guard_personal_workspace_membership();

-- Borrado de workspace: bloquea el personal y el que todavía tiene proyectos.
--
-- El `exists (select 1 from auth.users ...)` no es decorativo: cuando se borra
-- una CUENTA, `workspaces` cae por cascada desde auth.users y este trigger se
-- dispara. Para entonces la fila del usuario ya no existe, así que la guarda
-- se salta sola y el borrado de la cuenta sigue funcionando. Sin esa
-- condición, una cuenta con espacio personal sería imposible de eliminar.
create or replace function public.guard_workspace_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_projects integer;
begin
  if not exists (select 1 from auth.users u where u.id = old.owner_id) then
    return old; -- borrado de cuenta en cascada: no hay nada que proteger.
  end if;

  if old.is_personal then
    raise exception 'Tu espacio personal no se puede eliminar.';
  end if;

  select count(*) into v_projects from public.projects p where p.workspace_id = old.id;
  if v_projects > 0 then
    raise exception 'Este espacio todavía tiene % proyecto(s). Muévelos o bórralos antes de eliminarlo.', v_projects;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_guard_workspace_delete on public.workspaces;
create trigger trg_guard_workspace_delete
  before delete on public.workspaces
  for each row execute function public.guard_workspace_delete();

comment on function public.guard_workspace_delete is
  'Impide borrar el espacio personal y cualquier espacio con proyectos dentro. Se salta a sí mismo cuando el dueño ya no existe (borrado de cuenta en cascada desde auth.users).';
