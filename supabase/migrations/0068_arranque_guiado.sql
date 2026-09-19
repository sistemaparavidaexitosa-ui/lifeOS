-- 0068_arranque_guiado.sql
--
-- LA CAPA QUE CONDUCE LA MAÑANA (D-165).
--
-- Tres tablas y una función. Ninguna guarda la secuencia: la secuencia se
-- CALCULA en cada apertura a partir de rutinas, `habit_logs` de hoy,
-- `identity_briefs`, `daily_plans` y las cifras que ya arma `getHomeData`.
--
-- POR QUÉ NO HAY UNA TABLA `ritual_steps`. Era la forma evidente —que el
-- administrador componga la secuencia— y es la que miente. Una secuencia
-- guardada sigue diciendo «toma agua» el día que se borra ese hábito, y sigue
-- diciéndolo a las once de la mañana cuando ya se lo tomó. Lo que se configura
-- aquí no es el contenido sino QUÉ TIPOS DE PASO están permitidos, en qué
-- ventana horaria y con qué frecuencia. El orden es narrativo y lo fija el
-- dominio (`src/lib/domain/ritual/secuencia.ts`), no una fila arrastrable.
--
-- NACE APAGADA. `enabled = false` en la fila sembrada: aplicar esta migración
-- no le cambia la mañana a nadie. Encenderla es un gesto de un administrador en
-- /admin/ritual, y hasta entonces la puerta del layout cuesta una lectura de una
-- tabla de una fila.

-- =============================================================================
-- LA POLÍTICA GLOBAL
-- =============================================================================
-- Segunda tabla del esquema SIN `user_id`, después de `template_catalog` (0044),
-- y por la misma razón: es contenido de plataforma, no dato de una persona. La
-- lee cualquiera con sesión —el layout la necesita en cada carga— y la escribe
-- solo `public.is_admin()`.
create table if not exists public.ritual_policy (
  -- FILA ÚNICA, impuesta por el TIPO y no por un trigger: `boolean` con
  -- `check (id)` admite exactamente un valor posible, así que un segundo
  -- `insert` choca contra la clave primaria. Un trigger haría lo mismo con más
  -- código y un sitio más donde olvidarse.
  id                boolean primary key default true check (id),
  enabled           boolean  not null default false,
  steps             text[]   not null default '{greeting,affirmation,routineStep,context,planToday}',
  window_start      smallint not null default 4  check (window_start between 0 and 23),
  window_end        smallint not null default 12 check (window_end between 0 and 23),
  -- LOS MISMOS CUATRO VALORES que `routines.frequency` (0046), a propósito: el
  -- ritual reutiliza `routineDueToday()` y no inventa un segundo calendario de
  -- días hábiles. Un solo sitio en el repo decide qué es «entre semana».
  frequency         text     not null default 'Diario'
                      check (frequency in ('Diario', 'Semanal', 'Entre semana', 'Fin de semana')),
  ai_enabled        boolean  not null default true,
  blocking          boolean  not null default true,
  max_routine_steps smallint not null default 6 check (max_routine_steps between 1 and 20),
  updated_by        uuid references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  -- Una ventana que empieza después de terminar no se muestra nunca, y el
  -- administrador no tendría forma de saber por qué.
  check (window_start < window_end),
  -- El vocabulario de pasos vive aquí y en `PASOS_RITUAL` del dominio. Que la
  -- base lo repita no es duplicación ociosa: impide que una versión futura de
  -- la pantalla cuele un paso que el dominio no sabe pintar.
  check (steps <@ array['greeting', 'affirmation', 'mantra', 'visualization',
                        'dailyAction', 'routineStep', 'context', 'planToday',
                        'closing']::text[])
);

comment on table public.ritual_policy is
  'Política GLOBAL del arranque guiado (D-165). Una sola fila, sin dueño. La lee cualquiera con sesión; la escribe solo is_admin(). Sin segmentación por rol ni por segmento: una fila global y una preferencia por persona en ritual_prefs.';
comment on column public.ritual_policy.steps is
  'Qué TIPOS de paso están permitidos. No es la secuencia: la secuencia se calcula en cada apertura y su orden lo fija el dominio.';
comment on column public.ritual_policy.blocking is
  'Si, mientras el arranque está abierto, la aplicación de debajo queda inerte (sin teclado, sin lector de pantalla, sin scroll). NO lo puede tocar el usuario, y no hace falta: el ritual es SIEMPRE omitible con Escape y con un botón visible, y eso es invariante de producto, no ajuste.';
comment on column public.ritual_policy.ai_enabled is
  'Si el ritual MUESTRA los pasos que vienen del brief de identidad. El ritual no llama al modelo en su camino normal: el brief ya está escrito desde las 04:00 (0065/0067). Apagarlo oculta pasos, no ahorra una llamada.';
comment on column public.ritual_policy.max_routine_steps is
  'Tope de hábitos pendientes que se convierten en paso. Sin él, una rutina de veinte hábitos convierte el arranque en la pantalla de rutinas con otra tipografía.';

insert into public.ritual_policy (id) values (true) on conflict (id) do nothing;

alter table public.ritual_policy enable row level security;

create policy ritual_policy_select on public.ritual_policy
  for select using (auth.uid() is not null);
create policy ritual_policy_insert on public.ritual_policy
  for insert with check (public.is_admin());
create policy ritual_policy_update on public.ritual_policy
  for update using (public.is_admin()) with check (public.is_admin());
create policy ritual_policy_delete on public.ritual_policy
  for delete using (public.is_admin());

-- GRANTS (F9): RLS filtra FILAS; GRANT decide si el rol puede TOCAR la tabla.
grant select, insert, update, delete on public.ritual_policy to authenticated;
grant all privileges on public.ritual_policy to service_role;
-- NO ES DECORATIVO: 0002 dejó puesto un
-- `alter default privileges in schema public grant select on tables to anon`,
-- así que sin este revoke la política sería legible sin sesión.
revoke all on public.ritual_policy from anon;

-- =============================================================================
-- LA PREFERENCIA DE CADA PERSONA
-- =============================================================================
-- Mismo idiom que `notification_prefs` (0049): la AUSENCIA de fila significa
-- «todo lo que la política permita». No hay que crear nada al dar de alta a
-- nadie, y el caso normal no paga una escritura.
--
-- SOLO PUEDE QUITAR, y eso está en la FORMA de la tabla: la columna es
-- `steps_off`, no `steps_on`. No existe manera de que un usuario encienda un
-- paso que el administrador dejó apagado — ni por la pantalla, ni llamando la
-- acción a mano, ni escribiendo la fila directamente. La otra mitad de la regla
-- («el usuario sí puede apagar») la impone `resolverAjustes()` en el dominio.
create table if not exists public.ritual_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  enabled    boolean not null default true,
  steps_off  text[]  not null default '{}',
  ai_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (steps_off <@ array['greeting', 'affirmation', 'mantra', 'visualization',
                            'dailyAction', 'routineStep', 'context', 'planToday',
                            'closing']::text[])
);

comment on table public.ritual_prefs is
  'Preferencia del arranque guiado por persona (D-165). Sin fila = todo lo que la política permita. `steps_off` y no `steps_on`: la forma de la tabla impide encender lo que el administrador apagó.';

alter table public.ritual_prefs enable row level security;
create policy ritual_prefs_own on public.ritual_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.ritual_prefs to authenticated;
grant all privileges on public.ritual_prefs to service_role;
revoke all on public.ritual_prefs from anon;

-- =============================================================================
-- «YA SE MOSTRÓ HOY»
-- =============================================================================
-- Copia deliberada de `routine_runs` (0024/0046): misma forma, mismo
-- `local_date`, mismo par started/completed. Quien sepa leer una, lee la otra.
--
-- POR QUÉ UNA TABLA Y NO UNA COOKIE. La cookie no sobrevive a otro navegador: el
-- ritual reaparecería a las 23:00 en el teléfono después de haberlo hecho a las
-- 6:00 en el portátil. Y el servidor no podría responder «¿se terminó?».
--
-- POR QUÉ NO UNA COLUMNA EN `profiles`. Pierde la distinción entre terminar y
-- omitir, y abre la puerta a que cada feature futura cuelgue de la tabla de
-- perfil su propia marca diaria.
--
-- La clave primaria es lo que impide que el arranque vuelva a salir en la
-- segunda pestaña.
create table if not exists public.ritual_runs (
  user_id      uuid not null references auth.users(id) on delete cascade,
  local_date   date not null,
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  skipped      boolean  not null default false,
  last_step    text     not null default '',
  steps_total  smallint not null default 0,
  steps_done   smallint not null default 0,
  -- LA GUARDA DEL RESPALDO DEL BRIEF, y vive aquí por una razón concreta.
  --
  -- El sitio natural era `ai_job_runs` (0066), que es exactamente eso: una fila
  -- por trabajo de IA, persona y día. Pero esa tabla tiene la RLS cerrada y los
  -- grants revocados para `authenticated` — la escribe SOLO el reloj con
  -- `service_role`. Usarla desde el ritual obligaría a meter la llave de
  -- servicio en un camino que arranca en el navegador de una persona, para
  -- ganar una columna.
  --
  -- Aquí ya hay una fila por persona y día, con su RLS de dueño. Un intento de
  -- respaldo al día, y el tope de tres generaciones sigue contándose donde
  -- siempre (`audit_log`, vía `generacionesDeHoy`).
  brief_attempted boolean not null default false,
  primary key (user_id, local_date)
);

comment on table public.ritual_runs is
  'Una fila por persona y día local: la marca de «ya se mostró hoy» y, de paso, si se terminó o se omitió. Se escribe al MONTAR el overlay, no al cerrarlo — «primera sesión del día» es literalmente eso.';

alter table public.ritual_runs enable row level security;
create policy ritual_runs_own on public.ritual_runs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.ritual_runs to authenticated;
grant all privileges on public.ritual_runs to service_role;
revoke all on public.ritual_runs from anon;

-- =============================================================================
-- LA PUERTA, EN UN SOLO VIAJE
-- =============================================================================
-- El layout de `(app)` envuelve TODAS las pantallas: tres consultas ahí son tres
-- consultas en cada navegación. Esta función las deja en una.
--
-- `security invoker` A PROPÓSITO, al contrario que `is_admin()`: aquí no hay
-- ninguna cadena de recursión que esquivar y sí hay datos de una persona que
-- leer, así que la RLS de las tres tablas se sigue aplicando tal cual. Un
-- `security definer` convertiría esta función en una puerta trasera a la
-- preferencia y al historial de cualquiera.
create or replace function public.ritual_gate(p_date date)
returns table (
  policy_enabled    boolean,
  steps             text[],
  window_start      smallint,
  window_end        smallint,
  frequency         text,
  ai_enabled        boolean,
  blocking          boolean,
  max_routine_steps smallint,
  pref_enabled      boolean,
  pref_steps_off    text[],
  pref_ai           boolean,
  run_exists        boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.enabled,
         p.steps,
         p.window_start,
         p.window_end,
         p.frequency,
         p.ai_enabled,
         p.blocking,
         p.max_routine_steps,
         -- `coalesce` y no un `join` obligatorio: sin fila de preferencia la
         -- respuesta correcta es «todo lo que la política permita».
         coalesce(f.enabled, true),
         coalesce(f.steps_off, '{}'::text[]),
         coalesce(f.ai_enabled, true),
         exists (
           select 1 from public.ritual_runs r
            where r.user_id = auth.uid() and r.local_date = p_date
         )
    from public.ritual_policy p
    left join public.ritual_prefs f on f.user_id = auth.uid();
$$;

comment on function public.ritual_gate(date) is
  'Política + preferencia + «¿ya hay ejecución hoy?» en un solo viaje, para que la puerta del layout cueste una consulta y no tres. security invoker: la RLS de las tres tablas se sigue aplicando.';

grant execute on function public.ritual_gate(date) to authenticated;
