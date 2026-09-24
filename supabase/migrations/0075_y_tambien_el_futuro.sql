-- 0075 · La 0074 limpió el presente y dejó el futuro roto (D-187)
--
-- La 0074 quitó TRUNCATE de las 85 tablas y cerró la función de diagnóstico.
-- Al verificarla CONTRA PRODUCCIÓN —no contra la base local— salieron dos
-- cosas que la dejaban a medias:
--
--  1. Los privilegios por defecto seguían concediendo `TRUNCATE` a
--     `authenticated` y `INSERT, DELETE, UPDATE, TRUNCATE` a `anon` en toda
--     tabla FUTURA. La 0074 solo les quitó `select`. O sea: limpiaba las 85
--     tablas de hoy y la 86 volvía a nacer con el permiso que acababa de
--     quitarse. Un arreglo que no sobrevive a la siguiente migración no es un
--     arreglo, es una limpieza.
--
--  2. Las dos ayudantes de políticas seguían concedidas a `anon` en
--     producción. La 0074 hizo `revoke … from public`, que quita la herencia
--     pero NO la concesión EXPLÍCITA que la 0010 les dio con
--     `grant execute on all functions in schema public to anon`. Hacen falta
--     las dos: una quita lo heredado y la otra lo escrito.
--
-- POR QUÉ NO SE VIO EN LOCAL, QUE ES LA PARTE QUE IMPORTA
-- La base local había corrido una versión intermedia de la 0074 —la que
-- revocaba `from anon`— que luego se sustituyó por la de `from public`. Local
-- quedó limpio por un `revoke` que ya no estaba en el archivo. La verificación
-- decía «anon pasó de t a f» y era verdad, y aun así el arreglo no funcionaba.
-- Comprobar el efecto en la base donde uno acaba de correr experimentos no es
-- comprobar la migración: es comprobar el rastro de los experimentos.

-- 1) NADA POR DEFECTO PARA `anon`
--
-- `anon` no lee ni escribe nada en este producto: ninguna política RLS lo
-- nombra y no hay ninguna política permisiva con `true`. Que se le concediera
-- `insert`, `delete` y `update` por defecto no le daba acceso —la RLS los
-- filtra— pero `TRUNCATE` sí: no borra filas, vacía la tabla, y por eso no
-- pasa por la política.
alter default privileges in schema public revoke all on tables from anon;

-- 2) A `authenticated`, TODO MENOS EL QUE SALTA LA RLS
--
-- Se le deja `select, insert, update, delete`: quitárselos haría que una
-- migración futura que olvide su `grant` rompiera la feature en silencio. Se
-- le quita solo TRUNCATE, que el código no usa en ningún sitio y que es el
-- único de la lista que la RLS no puede limitar.
alter default privileges in schema public revoke truncate on tables from authenticated;

-- 3) LO HEREDADO Y LO ESCRITO
--
-- La 0074 quitó lo primero. Esto quita lo segundo.
revoke execute on function public.can_view_comment_subject(text, uuid) from anon;
revoke execute on function public.can_edit_comment_subject(text, uuid) from anon;
