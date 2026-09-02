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

  -- Bloque ajeno: el hábito de A que apuntaba al bloque de B no puede haber
  -- heredado ni el título ni el ancla de ese bloque. Cae al paso 3.
  select routine_id into v_routine from public.habits
   where id = 'a2000000-0000-4000-8000-000000000006';
  select count(*) into v_n from public.routines
   where id = v_routine
     and name = 'Hábitos de entre semana'
     and user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     and occupation_id is null;
  if v_n <> 1 then
    raise exception 'Bloque ajeno: el hábito heredó la rutina equivocada; el título o el ancla del bloque de otra cuenta se filtraron al backfill';
  end if;

  -- Paso ajeno: el hábito de A al que apuntaba un paso de la rutina de B no
  -- puede haber heredado esa rutina. Si lo hiciera, A dejaría de verlo —la RLS
  -- no le deja leer la rutina de B— y el día que B borrara esa rutina el
  -- cascade se llevaría el hábito de A y todos sus habit_logs. Cae al paso 3.
  select routine_id into v_routine from public.habits
   where id = 'a2000000-0000-4000-8000-000000000007';
  select count(*) into v_n from public.routines
   where id = v_routine
     and user_id = 'aaaaaaaa-0000-4000-8000-000000000001'
     and name = 'Hábitos diarios';
  if v_n <> 1 then
    raise exception 'Paso ajeno: el hábito acabó en una rutina que no es de su dueño; el cascade de esa rutina podría borrarlo con toda su racha';
  end if;

  -- Usuario sin NINGUNA rutina previa: la rama NULL del coalesce que calcula
  -- `routines.position`. Sus dos rutinas nuevas tienen que salir en 0 y 1, no
  -- en null (que reventaría el not null) ni las dos en 0.
  select count(*) into v_n from public.routines
   where user_id = 'cccccccc-0000-4000-8000-000000000003';
  if v_n <> 2 then
    raise exception 'Usuario sin rutinas: esperaba 2 rutinas nuevas, hay %', v_n;
  end if;
  -- `count(distinct position)` y no `count(*)`: contando filas, dos rutinas
  -- empatadas en 0 también daban 2, que es exactamente el caso que este bloque
  -- dice descartar.
  select count(distinct position) into v_n from public.routines
   where user_id = 'cccccccc-0000-4000-8000-000000000003' and position in (0, 1);
  if v_n <> 2 then
    raise exception 'Usuario sin rutinas: las posiciones no salieron 0 y 1 (la rama null del coalesce)';
  end if;

  -- Y la cuarta rama del `case` que nombra por frecuencia, que ningún otro
  -- caso del fixture toca: una errata ahí dejaría la rutina sin nombre.
  select routine_id into v_routine from public.habits
   where id = 'c2000000-0000-4000-8000-000000000001';
  select count(*) into v_n from public.routines
   where id = v_routine and name = 'Hábitos de fin de semana'
     and frequency = 'Fin de semana' and occupation_id is null;
  if v_n <> 1 then
    raise exception 'Usuario sin rutinas: la rutina de fin de semana no salió con el nombre esperado';
  end if;

  select position into v_pos from public.habits where id = 'c2000000-0000-4000-8000-000000000001';
  if v_pos <> 0 then
    raise exception 'Usuario sin rutinas: el hábito más antiguo no quedó en la posición 0 (pos=%)', v_pos;
  end if;
  select position into v_pos from public.habits where id = 'c2000000-0000-4000-8000-000000000002';
  if v_pos <> 1 then
    raise exception 'Usuario sin rutinas: el segundo hábito no quedó en la posición 1 (pos=%)', v_pos;
  end if;

  -- Nadie se quedó fuera: el not null habría reventado, pero decirlo explícito
  -- convierte un error de Postgres en un mensaje que se entiende.
  select count(*) into v_n from public.habits where routine_id is null;
  if v_n <> 0 then
    raise exception '% hábitos quedaron sin rutina', v_n;
  end if;

  -- Y NADIE se coló de más. El fixture trae 11 hábitos y 1 paso de texto
  -- libre, así que después de migrar tiene que haber exactamente 12. Es la
  -- comprobación que caza el peor fallo posible del paso 4: que en vez de
  -- convertir el paso lo duplique, o que el paso 1 clone el hábito que estaba
  -- en dos rutinas en lugar de elegir una. Un hábito de más no es una fila de
  -- más: es una racha partida en dos. La base corre sin la semilla (el script
  -- la aparta), así que estos son todos los hábitos que existen.
  select count(*) into v_n from public.habits;
  if v_n <> 12 then
    raise exception 'Esperaba 12 hábitos tras migrar (11 previos + 1 paso de texto libre), hay %', v_n;
  end if;

  raise notice 'Backfill 0045: los nueve casos pasan.';
end $$;
