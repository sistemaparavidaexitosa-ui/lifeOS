-- 0020_task_files.sql
--
-- FASE 3 (Drawer lateral): cierra la sección "Archivos" del Drawer de Item.
-- Sigue la regla de oro: NINGUNA tabla se duplica. task_files es una
-- extensión nueva (no existía nada equivalente) que hereda el acceso de su
-- tarea vía las MISMAS funciones RLS ya usadas por task_assignees/comments
-- (has_project_access/can_edit_project, 0003_execution_collaboration.sql).
--
-- Los BINARIOS de los archivos NO se guardan en Postgres: se suben a
-- Supabase Storage (bucket "task-files", privado). Esta tabla solo guarda
-- METADATOS (nombre, ruta, tamaño, tipo) — mismo patrón que cualquier app
-- Supabase con Storage: la subida real ocurre desde el navegador
-- (supabase.storage.from("task-files").upload(...)), y esta Server Action
-- solo registra la referencia, protegida por RLS igual que cualquier otra
-- fila de negocio.

-- =============================================================================
-- TASK_FILES — metadatos de archivos adjuntos a un Item
-- =============================================================================
create table if not exists public.task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  size_bytes bigint not null default 0,
  content_type text not null default 'application/octet-stream',
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
comment on table public.task_files is 'FASE 3 (Drawer lateral): metadatos de archivos adjuntos a un Item (tasks). El binario vive en Supabase Storage, bucket "task-files"; storage_path sigue la convención {task_id}/{timestamp}-{nombre}.';
comment on column public.task_files.storage_path is 'Ruta exacta dentro del bucket task-files. Debe empezar con "{task_id}/" — las políticas de storage.objects (más abajo) parsean este prefijo con storage.foldername(name)[1] para validar acceso.';

create index if not exists idx_task_files_task on public.task_files(task_id);

-- =============================================================================
-- RLS: task_files hereda el acceso de su tarea (mismo patrón que
-- task_assignees/comments en 0003_execution_collaboration.sql)
-- =============================================================================
alter table public.task_files enable row level security;

create policy task_files_select on public.task_files for select
  using (exists (select 1 from public.tasks t where t.id = task_id and public.has_project_access(t.project_id)));

create policy task_files_insert on public.task_files for insert
  with check (
    exists (select 1 from public.tasks t where t.id = task_id and public.can_edit_project(t.project_id))
    and uploaded_by = auth.uid()
  );

create policy task_files_delete on public.task_files for delete
  using (exists (select 1 from public.tasks t where t.id = task_id and public.can_edit_project(t.project_id)));

comment on policy task_files_select on public.task_files is 'Reutiliza has_project_access(project_id) vía la tarea — misma función que ya protege task_assignees/comments. Sin funciones RLS nuevas.';
comment on policy task_files_insert on public.task_files is 'Reutiliza can_edit_project(project_id) — misma regla de edición que tasks (BR-015). uploaded_by = auth.uid() evita que alguien registre un archivo a nombre de otro usuario.';

-- =============================================================================
-- GRANTS (F9 — patrón exacto del resto del proyecto)
-- =============================================================================
grant select on public.task_files to anon, authenticated;
grant insert, delete on public.task_files to authenticated;
grant all privileges on public.task_files to service_role;

-- =============================================================================
-- STORAGE: bucket privado "task-files" + políticas de storage.objects
-- =============================================================================
insert into storage.buckets (id, name, public, file_size_limit)
values ('task-files', 'task-files', false, 26214400) -- 25 MB por archivo
on conflict (id) do nothing;

comment on column public.task_files.content_type is 'MIME type reportado por el navegador al subir; usado solo para mostrar el ícono correcto en el Drawer, no se valida contra una lista blanca en este slice.';

-- Las políticas de storage.objects verifican el acceso a la TAREA a partir
-- del primer segmento de la ruta (storage.foldername ya existe como función
-- del propio esquema storage — ver src/types/database.types.ts). Esto evita
-- crear cualquier función SECURITY DEFINER nueva: reutiliza
-- has_project_access/can_edit_project, exactamente igual que task_files.
create policy task_files_storage_select on storage.objects for select
  using (
    bucket_id = 'task-files'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[1]
        and public.has_project_access(t.project_id)
    )
  );

create policy task_files_storage_insert on storage.objects for insert
  with check (
    bucket_id = 'task-files'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[1]
        and public.can_edit_project(t.project_id)
    )
  );

create policy task_files_storage_delete on storage.objects for delete
  using (
    bucket_id = 'task-files'
    and exists (
      select 1 from public.tasks t
      where t.id::text = (storage.foldername(name))[1]
        and public.can_edit_project(t.project_id)
    )
  );

comment on policy task_files_storage_select on storage.objects is 'FASE 3: acceso al binario del archivo, condicionado al acceso a la tarea (mismo patrón RLS que el resto del proyecto). (storage.foldername(name))[1] extrae el primer segmento de la ruta (el task_id), por convención de storage_path.';
