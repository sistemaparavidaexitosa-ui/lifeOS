-- scripts/backfill/0045_asserts.sql
-- Corre DESPUÉS de aplicar 0045 sobre el fixture. Cada bloque cubre un caso de
-- la sección «Backfill» de la spec.

do $$
declare
  v_routine uuid;
  v_pos integer;
  v_dur integer;
  v_n integer;
begin
  -- Caso 1: el hábito que ya era paso conserva rutina, posición y duración.
  select routine_id, position, duration_min into v_routine, v_pos, v_dur
    from public.habits where id = 'a2000000-0000-4000-8000-000000000001';
  if v_routine is distinct from 'a1000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Caso 1: el hábito que ya era paso no heredó su rutina (obtuvo %)', v_routine;
  end if;
  if v_pos <> 2 or v_dur <> 15 then
    raise exception 'Caso 1: se perdieron posición o duración del paso (pos=%, dur=%)', v_pos, v_dur;
  end if;

  -- Caso 4: el paso de texto libre existe ahora como hábito, en su sitio.
  select count(*) into v_n from public.habits
   where name = 'Dejar la ropa lista'
     and routine_id = 'a1000000-0000-4000-8000-000000000001'
     and position = 3 and duration_min = 4 and category = 'Otros'
     and user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception 'Caso 4: el paso de texto libre no se convirtió en hábito (encontrados %)', v_n;
  end if;

  -- Caso 2: los tres hábitos del bloque comparten una rutina nueva llamada
  -- como el bloque, anclada a él, y con la frecuencia más común.
  select count(distinct routine_id) into v_n from public.habits
   where id in ('a2000000-0000-4000-8000-000000000002',
                'a2000000-0000-4000-8000-000000000003',
                'a2000000-0000-4000-8000-000000000004');
  if v_n <> 1 then
    raise exception 'Caso 2: los hábitos del bloque quedaron repartidos en % rutinas', v_n;
  end if;

  select routine_id into v_routine from public.habits
   where id = 'a2000000-0000-4000-8000-000000000002';
  select count(*) into v_n from public.routines
   where id = v_routine and name = 'Mañana' and frequency = 'Diario'
     and occupation_id = 'a0000000-0000-4000-8000-000000000001';
  if v_n <> 1 then
    raise exception 'Caso 2: la rutina del bloque no salió con nombre, frecuencia o ancla correctos';
  end if;

  -- Y el orden dentro de esa rutina es el de created_at.
  select position into v_pos from public.habits where id = 'a2000000-0000-4000-8000-000000000002';
  if v_pos <> 0 then
    raise exception 'Caso 2: el hábito más antiguo del bloque no quedó primero (pos=%)', v_pos;
  end if;
  select position into v_pos from public.habits where id = 'a2000000-0000-4000-8000-000000000004';
  if v_pos <> 2 then
    raise exception 'Caso 2: el hábito más reciente del bloque no quedó último (pos=%)', v_pos;
  end if;

  -- Caso 3: el suelto sin bloque va a una rutina nombrada por su frecuencia.
  select routine_id into v_routine from public.habits
   where id = 'a2000000-0000-4000-8000-000000000005';
  select count(*) into v_n from public.routines
   where id = v_routine and name = 'Hábitos semanales' and frequency = 'Semanal'
     and occupation_id is null;
  if v_n <> 1 then
    raise exception 'Caso 3: el hábito sin bloque no fue a «Hábitos semanales»';
  end if;

  -- Pérdida conocida: el hábito que estaba en dos rutinas se queda en la de
  -- menor position, y con la duración del paso de esa rutina.
  select routine_id, duration_min into v_routine, v_dur from public.habits
   where id = 'b2000000-0000-4000-8000-000000000001';
  if v_routine is distinct from 'b1000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'Doble rutina: ganó la equivocada (obtuvo %)', v_routine;
  end if;
  if v_dur <> 1 then
    raise exception 'Doble rutina: se copió la duración del paso perdedor (dur=%)', v_dur;
  end if;

  -- Y no se duplicó para colocarlo en las dos.
  select count(*) into v_n from public.habits
   where user_id = 'bbbbbbbb-0000-4000-8000-000000000002' and name = 'Beber agua';
  if v_n <> 1 then
    raise exception 'Doble rutina: el hábito se duplicó (% filas), bifurcando la racha', v_n;
  end if;

  -- Nadie se quedó fuera: el not null habría reventado, pero decirlo explícito
  -- convierte un error de Postgres en un mensaje que se entiende.
  select count(*) into v_n from public.habits where routine_id is null;
  if v_n <> 0 then
    raise exception '% hábitos quedaron sin rutina', v_n;
  end if;

  raise notice 'Backfill 0045: los seis casos pasan.';
end $$;
