-- =============================================================================
-- 0048 · LA IA VE TODO POR DEFECTO
-- =============================================================================
--
-- Esto INVIERTE la decisión de 0027 y de D-088, y conviene decir por qué en vez
-- de dejarlo como un cambio de una palabra.
--
-- 0027 dejó `ai_domains` vacío a propósito: «ningún dominio sale hacia el
-- proveedor del modelo hasta que el usuario lo encienda». Era la postura
-- correcta para un motor que analiza dinero sin que nadie se lo pida. Pero
-- convirtió el chat transversal en una pantalla que, recién estrenada, no sabía
-- nada de la vida de quien preguntaba —ni sus gastos, ni sus hábitos, ni lo que
-- comió— y encima no lo decía de forma evidente: parecía roto. El dueño del
-- sistema pidió explícitamente lo contrario, «no quiero tener que configurar
-- nada, el chat siempre debe tener acceso a todo».
--
-- LO QUE NO CAMBIA, y es lo que hace que esto siga siendo defendible:
--
--  * La columna se queda, y con ella el interruptor de Configuración → IA.
--    Esto mueve el DEFECTO, no quita el control: quien quiera apagar un dominio
--    sigue pudiendo, y el chat lo respeta igual.
--  * `allowedDomains` no se toca. `activity` sigue fuera del ámbito `global`
--    porque esa exclusión nunca fue de privacidad sino de sentido: global es
--    «tu vida» y aquello es «la semana de tu equipo». Encenderlo aquí solo lo
--    habilita para el análisis de /activity, que es donde toca.
--  * Sigue habiendo rastro: cada análisis y cada turno de chat escriben en
--    `audit_log` qué dominios viajaron.
--
-- LA CONSECUENCIA ACEPTADA, dicha sin adornos: a partir de aquí las cifras de
-- todos los módulos salen hacia Gemini en cada consulta del chat, y el plan
-- gratuito de Google admite usar los datos del free tier para mejorar sus
-- productos. Es una decisión del dueño del sistema, tomada con esa información
-- delante.

-- 1) El defecto, para los perfiles que se creen a partir de ahora.
alter table public.profiles
  alter column ai_domains set default
    '{money,debt,habits,time,execution,nutrition,activity}'::text[];

comment on column public.profiles.ai_domains is
  'Dominios cuyos hechos el usuario autoriza a enviar al modelo. Desde 0048 nacen TODOS encendidos (antes vacío, 0027): el chat tiene que servir sin configurar nada. Se apagan uno a uno en /settings. Se aplica en src/lib/insights/context.ts.';

-- 2) Los perfiles que YA existen. Sin esto el cambio no sirve de nada para
--    quien ya usa la app, que es justamente quien se topó con el problema.
--
--    Se rellenan SOLO los que están vacíos. No se puede distinguir «nunca lo
--    configuré» de «lo apagué todo a conciencia», y se elige la primera
--    lectura porque el vacío era el defecto y nadie lo había cambiado. Quien
--    quiera apagarlos de nuevo lo hace en una pantalla; esto corre una vez.
update public.profiles
set ai_domains = '{money,debt,habits,time,execution,nutrition,activity}'::text[]
where ai_domains = '{}'::text[];
