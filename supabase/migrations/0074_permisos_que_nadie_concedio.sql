-- 0074 · Los permisos que nadie concedió (D-186)
--
-- Tres arreglos con una sola causa: la 0010 dejó puesto un
-- `alter default privileges` que reparte permisos a `anon` y `authenticated`
-- en TODO objeto nuevo del esquema. Desde entonces, cada `grant` deliberado
-- que alguien escribió en una migración se ha ido ampliando por detrás, sin
-- que nadie lo pidiera y sin que apareciera en ningún diff.
--
-- Lo que se encontró al auditar (23-sep-2026), y que NO es teoría:
--   · RLS activa en las 85 tablas, ninguna vista, ninguna política permisiva
--     con `true`, ninguna política que nombre a `anon`. La base está bien
--     defendida. Lo que sigue son los permisos que se colaron POR ENCIMA.
--   · `TRUNCATE` concedido a `authenticated` en las 85 tablas. TRUNCATE es el
--     único permiso de esta lista que SALTA la RLS por completo, y el código
--     no lo usa ni una sola vez.
--   · `public.debug_rls_policies()` invocable por `anon` —comprobado con la
--     llave pública del navegador, sin iniciar sesión— devolviendo el `qual` y
--     el `with_check` de las políticas de `projects`, `workspaces`,
--     `memberships` y `project_shares`.

-- 1) LA FUNCIÓN DE DIAGNÓSTICO QUE SE QUEDÓ
--
-- La 0014 la creó y su propio comentario decía: «Diagnóstico temporal […]
-- Seguro de borrar una vez confirmado». Se confirmó en la 0015 y lleva
-- cincuenta y nueve migraciones abierta.
--
-- No filtra datos: filtra el MAPA de cómo se protegen los datos, y
-- precisamente el de la parte compartida —la más enredada, la que ya tuvo dos
-- migraciones seguidas por recursión—. Entregar las condiciones exactas de las
-- políticas a quien no ha iniciado sesión ahorra a un atacante justo el
-- trabajo de adivinarlas.
--
-- La 0014 la concedió solo a `authenticated` y `service_role`. `anon` la
-- obtuvo por el `alter default privileges` de la 0010, que es la forma de este
-- problema: la intención estaba escrita bien y se amplió sola.
drop function if exists public.debug_rls_policies();

-- 2) TRUNCATE, EL ÚNICO QUE SALTA LA RLS
--
-- Una política de RLS filtra filas; TRUNCATE no borra filas, vacía la tabla, y
-- por eso no pasa por la política. Hoy no es alcanzable —PostgREST no emite
-- TRUNCATE nunca— así que esto NO es un agujero abierto: es quitar un permiso
-- que nadie pidió, no arreglar una fuga. Importaría el día que alguien se
-- conecte a la base con el rol `authenticated` por otra vía.
revoke truncate on all tables in schema public from anon, authenticated;

-- 3) QUIEN DE VERDAD CONCEDE ES `PUBLIC`, NO `anon`
--
-- La trampa de esta sección, encontrada probándola: PostgreSQL concede
-- `execute` sobre toda función a **PUBLIC** por defecto, y `anon` lo hereda de
-- ahí. Escribir `revoke execute … from anon` quita la línea de `anon` de la
-- ACL y NO quita nada: se comprobó, y la función seguía invocándose igual.
-- Un `revoke` que no revoca es peor que no escribirlo, porque deja el problema
-- abierto y a alguien convencido de haberlo cerrado.
--
-- Así que se revoca de `public`, y se devuelve explícitamente a quien debe
-- tenerlo. La aplicación no llama a ninguna de las dos por RPC: son ayudantes
-- de políticas RLS, y quien evalúa esas políticas es siempre `authenticated`,
-- nunca `anon`, que no tiene filas que evaluar.
revoke execute on function public.can_view_comment_subject(text, uuid) from public;
revoke execute on function public.can_edit_comment_subject(text, uuid) from public;
grant execute on function public.can_view_comment_subject(text, uuid) to authenticated, service_role;
grant execute on function public.can_edit_comment_subject(text, uuid) to authenticated, service_role;

-- 4) QUE DEJE DE AMPLIARSE SOLO — Y LO QUE NO SE PUDO ARREGLAR AQUÍ
--
-- Para TABLAS funciona y está comprobado: una tabla creada después de esta
-- migración ya no concede `select` a `anon`. Solo afecta a objetos FUTUROS
-- —`alter default privileges` no toca nada existente— así que ninguna tabla
-- de hoy cambia de permisos por esta línea.
alter default privileges in schema public revoke select on tables from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- Para FUNCIONES **no se consigue desde aquí**, y conviene decirlo en vez de
-- dejar una línea tranquilizadora que no hace nada. Se probó revocando también
-- de `public`: `pg_default_acl` queda sin PUBLIC, y aun así toda función nueva
-- nace con `=X` —EXECUTE para PUBLIC— del que `anon` hereda. En esta base hay
-- DOS juegos de privilegios por defecto, el de `postgres` y el de
-- `supabase_admin`, y el segundo no es nuestro para cambiarlo.
--
-- Así que la garantía no se pone en un permiso, se pone en una prueba:
-- `supabase/tests/0045_permisos.sql` falla si aparece una función
-- `security definer` invocable por `anon` que no esté en su lista blanca. Un
-- `revoke` que hay que acordarse de escribir es una convención; una prueba que
-- rompe la entrega es una garantía. Toda función `security definer` nueva
-- necesita su propio:
--
--     revoke execute on function public.<nombre>(<args>) from public;
--     grant  execute on function public.<nombre>(<args>) to authenticated;
