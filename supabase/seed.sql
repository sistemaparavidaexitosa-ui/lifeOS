-- seed.sql — Datos de arranque IDEMPOTENTES (§8bis, evita F10/F13).
--
-- ⚠️ IMPORTANTE (F10): `supabase db push` NO ejecuta este archivo contra un
-- proyecto REMOTO. Para poblar un proyecto remoto, pega este archivo en el
-- SQL Editor de Supabase Studio, o usa `supabase db reset` en LOCAL (que sí
-- lo ejecuta automáticamente después de aplicar las migraciones).
--
-- Usuario demo: luis.demo@lifeos.local / contraseña: LifeosDemo!2026
-- (cámbiala inmediatamente en un entorno real; esto es solo para que el
-- primer login del owner tenga datos reales que leer/escribir de inmediato).
--
-- F13 🔴: los UPSERT de este archivo fijan TODOS los campos que deciden
-- visibilidad/estado (no solo algunos), para que correr el seed dos veces
-- nunca deje una fila "no visible" a medio actualizar.

do $$
declare
  v_user_id uuid := '00000000-0000-4000-8000-000000000001';
  v_acc_nomina uuid := '00000000-0000-4000-8000-0000000000a1';
  v_acc_efectivo uuid := '00000000-0000-4000-8000-0000000000a2';
  v_acc_ahorro uuid := '00000000-0000-4000-8000-0000000000a3';
  v_ana_id uuid := '00000000-0000-4000-8000-000000000002';
  v_ws_personal uuid;
  v_ws_equipo uuid := '00000000-0000-4000-8000-000000000901';
  v_nb_equipo uuid := '00000000-0000-4000-8000-000000000911';
  v_nb_personal uuid := '00000000-0000-4000-8000-000000000912';
  v_note1 uuid := '00000000-0000-4000-8000-000000000921';
  v_note2 uuid := '00000000-0000-4000-8000-000000000922';
  v_note3 uuid := '00000000-0000-4000-8000-000000000923';
  v_prj uuid := '00000000-0000-4000-8000-000000000101';
  v_prj2 uuid := '00000000-0000-4000-8000-000000000102';
  v_t1 uuid := '00000000-0000-4000-8000-000000000201';
  v_t2 uuid := '00000000-0000-4000-8000-000000000202';
  v_t3 uuid := '00000000-0000-4000-8000-000000000203';
  v_dbt1 uuid := '00000000-0000-4000-8000-000000000301';
  v_dbt2 uuid := '00000000-0000-4000-8000-000000000302';
  v_occ_lectura uuid := '00000000-0000-4000-8000-000000000401';
  v_rut_lectura uuid := '00000000-0000-4000-8000-000000000451';
  v_hab1 uuid := '00000000-0000-4000-8000-000000000501';
  v_bk1 uuid := '00000000-0000-4000-8000-000000000601';
  v_fam_spouse uuid := '00000000-0000-4000-8000-000000000701';
  v_fam_kid uuid := '00000000-0000-4000-8000-000000000702';
  v_today date := current_date;
begin
  -- ---------------------------------------------------------------------
  -- Usuario demo en auth.users (+ identity) — necesario para satisfacer las
  -- FK de todas las tablas de negocio. Patrón estándar de seed de Supabase.
  -- ---------------------------------------------------------------------
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    -- Estas seis columnas de token TIENEN que ir a '' y no quedarse en NULL.
    -- GoTrue las lee como `string` de Go y revienta el login entero con
    -- "converting NULL to string is unsupported" -> 500 "Database error
    -- querying schema", un mensaje que no señala a ninguna de ellas. El
    -- usuario demo del seed llevaba así desde el primer commit: no se podía
    -- iniciar sesión en local con él. Se destapó al medir el rendimiento,
    -- intentando entrar como el usuario demo.
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'luis.demo@lifeos.local', crypt('LifeosDemo!2026', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{"name":"Luis Vargas (Demo)"}',
    now(), now(), '', '', '', '', '', '', '', ''
  )
  on conflict (id) do update set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    updated_at = now();

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_user_id, v_user_id, v_user_id::text,
    jsonb_build_object('sub', v_user_id::text, 'email', 'luis.demo@lifeos.local'),
    'email', now(), now(), now()
  )
  on conflict (provider_id, provider) do nothing;

  -- ---------------------------------------------------------------------
  -- Perfil (F13: fija TODOS los campos gate — onboarded, theme, ventana)
  -- ---------------------------------------------------------------------
  insert into public.profiles (user_id, name, currency, timezone, locale, cycle, onboarded, activity_window_start, activity_window_end, theme)
  values (v_user_id, 'Luis Vargas (Demo)', 'MXN', 'America/Mexico_City', 'es-MX', 'Quincenal', true, '05:00', '21:00', 'light')
  on conflict (user_id) do update set
    name = excluded.name, currency = excluded.currency, timezone = excluded.timezone, locale = excluded.locale,
    cycle = excluded.cycle, onboarded = excluded.onboarded,
    activity_window_start = excluded.activity_window_start, activity_window_end = excluded.activity_window_end,
    theme = excluded.theme, updated_at = now();

  insert into public.consents (id, user_id, purpose, version, status, ts)
  values
    ('00000000-0000-4000-8000-000000000801', v_user_id, 'core_app', '1.0', 'granted', now()),
    ('00000000-0000-4000-8000-000000000802', v_user_id, 'ai_personalization', '1.0', 'granted', now())
  on conflict (id) do update set status = excluded.status, ts = excluded.ts;

  -- ---------------------------------------------------------------------
  -- Categorías
  -- ---------------------------------------------------------------------
  insert into public.categories (user_id, name)
  select v_user_id, c from unnest(array['Alimentación','Transporte','Vivienda','Servicios','Ocio','Salud','Ingreso','Ahorro','Deuda','Otros']) as c
  on conflict (user_id, name) do nothing;

  -- ---------------------------------------------------------------------
  -- Cuentas (F13: gate = existencia + opening_balance correcto siempre)
  -- ---------------------------------------------------------------------
  insert into public.accounts (id, user_id, name, type, currency, opening_balance)
  values
    (v_acc_nomina, v_user_id, 'Cuenta de nómina', 'bank', 'MXN', 12000),
    (v_acc_efectivo, v_user_id, 'Efectivo', 'cash', 'MXN', 1800),
    (v_acc_ahorro, v_user_id, 'Ahorro emergencia', 'savings', 'MXN', 42000)
  on conflict (id) do update set name = excluded.name, type = excluded.type, currency = excluded.currency, opening_balance = excluded.opening_balance;

  -- ---------------------------------------------------------------------
  -- Espacios de trabajo (migración 0030: NO existe el proyecto sin espacio)
  --
  -- El personal lo crea el trigger handle_new_user al insertar el usuario de
  -- arriba, así que aquí se BUSCA en vez de insertarse: crear otro violaría
  -- el índice único idx_workspaces_one_personal. El `if` cubre el caso de una
  -- base sembrada antes de que ese trigger existiera.
  -- ---------------------------------------------------------------------
  select w.id into v_ws_personal from public.workspaces w where w.owner_id = v_user_id and w.is_personal;
  if v_ws_personal is null then
    insert into public.workspaces (owner_id, name, is_personal)
    values (v_user_id, 'Mi espacio', true)
    returning id into v_ws_personal;
  end if;

  insert into public.memberships (workspace_id, user_id, user_name, role, status)
  values (v_ws_personal, v_user_id, 'Luis Vargas (Demo)', 'Owner', 'Active')
  on conflict (workspace_id, user_id) do nothing;

  -- Segundo usuario + espacio de equipo: sin esto, el modelo nuevo
  -- (membresía = acceso) no se puede VER en local. Ana no tiene ninguna fila
  -- en project_shares y aun así alcanza el proyecto del equipo.
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    -- Estas seis columnas de token TIENEN que ir a '' y no quedarse en NULL.
    -- GoTrue las lee como `string` de Go y revienta el login entero con
    -- "converting NULL to string is unsupported" -> 500 "Database error
    -- querying schema", un mensaje que no señala a ninguna de ellas. El
    -- usuario demo del seed llevaba así desde el primer commit: no se podía
    -- iniciar sesión en local con él. Se destapó al medir el rendimiento,
    -- intentando entrar como el usuario demo.
    confirmation_token, recovery_token,
    email_change, email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    v_ana_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'ana.demo@lifeos.local', crypt('LifeosDemo!2026', gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', '{"name":"Ana Ruiz (Demo)"}',
    now(), now(), '', '', '', '', '', '', '', ''
  )
  on conflict (id) do update set email = excluded.email, updated_at = now();

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) values (
    v_ana_id, v_ana_id, v_ana_id::text,
    jsonb_build_object('sub', v_ana_id::text, 'email', 'ana.demo@lifeos.local'),
    'email', now(), now(), now()
  )
  on conflict (provider_id, provider) do nothing;

  insert into public.workspaces (id, owner_id, name, color, is_personal)
  values (v_ws_equipo, v_user_id, 'Equipo LifeOS', '#6161ff', false)
  on conflict (id) do update set name = excluded.name, color = excluded.color, is_personal = false;

  insert into public.memberships (workspace_id, user_id, user_name, role, status)
  values
    (v_ws_equipo, v_user_id, 'Luis Vargas (Demo)', 'Owner', 'Active'),
    (v_ws_equipo, v_ana_id, 'Ana Ruiz (Demo)', 'Member', 'Active')
  on conflict (workspace_id, user_id) do update set role = excluded.role, status = excluded.status;

  -- ---------------------------------------------------------------------
  -- Proyectos + tareas (deja AL MENOS un proyecto "buscable" con tareas —
  -- análogo directo al F13 de "proveedor buscable" del dominio de referencia).
  --
  -- Uno personal y otro del equipo, a propósito: es la diferencia que decide
  -- quién ve qué (0031) y qué proyectos pueden medir un resultado clave
  -- (BR-012, solo los del espacio personal).
  -- ---------------------------------------------------------------------
  insert into public.projects (id, owner_id, workspace_id, title, objective, description, status, priority, target_date, area, owner_name, tags, results, version)
  values
    (v_prj, v_user_id, v_ws_personal, 'Lanzar Life OS MVP', 'Construir la experiencia diaria unificada.', 'Ejecución + Dinero + Patrimonio conectados.', 'Active', 'High', v_today + 45, 'Producto', 'Luis Vargas (Demo)', array['mvp','estrategico'], 'Ciclo diario completo funcionando.', 1),
    (v_prj2, v_user_id, v_ws_equipo, 'Mudanza de oficina', 'Reubicar el equipo sin perder productividad.', '', 'Active', 'Medium', v_today + 20, 'Operaciones', 'Luis Vargas (Demo)', '{}', '', 1)
  on conflict (id) do update set
    title = excluded.title, objective = excluded.objective, status = excluded.status, priority = excluded.priority,
    target_date = excluded.target_date, workspace_id = excluded.workspace_id, version = public.projects.version + 1;

  insert into public.tasks (id, project_id, title, status, priority, urgent, due, est, deps, impact, completed_at, version)
  values
    (v_t1, v_prj, 'Diseñar Home móvil', 'InProgress', 'High', true, v_today + 1, 90, '{}', true, null, 1),
    (v_t2, v_prj, 'Definir esquema del ledger', 'Pending', 'High', true, v_today + 2, 120, '{}', true, null, 1),
    (v_t3, v_prj, 'Pruebas RLS negativas', 'Blocked', 'Medium', false, v_today + 3, 60, array[v_t2], true, null, 1)
  on conflict (id) do update set
    title = excluded.title, status = excluded.status, priority = excluded.priority, urgent = excluded.urgent,
    due = excluded.due, est = excluded.est, deps = excluded.deps, impact = excluded.impact, version = public.tasks.version + 1;

  -- ---------------------------------------------------------------------
  -- Cuadernos y notas (migración 0032)
  --
  -- Uno del equipo y uno personal, para que se vea la diferencia que hace la
  -- membresía: Ana alcanza el primero sin ninguna fila de permiso adicional, y
  -- el segundo no lo ve nadie más que Luis. Una de las notas la firma Ana, que
  -- es lo que hace visible la marca de autoría.
  -- ---------------------------------------------------------------------
  insert into public.notebooks (id, workspace_id, title, icon, created_by, created_by_name)
  values
    (v_nb_equipo, v_ws_equipo, 'Actas y decisiones', '📗', v_user_id, 'Luis Vargas (Demo)'),
    (v_nb_personal, v_ws_personal, 'Ideas sueltas', '💡', v_user_id, 'Luis Vargas (Demo)')
  on conflict (id) do update set
    title = excluded.title, icon = excluded.icon, workspace_id = excluded.workspace_id;

  insert into public.notes (id, notebook_id, title, body, created_by, created_by_name, updated_by, updated_by_name)
  values
    (v_note1, v_nb_equipo, 'Acta de la reunión de dirección',
     E'## Asistentes\n- Luis\n- Ana\n\n## Acuerdos\n1. La mudanza de oficina arranca el mes que viene.\n2. Ana coordina el inventario.\n\n> Pendiente de confirmar el presupuesto con administración.',
     v_user_id, 'Luis Vargas (Demo)', v_user_id, 'Luis Vargas (Demo)'),
    (v_note2, v_nb_equipo, 'Inventario de la mudanza',
     E'Lo que hay que empaquetar, por sala.\n\n- Sala grande: 12 monitores, 4 sillas\n- Almacén: material de oficina\n\nDudas en **negrita** para revisarlas en la próxima.',
     v_ana_id, 'Ana Ruiz (Demo)', v_ana_id, 'Ana Ruiz (Demo)'),
    (v_note3, v_nb_personal, 'Cosas que probar',
     E'- Leer sobre presupuestos base cero\n- Revisar el flujo de onboarding\n- Escribir el resumen del trimestre',
     v_user_id, 'Luis Vargas (Demo)', v_user_id, 'Luis Vargas (Demo)')
  on conflict (id) do update set
    title = excluded.title, body = excluded.body, notebook_id = excluded.notebook_id,
    version = public.notes.version + 1;

  -- ---------------------------------------------------------------------
  -- Deudas
  -- ---------------------------------------------------------------------
  insert into public.debts (id, user_id, name, balance, rate, min_payment, due_day)
  values
    (v_dbt1, v_user_id, 'Tarjeta de crédito', 24000, 36, 1200, 15),
    (v_dbt2, v_user_id, 'Préstamo auto', 78000, 14, 3200, 5)
  on conflict (id) do update set balance = excluded.balance, rate = excluded.rate, min_payment = excluded.min_payment, due_day = excluded.due_day;

  -- ---------------------------------------------------------------------
  -- Presupuesto (pestaña tabular, FR-MNY-018/019)
  -- ---------------------------------------------------------------------
  insert into public.budgets (user_id, period, cycle, category, amount, monthly_cost, q1_amount, q2_amount)
  values
    (v_user_id, 'current', 'Quincenal', 'Alimentación', 2500, 5000, 2500, 2500),
    (v_user_id, 'current', 'Quincenal', 'Transporte', 1000, 2000, 1000, 1000),
    (v_user_id, 'current', 'Quincenal', 'Servicios', 1250, 2500, 1250, 1250),
    (v_user_id, 'current', 'Quincenal', 'Ocio', 750, 1500, 750, 750)
  on conflict (user_id, period, category) do update set
    amount = excluded.amount, monthly_cost = excluded.monthly_cost, q1_amount = excluded.q1_amount, q2_amount = excluded.q2_amount;

  -- ---------------------------------------------------------------------
  -- Movimientos de ejemplo (uno conciliado con presupuesto, para que la
  -- pestaña de Presupuesto muestre un balance real desde el primer login)
  -- ---------------------------------------------------------------------
  insert into public.journal_entries (id, user_id, type, memo, entry_date, effective_at, category, counterparty, status, reconciled, source, dedupe_key)
  values
    ('00000000-0000-4000-8000-000000000901', v_user_id, 'income', 'Ingreso quincenal', v_today - 6, v_today - 6, 'Ingreso', 'Nómina', 'Reconciled', true, 'seed', 'seed-income-1'),
    ('00000000-0000-4000-8000-000000000902', v_user_id, 'expense', 'Supermercado', v_today - 4, v_today - 4, 'Alimentación', '', 'Reconciled', true, 'seed', 'seed-expense-1')
  on conflict (id) do update set status = excluded.status, reconciled = excluded.reconciled;

  insert into public.journal_lines (entry_id, account_id, amount)
  select '00000000-0000-4000-8000-000000000901', v_acc_nomina, 16000
  where not exists (select 1 from public.journal_lines where entry_id = '00000000-0000-4000-8000-000000000901');

  insert into public.journal_lines (entry_id, account_id, amount)
  select '00000000-0000-4000-8000-000000000902', v_acc_nomina, -1850
  where not exists (select 1 from public.journal_lines where entry_id = '00000000-0000-4000-8000-000000000902');

  -- ---------------------------------------------------------------------
  -- Autogestión del Tiempo + Hábitos/Lectura
  -- ---------------------------------------------------------------------
  insert into public.occupations (id, user_id, title, start_time, end_time, category, recurring)
  values (v_occ_lectura, v_user_id, 'Lectura antes de dormir', '20:30', '21:00', 'Personal', true)
  on conflict (id) do update set title = excluded.title, start_time = excluded.start_time, end_time = excluded.end_time;

  -- Desde 0045 ningún hábito existe fuera de una rutina, y el bloque horario
  -- lo ancla la rutina y no el hábito. La identidad viene rellena a
  -- propósito: es lo primero que se lee bajo el título y en local se vería
  -- siempre vacía si no la sembráramos.
  insert into public.routines (id, user_id, name, frequency, occupation_id, identity, position)
  values (v_rut_lectura, v_user_id, 'Cierre del día', 'Diario', v_occ_lectura,
          'Soy alguien que termina el día leyendo, no rascando el teléfono', 0)
  on conflict (id) do update set
    name = excluded.name, frequency = excluded.frequency,
    occupation_id = excluded.occupation_id, identity = excluded.identity,
    position = excluded.position;

  -- El hábito viene con la forma de «Hábitos atómicos» (migración 0033): la
  -- señal y la versión de dos minutos, que son lo que se prueba al abrir la
  -- pantalla. Sin ellas, los campos nuevos se verían siempre vacíos en local.
  insert into public.habits (id, user_id, name, category, routine_id, position, duration_min, cue, two_min_version)
  values (v_hab1, v_user_id, 'Leer 20 minutos', 'Aprendizaje', v_rut_lectura, 0, 20,
          'Después de meterme a la cama', 'Leer una página')
  on conflict (id) do update set
    name = excluded.name, routine_id = excluded.routine_id,
    position = excluded.position, duration_min = excluded.duration_min,
    cue = excluded.cue, two_min_version = excluded.two_min_version;

  insert into public.books (id, user_id, title, author, status, current_page, total_pages, started_at, category)
  values (v_bk1, v_user_id, 'Atomic Habits', 'James Clear', 'Leyendo', 120, 280, v_today - 10, 'Desarrollo personal')
  on conflict (id) do update set
    status = excluded.status, current_page = excluded.current_page,
    total_pages = excluded.total_pages, category = excluded.category;

  -- Tres puntos de historial para que la fecha estimada salga con base
  -- `historial` desde el primer arranque y no con el respaldo. Con un solo
  -- libro y cero puntos, la pantalla nueva se vería igual que la vieja.
  insert into public.book_progress (book_id, local_date, page)
  values
    (v_bk1, v_today - 10, 0),
    (v_bk1, v_today - 5, 60),
    (v_bk1, v_today, 120)
  on conflict (book_id, local_date) do update set page = excluded.page;

  -- ---------------------------------------------------------------------
  -- Hogar y Dependientes Económicos
  -- ---------------------------------------------------------------------
  insert into public.family_members (id, user_id, name, relationship, member_type)
  values
    (v_fam_spouse, v_user_id, 'Ana', 'Cónyuge', 'Adulto'),
    (v_fam_kid, v_user_id, 'Emiliano', 'Hijo/a', 'Dependiente')
  on conflict (id) do update set name = excluded.name, relationship = excluded.relationship, member_type = excluded.member_type;

  -- ---------------------------------------------------------------------
  -- Cashback
  -- ---------------------------------------------------------------------
  insert into public.cashback_cards (id, user_id, name, debt_id, rate_pct, eligible_categories, accrued_estimate)
  values ('00000000-0000-4000-8000-000000000a01', v_user_id, 'Tarjeta de crédito', v_dbt1, 2, array['Alimentación','Ocio'], 145.5)
  on conflict (id) do update set rate_pct = excluded.rate_pct, eligible_categories = excluded.eligible_categories, accrued_estimate = excluded.accrued_estimate;

end $$;
