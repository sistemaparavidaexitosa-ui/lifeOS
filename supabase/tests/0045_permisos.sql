-- 0045_permisos.sql — pgTAP: migración 0074 (D-186).
--
-- Esta prueba no comprueba una feature: comprueba que no vuelva a pasar lo que
-- pasó. La 0010 dejó puesto un `alter default privileges` que amplía solo los
-- permisos de todo objeto nuevo, así que cada `grant` deliberado de cada
-- migración se ha ido ensanchando por detrás sin aparecer en ningún diff. Se
-- encontró una función de diagnóstico de la 0014 —marcada «temporal, segura de
-- borrar»— invocable por `anon` cincuenta y nueve migraciones después.
--
-- Para funciones, el permiso no se puede cerrar por defecto desde una
-- migración (ver el comentario final de la 0074). La garantía es esta prueba.

begin;
select plan(8);

-- 1) LA CLASE DE FALLO QUE SE ENCONTRÓ
--
-- No se comprueba «ninguna función security definer es invocable por anon»:
-- eso es falso hoy y no se puede arreglar en una entrega. TODAS lo son, porque
-- PostgreSQL concede EXECUTE a PUBLIC por defecto y `anon` hereda de ahí.
--
-- Se comprueba el subconjunto que de verdad hace daño, que es el que tenía la
-- función encontrada: `security definer` (salta la RLS) + alcanzable por RPC
-- (no es un trigger) + invocable por `anon` (sin iniciar sesión) + **sin
-- comprobar de quién es lo que devuelve**. Las que sí miran `auth.uid()` no
-- dan nada a `anon`, porque para `anon` ese valor es nulo.
--
-- LO QUE ESTA PRUEBA NO PUEDE VER: una función que delegue la comprobación en
-- otra en vez de escribir `auth.uid()` ella misma pasaría el filtro. Es un
-- cable trampa para la clase de error que ya ocurrió, no una demostración de
-- que no queda ninguno.
--
-- La única de la lista blanca:
--   · `invitation_preview` — a propósito: enseña a quién invita y a qué
--     espacio ANTES de crear la cuenta, que es justo cuando todavía eres
--     `anon`. Pide un uuid que no se adivina y devuelve el correo ya tapado.
select is_empty(
  $$
    select p.proname
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and pg_get_function_result(p.oid) <> 'trigger'
      and has_function_privilege('anon', p.oid, 'execute')
      and not (pg_get_functiondef(p.oid) ~* 'auth\.uid\(\)')
      and p.proname not in ('invitation_preview')
  $$,
  'ninguna funcion security definer invocable por anon deja de comprobar quien eres'
);

-- 2) LA FUNCIÓN DE DIAGNÓSTICO NO VUELVE
--
-- No filtraba datos: filtraba el mapa de cómo se protegen los datos, y el de
-- la parte compartida, que es la más enredada del producto.
select is_empty(
  $$ select proname from pg_proc where proname = 'debug_rls_policies' $$,
  'debug_rls_policies no existe (era diagnostico temporal de la 0014)'
);

-- 3) TRUNCATE, EL ÚNICO PERMISO QUE SALTA LA RLS
--
-- Una política filtra filas; TRUNCATE no borra filas, vacía la tabla, y por
-- eso no pasa por la política. El código no lo usa ni una vez.
select is_empty(
  $$
    select table_name from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'authenticated')
      and privilege_type = 'TRUNCATE'
  $$,
  'ninguna tabla concede TRUNCATE a anon ni a authenticated'
);

-- 4) RLS ENCENDIDA EN TODAS, SIN EXCEPCIÓN
--
-- Es lo que de verdad protege los datos en este producto: los `grant` son
-- anchos a propósito —es la postura estándar de Supabase— y la defensa entera
-- descansa en la RLS. Una tabla sin RLS queda expuesta por PostgREST.
select is_empty(
  $$
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  $$,
  'todas las tablas de public tienen RLS activada'
);

-- 5) NINGUNA POLÍTICA ABIERTA DE PAR EN PAR
--
-- `anon` conserva `select` sobre las tablas que ya existían. Eso no le da
-- acceso a nada MIENTRAS ninguna política diga `true`. Esta es la línea que
-- convierte ese permiso ancho en inofensivo, así que se vigila.
select is_empty(
  $$
    select tablename || '.' || policyname from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE'
      and (qual = 'true' or with_check = 'true')
  $$,
  'ninguna politica permisiva sin condicion (qual/with_check = true)'
);

-- 6) NI UNA QUE NOMBRE A anon
select is_empty(
  $$
    select tablename || '.' || policyname from pg_policies
    where schemaname = 'public' and roles::text like '%anon%'
  $$,
  'ninguna politica concede nada al rol anon'
);

-- 7) EL FUTURO, NO SOLO EL PRESENTE (D-187)
--
-- Esto es lo que la 0074 no miró y por lo que hizo falta la 0075: quitó
-- TRUNCATE de las 85 tablas de entonces mientras los privilegios por defecto
-- seguían concediéndoselo a la 86. Un arreglo que no sobrevive a la siguiente
-- migración no es un arreglo, es una limpieza.
--
-- `defaclobjtype = 'r'` son tablas. Se desmenuza el ACL con `aclexplode` en vez
-- de buscar letras dentro del texto: la primera versión de esta prueba hacía
-- `like '%authenticated=%D%'` y fallaba porque la `D` que encontraba era la de
-- `service_role`, más adelante en la misma cadena.
--
-- Se mira solo el juego de `postgres`, que es el rol con el que corren las
-- migraciones. Hay otro de `supabase_admin` que sigue concediéndolo todo y que
-- no es nuestro para cambiarlo; aplica a objetos creados por él, no por
-- nosotros. Quien comprueba eso de verdad es el caso 8.
select is_empty(
  $$
    select pg_get_userbyid(d.defaclrole) || ' → ' || a.grantee::regrole::text || ': ' || a.privilege_type
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
    cross join lateral aclexplode(d.defaclacl) a
    where n.nspname = 'public'
      and d.defaclobjtype = 'r'
      and pg_get_userbyid(d.defaclrole) = 'postgres'
      and (a.grantee::regrole::text = 'anon'
           or (a.grantee::regrole::text = 'authenticated' and a.privilege_type = 'TRUNCATE'))
  $$,
  'por defecto: nada para anon, y ningun TRUNCATE para authenticated'
);

-- 8) LA PRUEBA DE VERDAD: CREAR UNA TABLA Y MIRARLA
--
-- Las dos comprobaciones anteriores leen lo que la base DICE que hará. Esta
-- lo hace. Vive dentro del `begin … rollback` de la prueba, así que la tabla
-- no llega a existir fuera de ella.
create table public.zz_tabla_del_futuro (id int);
select is_empty(
  $$
    select privilege_type from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'zz_tabla_del_futuro'
      and (grantee = 'anon' or (grantee = 'authenticated' and privilege_type = 'TRUNCATE'))
  $$,
  'una tabla creada AHORA no concede nada a anon ni TRUNCATE a authenticated'
);


select * from finish();
rollback;
