-- 0044_admin_catalogo_plantillas.sql
--
-- EL CATÁLOGO DE PLANTILLAS SE MUDA A LA BASE, Y ALGUIEN PUEDE EDITARLO.
--
-- DEROGA D-044. Hasta aquí el catálogo vivía en código
-- (`src/lib/domain/execution/project-templates.ts` y
-- `src/lib/domain/development/templates.ts`) y el argumento era bueno: en git
-- va versionado, se prueba sin levantar Postgres y no puede divergir entre
-- entornos. El precio era que añadir o corregir una plantilla exigía un
-- despliegue, y eso convierte el catálogo en algo que solo se toca cuando
-- alguien programa.
--
-- QUÉ SE PIERDE, DICHO SIN ADORNOS. Se pierde `git log` sobre el contenido
-- (quién cambió qué plantilla y cuándo), se pierde `git revert` sobre una
-- edición mala, y dos entornos pueden divergir.
--
-- QUÉ LO COMPENSA. `status`: una plantilla nace en 'draft' y NADIE la ve hasta
-- que se publica. Ése era el miedo concreto de D-044 —que alguien edite en
-- producción y un usuario aplique una plantilla a medio escribir— y es el que
-- queda cerrado. El seed de abajo es idempotente y los `slug` son los `id` de
-- siempre, así que un entorno nuevo arranca con el catálogo exacto de hoy.
--
-- LO QUE NO CAMBIA, Y ES LO IMPORTANTE: al usar una plantilla se COPIA a las
-- tablas del usuario. Editar el catálogo no le reescribe los pasos a nadie que
-- ya la haya aplicado. Ésa era la otra mitad de D-044 y sobrevive intacta.

-- =============================================================================
-- EL ROL DE ADMINISTRADOR DE PLATAFORMA
-- =============================================================================
-- Es el primer rol del esquema que NO es de workspace. Los de 0003
-- (Owner/Admin/Member/Guest/Viewer) dicen qué puede alguien dentro de un
-- espacio de trabajo; éste dice quién cura el contenido que ven todos, y no
-- alcanza ni un solo dato de usuario: `template_catalog` es la única tabla que
-- toca, y no tiene `user_id`. BR-012 sigue en pie palabra por palabra.
--
-- Se otorga a mano, con SQL, después de desplegar (ver /docs/DEPLOY.md). No hay
-- pantalla para darlo: una interfaz que reparte privilegios es una superficie
-- de ataque que no hace falta mientras los administradores se cuenten con los
-- dedos de una mano.
alter table public.profiles add column if not exists is_admin boolean not null default false;
comment on column public.profiles.is_admin is 'Administrador de PLATAFORMA: cura el catálogo de plantillas. No da acceso a datos de ningún otro usuario (BR-012). Se otorga por SQL, ver /docs/DEPLOY.md.';

-- `security definer` por la misma razón que `list_workspace_members` (0012):
-- `profiles` tiene RLS `select own`, y una política que la consultara directa
-- entraría en la cadena de recursión que costó las migraciones 0011-0015. La
-- función lee la fila SALTÁNDOSE RLS, pero solo puede leer la del usuario
-- actual —`auth.uid()` está fijo en el cuerpo— y solo devuelve un booleano.
create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select p.is_admin from public.profiles p where p.user_id = auth.uid()), false);
$$;
comment on function public.is_admin() is 'true si el usuario de la sesión es administrador de plataforma. security definer para no encadenar con la RLS de profiles (ver 0012).';

grant execute on function public.is_admin() to authenticated;

-- =============================================================================
-- TEMPLATE_CATALOG — la primera tabla del esquema SIN DUEÑO
-- =============================================================================
-- Todo lo demás en `public` filtra por `user_id = auth.uid()`. Ésta no: es
-- contenido compartido, como lo era el array en el código. Por eso lleva su
-- propio pgTAP (supabase/tests/0020) en vez de confiar en el patrón de al lado.
--
-- POR QUÉ `payload jsonb` Y NO CINCO TABLAS RELACIONALES.
-- Los tres tipos tienen formas distintas —proyecto es grupos → tareas →
-- subtareas, rutina es una lista de pasos con duración, hábito es plano— y el
-- contenido se lee ENTERO Y SIEMPRE: nadie consulta «las tareas de la plantilla
-- X» por separado, porque al aplicarla se copia de una vez. Relacional serían
-- cinco tablas y tres joins para algo que nunca se consulta por partes, y una
-- migración de esquema cada vez que un tipo de plantilla gane un campo.
-- La forma la garantiza zod al escribir Y al leer (src/lib/domain/templates/schema.ts);
-- una fila corrupta se descarta en la lectura en vez de tumbar el selector.
create table if not exists public.template_catalog (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('project', 'routine', 'habit')),
  -- El `id` de siempre ('savers-60', 'software-v1'). Se conserva tal cual: es
  -- lo que la interfaz le pasa a applyProjectTemplate y a
  -- createRoutineFromTemplate, y cambiarlo rompería cualquier enlace guardado.
  slug text not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  position integer not null default 0,
  payload jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, slug)
);
comment on table public.template_catalog is 'Catálogo de plantillas (proyecto, rutina, hábito). Contenido compartido, SIN dueño: lectura de lo publicado para cualquier autenticado, escritura solo para is_admin(). Deroga D-044.';
comment on column public.template_catalog.status is 'draft = solo la ve un admin. published = la ve todo el mundo. Es lo que impide que se aplique una plantilla a medio escribir.';

-- El selector pide siempre «las publicadas de este tipo, en orden».
create index if not exists idx_template_catalog_kind on public.template_catalog(kind, status, position);

alter table public.template_catalog enable row level security;

-- Leer: lo publicado lo ve cualquiera con sesión; los borradores, solo un admin.
create policy template_catalog_select on public.template_catalog
  for select using (status = 'published' or public.is_admin());

-- Escribir: solo un admin, y las tres operaciones por separado para que se lea
-- de un vistazo que no hay ninguna rendija.
create policy template_catalog_insert on public.template_catalog
  for insert with check (public.is_admin());
create policy template_catalog_update on public.template_catalog
  for update using (public.is_admin()) with check (public.is_admin());
create policy template_catalog_delete on public.template_catalog
  for delete using (public.is_admin());

-- GRANTS (F9 🔴): RLS filtra FILAS; GRANT decide si el rol puede TOCAR la tabla.
grant select, insert, update, delete on public.template_catalog to authenticated;
grant all privileges on public.template_catalog to service_role;

-- Y a `anon`, nada. El REVOKE es necesario, no decorativo: 0002 dejó puesto
-- `alter default privileges in schema public grant select on tables to anon`,
-- así que esta tabla nace con SELECT para anónimos aunque aquí no se conceda.
-- Y su política de lectura no lo frenaría —`status = 'published'` es cierto sin
-- sesión—, de modo que sin esta línea el catálogo entero sería legible desde la
-- API pública sin iniciar sesión. No es un dato sensible, pero tampoco hay
-- ninguna pantalla que lo necesite antes del login.
revoke all on public.template_catalog from anon;

-- =============================================================================
-- SEED — el catálogo que hasta hoy vivía en código, tal cual
-- =============================================================================
-- 24 plantillas: 11 de proyecto, 3 de rutina, 10 de hábito. Los `slug` son los
-- `id` de siempre y el `position` es el orden en que estaban en el array, así
-- que un entorno nuevo arranca con el catálogo idéntico al de ayer.
--
-- NO SE ESCRIBIÓ A MANO: lo generó un script que importaba los arrays y
-- serializaba cada plantilla, precisamente porque son mil líneas de contenido
-- curado y una errata a mano se descubre en producción. Un test comprueba que
-- los slugs sembrados son exactamente los que había en código.
--
-- `on conflict do nothing` lo hace idempotente: si el catálogo ya está sembrado
-- —porque la migración se reaplica o porque un admin ya lo editó— esta
-- migración no pisa nada. Un catálogo ya vivo NUNCA se sobrescribe al desplegar.
insert into public.template_catalog (kind, slug, status, position, payload) values
  ('project', 'software-v1', 'published', 0, $json${"id":"software-v1","category":"Trabajo y producto","name":"Producto de software · de la idea a la v1","summary":"Para construir y sacar la primera versión de algo. Termina donde empieza el uso real, no en el despliegue.","groups":[{"name":"Descubrimiento","color":"var(--c-purple)","tasks":[{"title":"Escribir el problema en una sola frase","priority":"High"},{"title":"Hablar con cinco personas que lo tengan","priority":"High","subtasks":["Preparar las preguntas","Hacer las cinco conversaciones","Escribir qué se repitió"]},{"title":"Listar lo que ya existe y por qué no basta"},{"title":"Decidir el alcance de la v1: qué NO entra","priority":"High"}]},{"name":"Diseño","color":"var(--c-blue)","tasks":[{"title":"Dibujar el recorrido principal de punta a punta","priority":"High"},{"title":"Definir el modelo de datos"},{"title":"Elegir la pila y escribir por qué esa"}]},{"name":"Construcción","color":"var(--c-teal)","tasks":[{"title":"Montar el esqueleto y el despliegue","priority":"High","subtasks":["Repositorio y estructura","Integración continua","Entorno de producción vacío, ya desplegado"]},{"title":"Construir el recorrido principal","priority":"High"},{"title":"Construir lo que lo rodea (altas, ajustes, errores)"}]},{"name":"Calidad","color":"var(--c-orange)","tasks":[{"title":"Pruebas del camino crítico","priority":"High"},{"title":"Revisar en móvil y con teclado"},{"title":"Repasar estados vacíos y mensajes de error"}]},{"name":"Lanzamiento","color":"var(--c-green)","tasks":[{"title":"Lista de comprobación previa","priority":"High"},{"title":"Publicar"},{"title":"Avisar a las primeras personas"}]},{"name":"Después","color":"var(--c-pink)","tasks":[{"title":"Recoger lo que dicen quienes lo usaron","priority":"High"},{"title":"Decidir qué entra en la v2 y qué se descarta"}]}]}$json$::jsonb),
  ('project', 'lean-startup', 'published', 1, $json${"id":"lean-startup","category":"Negocio","name":"Validar una idea · Lean Startup","source":"El método Lean Startup, de Eric Ries","summary":"Una vuelta completa del bucle Construir-Medir-Aprender. Termina en una decisión explícita: pivotar o perseverar.","groups":[{"name":"Hipótesis","color":"var(--c-purple)","tasks":[{"title":"Escribir la hipótesis de valor: por qué alguien lo querría","priority":"High"},{"title":"Escribir la hipótesis de crecimiento: cómo llegaría a más gente","priority":"High"},{"title":"Nombrar al cliente concreto, no a un segmento"},{"title":"Definir por adelantado qué resultado refutaría la hipótesis","priority":"High"}]},{"name":"Construir · el MVP más pequeño","color":"var(--c-teal)","tasks":[{"title":"Elegir el experimento más barato que responda la pregunta","priority":"High"},{"title":"Construir solo eso, y nada más"},{"title":"Dejar la medición puesta ANTES de lanzar","priority":"High"}]},{"name":"Medir","color":"var(--c-blue)","tasks":[{"title":"Elegir las métricas que sostienen una decisión","priority":"High","subtasks":["Escribir cuáles son","Escribir cuáles se descartan por ser de vanidad"]},{"title":"Separar a los usuarios por cohortes, no por totales acumulados"},{"title":"Montar el panel donde se van a mirar"}]},{"name":"Aprender","color":"var(--c-orange)","tasks":[{"title":"Reunión de resultados con los números delante","priority":"High"},{"title":"Preguntar cinco veces «por qué» sobre lo que falló"},{"title":"Decidir: pivotar o perseverar","priority":"High"}]},{"name":"Siguiente vuelta","color":"var(--c-green)","tasks":[{"title":"Escribir la hipótesis de la siguiente iteración","priority":"High"}]}]}$json$::jsonb),
  ('project', 'doce-meses', 'published', 2, $json${"id":"doce-meses","category":"Negocio","name":"De cero a un millón · negocio de producto","source":"12 Months to $1 Million, de Ryan Daniel Moran","summary":"Las tres fases del libro: aguantar hasta sostener 25 ventas al día, crecer con la gama y la audiencia, y cosechar.","groups":[{"name":"Antes de empezar","color":"var(--c-purple)","tasks":[{"title":"Elegir a UNA persona a la que servir","priority":"High"},{"title":"Escribir qué le duele y qué compra hoy para resolverlo","priority":"High"},{"title":"Decidir la categoría en la que vas a jugar"}]},{"name":"Fase 1 · Grind — llegar a 25 ventas al día","color":"var(--c-orange)","tasks":[{"title":"Elegir de tres a cinco productos para esa misma persona","priority":"High"},{"title":"Lanzar el primero","priority":"High","subtasks":["Fabricación o proveedor","Ficha y fotos","Precio y márgenes","Publicar"]},{"title":"Conseguir las primeras reseñas reales"},{"title":"Ajustar hasta SOSTENER 25 ventas diarias","priority":"High"}]},{"name":"Fase 2 · Growth — la gama y la audiencia","color":"var(--c-teal)","tasks":[{"title":"Lanzar el resto de la gama"},{"title":"Construir audiencia propia, no alquilada","priority":"High","subtasks":["Lista de correo","Publicar con constancia","Sitio donde la gente se junte"]},{"title":"Medir margen y flujo de caja, no solo facturación","priority":"High"}]},{"name":"Fase 3 · Gold — ordenar y decidir","color":"var(--c-green)","tasks":[{"title":"Poner las cuentas en orden"},{"title":"Documentar cómo se opera sin ti","priority":"High"},{"title":"Decidir: vender o quedártela","priority":"High"}]}]}$json$::jsonb),
  ('project', 'servicios', 'published', 3, $json${"id":"servicios","category":"Negocio","name":"Negocio de servicios · los primeros 10 clientes","summary":"Para vender tu trabajo. Termina cuando tienes diez clientes y sabes qué parte del proceso se repite.","groups":[{"name":"La oferta","color":"var(--c-purple)","tasks":[{"title":"Definir el RESULTADO que vendes, no las horas","priority":"High"},{"title":"Poner precio y escribir por qué ese"},{"title":"Escribir a quién NO le sirve esto","priority":"High"}]},{"name":"El canal","color":"var(--c-blue)","tasks":[{"title":"Elegir UN canal y descartar el resto por ahora","priority":"High"},{"title":"Preparar el mensaje de acercamiento"},{"title":"Reunir la prueba social que ya tengas"}]},{"name":"Los primeros diez","color":"var(--c-orange)","tasks":[{"title":"Lista de cincuenta candidatos con nombre","priority":"High"},{"title":"Contactar a los primeros veinte","priority":"High"},{"title":"Hacer las conversaciones de venta"},{"title":"Cerrar los tres primeros"}]},{"name":"Entrega y repetición","color":"var(--c-green)","tasks":[{"title":"Definir el proceso de entrega, paso a paso"},{"title":"Pedir testimonio al terminar cada uno"},{"title":"Decidir qué se puede estandarizar o delegar","priority":"High"}]}]}$json$::jsonb),
  ('project', 'lanzamiento', 'published', 4, $json${"id":"lanzamiento","category":"Marketing","name":"Lanzamiento o campaña","summary":"Para sacar algo al mundo en una fecha. Corto y con un número que decide si salió bien.","groups":[{"name":"Antes","color":"var(--c-purple)","tasks":[{"title":"Definir el objetivo en UN número","priority":"High"},{"title":"Definir a quién le hablas"},{"title":"Fijar la fecha y trabajar hacia atrás desde ella","priority":"High"}]},{"name":"Materiales","color":"var(--c-blue)","tasks":[{"title":"Escribir el mensaje principal","priority":"High"},{"title":"Adaptar las piezas a cada canal"},{"title":"Preparar la página de destino"}]},{"name":"La semana","color":"var(--c-orange)","tasks":[{"title":"Publicar","priority":"High"},{"title":"Responder a todo el mundo el mismo día"},{"title":"Vigilar el número a diario"}]},{"name":"Después","color":"var(--c-green)","tasks":[{"title":"Medir contra el objetivo que se fijó","priority":"High"},{"title":"Escribir qué se repetiría y qué no"}]}]}$json$::jsonb),
  ('project', 'contratar', 'published', 5, $json${"id":"contratar","category":"Trabajo y producto","name":"Contratar a alguien","summary":"Del hueco a la primera semana. La prueba práctica va pagada, porque trabajar gratis filtra a quien no lo necesita.","groups":[{"name":"Definir","color":"var(--c-purple)","tasks":[{"title":"Escribir qué problema resuelve este puesto","priority":"High"},{"title":"Definir las señales de un buen candidato, y las de descarte","priority":"High"},{"title":"Fijar el rango salarial antes de hablar con nadie"}]},{"name":"Buscar","color":"var(--c-blue)","tasks":[{"title":"Publicar la oferta con el rango dentro"},{"title":"Pedir referidos a gente de confianza","priority":"High"},{"title":"Revisar candidaturas"}]},{"name":"Evaluar","color":"var(--c-orange)","tasks":[{"title":"Primera conversación, la misma para todos"},{"title":"Prueba práctica pagada, acotada en tiempo","priority":"High"},{"title":"Pedir referencias y llamarlas de verdad"}]},{"name":"Cerrar","color":"var(--c-green)","tasks":[{"title":"Hacer la oferta","priority":"High"},{"title":"Preparar los primeros treinta días","priority":"High","subtasks":["Accesos y herramientas","A quién conoce la primera semana","Qué entrega el primer mes"]}]}]}$json$::jsonb),
  ('project', 'contenido', 'published', 6, $json${"id":"contenido","category":"Marketing","name":"Motor de contenido · construir audiencia propia","summary":"Para dejar de alquilar la atención. No tiene fecha de fin: termina cuando publicar dejó de depender de la inspiración.","groups":[{"name":"Posicionamiento","color":"var(--c-purple)","tasks":[{"title":"Escribir sobre qué vas a ser la referencia","priority":"High"},{"title":"Elegir de tres a cinco temas y no salirte de ellos","priority":"High"},{"title":"Decidir a quién le hablas y qué ya sabe"}]},{"name":"El sistema de publicación","color":"var(--c-teal)","tasks":[{"title":"Fijar una frecuencia que puedas sostener el peor mes del año","priority":"High"},{"title":"Montar el proceso de una pieza","subtasks":["De dónde salen las ideas","Cómo se escribe","Quién la revisa","Cómo se publica"]},{"title":"Escribir con antelación para no publicar contra el reloj"}]},{"name":"Distribución","color":"var(--c-blue)","tasks":[{"title":"Elegir el canal principal, y uno de reparto","priority":"High"},{"title":"Abrir la lista de correo: es la única audiencia que es tuya","priority":"High"},{"title":"Reaprovechar cada pieza en los otros formatos"}]},{"name":"Medir y ajustar","color":"var(--c-orange)","tasks":[{"title":"Elegir UNA métrica que de verdad importe"},{"title":"Revisar cada mes qué funcionó y repetir esa forma","priority":"High"},{"title":"Podar los temas que no llevan a ninguna parte"}]}]}$json$::jsonb),
  ('project', 'embudo', 'published', 7, $json${"id":"embudo","category":"Marketing","name":"Embudo de captación · de desconocido a cliente","source":"las cinco etapas AARRR de Dave McClure","summary":"Ordena el camino completo en cinco etapas y obliga a medir cada una. Sirve para encontrar dónde se está perdiendo la gente.","groups":[{"name":"Adquisición · cómo llegan","color":"var(--c-purple)","tasks":[{"title":"Listar por dónde llega hoy la gente, con números","priority":"High"},{"title":"Elegir el canal que vas a trabajar en serio"},{"title":"Medir cuánto cuesta traer a una persona"}]},{"name":"Activación · la primera vez","color":"var(--c-teal)","tasks":[{"title":"Definir qué es un buen primer uso, en una frase","priority":"High"},{"title":"Quitar todo lo que estorba antes de ese momento","priority":"High"},{"title":"Medir cuántos llegan a él"}]},{"name":"Retención · si vuelven","color":"var(--c-blue)","tasks":[{"title":"Medir cuántos vuelven a la semana y al mes","priority":"High"},{"title":"Hablar con tres que se fueron"},{"title":"Arreglar el motivo que más se repita"}]},{"name":"Recomendación · si lo cuentan","color":"var(--c-green)","tasks":[{"title":"Preguntar a quien ya volvió si lo recomendaría"},{"title":"Ponérselo fácil a quien quiera contarlo"}]},{"name":"Ingreso · si paga","color":"var(--c-orange)","tasks":[{"title":"Medir cuántos de los activados acaban pagando","priority":"High"},{"title":"Comparar lo que cuesta traerlos con lo que dejan","priority":"High"}]}]}$json$::jsonb),
  ('project', 'mudanza', 'published', 8, $json${"id":"mudanza","category":"Personal","name":"Mudanza","summary":"De decidir el sitio a la primera noche durmiendo bien. Lo que se olvida siempre son los trámites.","groups":[{"name":"Decidir y buscar","color":"var(--c-purple)","tasks":[{"title":"Fijar el presupuesto máximo, todo incluido","priority":"High"},{"title":"Escribir lo innegociable y lo que sí se negocia"},{"title":"Ver sitios"},{"title":"Elegir y firmar","priority":"High"}]},{"name":"Contratar y papeles","color":"var(--c-orange)","tasks":[{"title":"Pedir tres presupuestos de transporte","priority":"High"},{"title":"Dar de alta y de baja los suministros","priority":"High","subtasks":["Luz","Agua y gas","Internet — pedirlo con semanas de margen"]},{"title":"Cambiar la dirección donde haga falta"}]},{"name":"Empacar","color":"var(--c-teal)","tasks":[{"title":"Tirar o donar antes de empacar: no se muda lo que no se usa","priority":"High"},{"title":"Empacar por habitación y etiquetar por dónde va"},{"title":"Preparar la caja del primer día aparte","priority":"High"}]},{"name":"El día y después","color":"var(--c-green)","tasks":[{"title":"Estado del piso viejo y devolución de llaves"},{"title":"Mudanza"},{"title":"Montar primero la cama y el baño","priority":"High"},{"title":"Revisar que todo llegó entero"}]}]}$json$::jsonb),
  ('project', 'empleo', 'published', 9, $json${"id":"empleo","category":"Personal","name":"Buscar trabajo o cambiar de carrera","summary":"Tratarlo como un proyecto y no como una espera. Termina con una decisión, no con una oferta.","groups":[{"name":"Enfocar","color":"var(--c-purple)","tasks":[{"title":"Escribir qué quieres de verdad del siguiente puesto","priority":"High"},{"title":"Escribir lo que NO vuelves a aceptar","priority":"High"},{"title":"Listar de veinte a treinta sitios donde te verías"}]},{"name":"Materiales","color":"var(--c-blue)","tasks":[{"title":"Currículum contando resultados, no responsabilidades","priority":"High"},{"title":"Perfil público al día"},{"title":"Preparar la respuesta a «háblame de ti»"}]},{"name":"Buscar y contactar","color":"var(--c-orange)","tasks":[{"title":"Avisar a quien ya te conoce: por ahí salen la mayoría","priority":"High"},{"title":"Aplicar a los de la lista"},{"title":"Escribir a una persona concreta, no al buzón general"}]},{"name":"Procesos","color":"var(--c-teal)","tasks":[{"title":"Preparar cada entrevista","priority":"High","subtasks":["Qué hace la empresa y cómo gana dinero","Tus tres ejemplos con números","Tus preguntas para ellos"]},{"title":"Escribir después de cada una qué salió mal"},{"title":"Llevar la cuenta de en qué punto está cada proceso"}]},{"name":"Decidir","color":"var(--c-green)","tasks":[{"title":"Negociar la oferta","priority":"High"},{"title":"Comparar contra lo que escribiste al principio","priority":"High"},{"title":"Salir bien del sitio anterior"}]}]}$json$::jsonb),
  ('project', 'certificacion', 'published', 10, $json${"id":"certificacion","category":"Personal","name":"Certificación o examen","summary":"Para una fecha fija que no se mueve. El bloque de práctica va antes de terminar el temario, no después.","groups":[{"name":"Planear","color":"var(--c-purple)","tasks":[{"title":"Inscribirse y pagar: la fecha en firme cambia todo","priority":"High"},{"title":"Conseguir el temario oficial y saber cómo puntúa"},{"title":"Repartir el temario en las semanas que quedan","priority":"High"},{"title":"Reservar el hueco de estudio en la agenda, no el rato que sobre","priority":"High"}]},{"name":"Estudiar","color":"var(--c-teal)","tasks":[{"title":"Primera pasada completa al temario"},{"title":"Repaso espaciado de lo que ya diste","priority":"High"},{"title":"Apuntar aparte lo que se resiste"}]},{"name":"Practicar","color":"var(--c-orange)","tasks":[{"title":"Primer simulacro completo, cronometrado","priority":"High"},{"title":"Corregir y volver solo sobre los fallos"},{"title":"Dos simulacros más en condiciones reales"}]},{"name":"La semana del examen","color":"var(--c-green)","tasks":[{"title":"Repasar solo lo marcado, nada nuevo"},{"title":"Comprobar sede, hora y qué hay que llevar","priority":"High"},{"title":"Dormir: el último día no se gana estudiando"}]}]}$json$::jsonb),
  ('routine', 'savers-60', 'published', 0, $json${"id":"savers-60","name":"Mañana Milagrosa · S.A.V.E.R.S.","source":"Mañana Milagrosa, de Hal Elrod","summary":"Seis prácticas de diez minutos antes de que empiece el día de los demás. El orden importa menos que hacerlas las seis.","frequency":"Diario","steps":[{"title":"Silencio","durationMin":10,"detail":"Sentarse sin pantalla: respirar, meditar o simplemente estar callado.","habitHint":"meditar"},{"title":"Afirmaciones","durationMin":10,"detail":"Leer en voz alta lo que quieres sostener hoy, escrito por ti y en presente."},{"title":"Visualización","durationMin":10,"detail":"Imaginar con detalle cómo se ve el día saliendo bien, no solo el resultado."},{"title":"Ejercicio","durationMin":10,"detail":"Mover el cuerpo lo suficiente para notarlo. No es el entrenamiento del día, es despertarse.","habitHint":"ejercicio"},{"title":"Lectura","durationMin":10,"detail":"Diez páginas de algo que te enseñe algo.","habitHint":"leer"},{"title":"Escritura","durationMin":10,"detail":"Escribir lo que traes en la cabeza, sin editarlo. Sirve para vaciarla."}]}$json$::jsonb),
  ('routine', 'savers-6', 'published', 1, $json${"id":"savers-6","name":"Mañana Milagrosa · versión de 6 minutos","source":"Mañana Milagrosa, de Hal Elrod","summary":"Las mismas seis prácticas, un minuto cada una. Es la versión para el día que te levantas tarde — y existe para que ese día no rompas la racha.","frequency":"Diario","steps":[{"title":"Silencio","durationMin":1,"detail":"Un minuto de respiración, sin tocar el teléfono.","habitHint":"meditar"},{"title":"Afirmaciones","durationMin":1,"detail":"Leer tus afirmaciones una vez."},{"title":"Visualización","durationMin":1,"detail":"Ver el día saliendo bien."},{"title":"Ejercicio","durationMin":1,"detail":"Sesenta segundos de algo que suba el pulso.","habitHint":"ejercicio"},{"title":"Lectura","durationMin":1,"detail":"Una página.","habitHint":"leer"},{"title":"Escritura","durationMin":1,"detail":"Una frase de lo que agradeces o de lo que te preocupa."}]}$json$::jsonb),
  ('routine', 'club-5am', 'published', 2, $json${"id":"club-5am","name":"El Club de las 5 AM · Fórmula 20/20/20","source":"El Club de las 5 de la mañana, de Robin Sharma","summary":"La primera hora partida en tres bloques de veinte minutos: mover el cuerpo, ordenar la cabeza y aprender algo.","frequency":"Diario","steps":[{"title":"Moverse","durationMin":20,"detail":"Ejercicio intenso, hasta sudar. La idea es empezar el día con el cuerpo ya encendido.","habitHint":"ejercicio"},{"title":"Reflexionar","durationMin":20,"detail":"Diario, meditación o planear el día. Sin pantallas y sin correo.","habitHint":"diario"},{"title":"Crecer","durationMin":20,"detail":"Aprender algo deliberadamente: un libro, un curso, un pódcast con cuaderno al lado.","habitHint":"leer"}]}$json$::jsonb),
  ('habit', 'moverme', 'published', 0, $json${"id":"moverme","name":"Moverme 20 minutos","category":"Salud","frequency":"Diario","cue":"Después de dejar el teléfono cargando por la mañana","twoMinVersion":"Ponerme los tenis","why":"La versión de dos minutos no es el ejercicio: es el gesto que hace probable el ejercicio."}$json$::jsonb),
  ('habit', 'agua', 'published', 1, $json${"id":"agua","name":"Un vaso de agua al despertar","category":"Salud","frequency":"Diario","cue":"Después de apagar la alarma","twoMinVersion":"Dejar el vaso lleno en el buró la noche anterior","why":"Prepararlo la noche antes convierte el hábito en algo que ya está hecho a medias cuando despiertas."}$json$::jsonb),
  ('habit', 'hora-de-dormir', 'published', 2, $json${"id":"hora-de-dormir","name":"Acostarme a la misma hora","category":"Salud","frequency":"Diario","cue":"Después de recoger la cocina","twoMinVersion":"Poner una alarma de «hora de apagar»","why":"Es el hábito del que dependen casi todos los demás: sin sueño, la mañana no existe."}$json$::jsonb),
  ('habit', 'leer', 'published', 3, $json${"id":"leer","name":"Leer 20 minutos","category":"Aprendizaje","frequency":"Diario","cue":"Después de meterme a la cama","twoMinVersion":"Leer una página","why":"Una página al día es ridículamente poco, y por eso se cumple. La cantidad se acomoda sola."}$json$::jsonb),
  ('habit', 'apuntar-lo-aprendido', 'published', 4, $json${"id":"apuntar-lo-aprendido","name":"Apuntar lo que aprendí","category":"Aprendizaje","frequency":"Diario","cue":"Después de cerrar el libro","twoMinVersion":"Escribir una frase","why":"Se apila sobre la lectura: el hábito que ya tienes es el disparador del que quieres tener."}$json$::jsonb),
  ('habit', 'tres-tareas', 'published', 5, $json${"id":"tres-tareas","name":"Definir las 3 tareas del día","category":"Trabajo","frequency":"Entre semana","cue":"Después de abrir la computadora","twoMinVersion":"Escribir la primera","why":"Se ancla a algo que ya haces sin falta, así que no necesita fuerza de voluntad para arrancar."}$json$::jsonb),
  ('habit', 'cierre-del-dia', 'published', 6, $json${"id":"cierre-del-dia","name":"Cerrar el día en la bitácora","category":"Trabajo","frequency":"Entre semana","cue":"Después de la última reunión","twoMinVersion":"Una línea de qué pasó","why":"Un cierre corto y diario vale más que una revisión larga que se pospone toda la semana."}$json$::jsonb),
  ('habit', 'gratitud', 'published', 7, $json${"id":"gratitud","name":"Diario de gratitud","category":"Personal","frequency":"Diario","cue":"Después de lavarme los dientes en la noche","twoMinVersion":"Escribir una sola cosa","why":"El cepillado ya es automático: es de los disparadores más fiables que tiene cualquiera."}$json$::jsonb),
  ('habit', 'meditar', 'published', 8, $json${"id":"meditar","name":"Meditar","category":"Personal","frequency":"Diario","cue":"Después de sentarme en el escritorio","twoMinVersion":"Tres respiraciones lentas","why":"Tres respiraciones no cambian nada por sí solas; cambian que mañana vuelvas a sentarte."}$json$::jsonb),
  ('habit', 'llamar', 'published', 9, $json${"id":"llamar","name":"Llamar a alguien que quiero","category":"Personal","frequency":"Semanal","cue":"Después de comer el domingo","twoMinVersion":"Mandar un mensaje","why":"El mensaje es la salida honrosa para el día en que no hay energía para una llamada."}$json$::jsonb)
on conflict (kind, slug) do nothing;

