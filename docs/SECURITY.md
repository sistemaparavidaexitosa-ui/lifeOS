# SECURITY — modelo de amenazas breve y matriz de controles

## Modelo de amenazas (resumen)

| Amenaza | Vector | Control |
|---|---|---|
| Usuario A lee/escribe datos de Usuario B | Falta de RLS o RLS sin GRANT | RLS por `user_id = auth.uid()` en TODA tabla de negocio + GRANT explícito por migración (F9) + pruebas pgTAP positivas y negativas |
| Colaborador de un Workspace ve Money OS/Hogar/Tiempo/Hábitos de otro miembro | Política RLS que use `has_project_access`/`workspace_role` sobre tablas equivocadas | Ninguna tabla de Money OS, Hogar, Time o Habits tiene `workspace_id`; sus políticas RLS son siempre `user_id = auth.uid()` puro (BR-012/019/020/027) |
| **Colaborador de un Workspace ve datos privados a través del grafo** | (regla afinada en 0055, ver abajo: se puede cruzar dentro del espacio PERSONAL, que no admite a nadie más) `graph_nodes` es la primera tabla del sistema donde una fila de Money OS y una de un proyecto compartido conviven bajo la misma política, así que el control de la fila de arriba —«ninguna tabla mezcla los dos mundos»— deja de aplicarse | Tres capas, ninguna suficiente sola: (1) el CHECK `graph_nodes_tenant_shape` hace imposible una fila «anfibia»; (2) **dos** políticas de SELECT separadas por `scope`, no un `or`, para que un fallo en la de espacios no pueda alcanzar una fila privada; (3) el trigger `graph_edge_tenant` **rechaza** cualquier arista cuyos extremos no compartan dueño. Probado en `supabase/tests/0025_rls_grafo.sql` (migración 0054) |
| **Fuga a través de una función que camina con la RLS apagada** | `graph_impact` y `graph_subgraph` son las primeras funciones `SECURITY DEFINER` con `row_security = off` que recorren filas: la RLS no las protege, las protege el código de dentro | El acceso a la raíz se comprueba antes de caminar y el permiso se filtra **en cada salto**, no al hidratar; el permiso se precalcula en **dos** conjuntos (espacios donde se es miembro no-Guest, y proyectos compartidos de un Guest) porque uno solo le habría dado a un Guest el espacio entero; las funciones son `stable` (no pueden escribir) y `revoke execute … from anon` deshace el default de `0010`. `supabase/tests/0025_rls_grafo.sql` incluye pruebas sobre `proconfig` y `provolatile` para detectar que alguien les quite los `set` |
| **Un usuario declara una fuente de proyección y cambia el ámbito de nodos ajenos** | `graph_sources` (0057) es la tabla que decide en qué `scope` nace cada nodo: declarar `budgets` de ámbito espacio pondría los presupuestos de alguien bajo `graph_nodes_select_espacio` en el siguiente guardado | Es catálogo, no dato de usuario: la escritura se cierra con `REVOKE insert, update, delete … from anon, authenticated` —igual que `graph_node_types` en 0054— y no con políticas, porque no hay nada que filtrar por fila. `graph_install_source` (emite DDL), `graph_backfill_source` (escribe tablas de negocio) y `graph_registry_deriva` (cuenta filas de todos los usuarios) se revocan además a `authenticated`. Probado en `supabase/tests/0028_registro_del_grafo.sql`, assertions 11-13 y 16 |
| Filtración de `service_role` al cliente | Import accidental de `admin.ts` en un Client Component | `import "server-only"` en `admin.ts` — falla en build time si se intenta bundlear para el navegador |
| XSS vía scripts inline no autorizados | CSP ausente o mal configurada | `middleware.ts` aplica CSP con nonce por request + `strict-dynamic` (F5) |
| Clickjacking | Falta de `X-Frame-Options`/`frame-ancestors` | `next.config.ts` (`X-Frame-Options: DENY`) + CSP `frame-ancestors 'none'` |
| Inyección SQL | Interpolación de strings en queries | Todo acceso a datos pasa por el SDK de Supabase (`.from().select()...`), nunca SQL crudo desde la aplicación (salvo migraciones/seed, que son texto estático versionado) |
| Fuga de secretos en logs | `console.log` de payloads con datos sensibles | Ningún handler registra el body completo de una request; los `audit_log.meta` solo guardan campos no sensibles (montos, IDs, no contenido de notas) |
| CSRF en Server Actions | — | Next.js App Router incluye protección CSRF nativa para Server Actions (validación de Origin) |
| Ataque de fuerza bruta en login | — | Delegado a Supabase Auth (rate limiting nativo); MFA queda como Open Decision (OD-006 de la Master Spec) |

## Secretos y variables de entorno

- `.env.example` contiene **solo nombres**, nunca valores reales.
- `SUPABASE_SERVICE_ROLE_KEY` se lee **exclusivamente** en
  `src/lib/supabase/admin.ts`, con validación lazy (`requireServiceRoleKey()`
  en `src/config/env.ts`) — nunca a nivel de módulo, nunca en el cliente.
- Ninguna variable con prefijo `NEXT_PUBLIC_` contiene un secreto (todas son
  la URL pública del proyecto Supabase, la anon key —diseñada para ser
  pública bajo RLS—, y configuración no sensible de la app).

## Auditoría

`audit_log` es append-only a nivel de RLS (políticas de `SELECT`/`INSERT`
para `authenticated`, **sin** política de `UPDATE`/`DELETE` — ver
`0009_audit.sql` y el `REVOKE` explícito en `0010_default_privileges.sql`).
Cada acción de negocio relevante (crear tarea, cambiar estado, registrar
transacción, vincular pago de deuda, secuenciar proyecto, etc.) inserta una
fila con `correlation_id`.

## Administrador de plataforma (migración 0044)

`profiles.is_admin` es el primer privilegio del sistema que no es de workspace.
Lo que **puede**: leer, escribir, publicar y borrar filas de `template_catalog`
—el catálogo de plantillas de proyecto, rutina y hábito que ven todos los
usuarios—. Lo que **no puede**, y no es una promesa sino una consecuencia del
esquema: `template_catalog` es la única tabla que alcanza, y no tiene `user_id`.
Ninguna política de ninguna otra tabla menciona `is_admin()`, así que un
administrador ve exactamente los mismos datos de usuario que cualquier otra
persona: los suyos. BR-012 no se toca.

Hay una assertion de pgTAP que lo demuestra en vez de afirmarlo
(`supabase/tests/0020_rls_template_catalog.sql`): con la sesión de un
administrador, `select ... from profiles where user_id = <otro>` devuelve vacío.

**Tres controles sobre la escritura**, en profundidad:

1. La ruta `/admin` devuelve **404** a quien no es administrador — no un
   redirect, que confirmaría que existe.
2. La **RLS** de 0044 rechaza `insert`/`update`/`delete` de quien no lo es.
3. Cada **Server Action** lo vuelve a comprobar antes de escribir, porque una
   Server Action es un endpoint HTTP y se puede invocar sin pasar por la
   pantalla.

El privilegio se otorga con SQL (ver `/docs/DEPLOY.md`); no hay interfaz para
repartirlo. Cada guardado, publicación, retirada y borrado deja una fila en
`audit_log` con el usuario que lo hizo.

`anon` no llega a `template_catalog` ni siquiera a lo publicado: la migración
**revoca** el `select` que `0002` le concede por defecto a toda tabla nueva del
esquema.

## El grafo y la frontera de privacidad (migración 0054)

`graph_nodes` proyecta catorce entidades de dominio como nodos, y entre ellas
hay tanto cosas de espacio compartido (proyectos, tareas, notas) como cosas
estrictamente privadas (metas, hábitos, presupuestos, inversiones, activos,
decisiones de la bitácora). Es la primera vez que ambos mundos comparten tabla.

La invariante, dicha sin adornos: **un nodo privado nunca se conecta con un nodo
de un espacio de trabajo, ni siquiera en tu espacio personal, ni siendo dueño de
los dos**. El trigger `graph_edge_tenant` lanza si se intenta, con un mensaje en
español que nombra los dos nodos.

Las consecuencias visibles del producto, aceptadas a conciencia:

- El Personal Graph y el Money Graph son **grafos separados** del Project Graph
  y del Workspace Graph. No hay una sola línea entre ellos.
- Una **Decisión** de la bitácora no se puede enlazar con el proyecto del que
  salió: `logbook` es privada por `user_id`, aunque su fila apunte a un proyecto.
- Un **resultado clave** cuya fuente sea un proyecto (`key_results.source_kind =
  'project'`) no genera arista. Solo las fuentes privadas —hábito y libro— la
  generan.

Antes que un nodo que filtre el texto de tu bitácora a tus compañeros de
espacio, un nodo que vive solo en tu grafo personal.

### La frontera se redefinió en 0055: dentro del espacio personal sí se cruza

La regla de 0054 era «los dos extremos tienen el mismo dueño». La de 0055 es más
precisa, no más laxa: **«a los dos extremos los ve exactamente la misma
persona»**. El espacio personal cumple eso y el compartido no, y no es una
opinión sobre el producto sino una propiedad del esquema: desde 0030 hay dos
guardas que impiden invitar a nadie a un espacio personal y meter a un miembro
ajeno, más un índice único parcial que garantiza uno por persona. Una arista ahí
dentro no se le puede enseñar a nadie porque no hay nadie.

Lo que eso permite: una meta personal puede alimentarse de un proyecto de TU
espacio personal — la clase de relación que un sistema operativo personal existe
para enseñar y que 0054 prohibía sin querer.

Lo que sigue prohibido, y sigue lanzando: **cualquier arista que toque un espacio
COMPARTIDO desde fuera**. Ahí es donde BR-012 importaba, y ahí no cambia nada.

**El agujero que 0055 cierra en el mismo sitio**: `moveProject` puede sacar un
proyecto del espacio personal y llevarlo a uno compartido, y una arista legal hoy
pasaría mañana a cruzar de verdad sin que nadie la tocara. El trigger
`graph_reproject_project` **borra** esas aristas en la misma transacción que el
UPDATE —así no existe un instante en el que el proyecto ya esté compartido y la
arista siga viva— y deja rastro en `audit_log` (`graph.edges.dropped_on_move`).
Se borran en vez de rechazar la mudanza porque mover un proyecto es una acción de
`/execution`, una pantalla que no sabe nada de grafos.

La condición vive en UNA función, `graph_misma_audiencia`, que comparten el
trigger de creación y `graph_check_integrity()`: con la regla escrita dos veces,
el día que una cambiara la otra dejaría de detectar lo que ya no cumple.

Probado en `supabase/tests/0026_rls_grafo_personal.sql`, incluida la comprobación
de que el trigger rechaza igual **sin la RLS de por medio**, que es como escribe
`service_role`.

### El registro de proyección (migración 0057) no relaja nada de lo anterior

`graph_sources` describe como dato lo que 0054 tenía escrito solo dentro de sus
`CREATE TRIGGER`: qué tabla es qué nodo, con qué etiqueta, qué metadatos y —lo
que importa aquí— **en qué ámbito**. Tres cosas que conviene tener claras:

1. **No abre la frontera.** `graph_misma_audiencia` no se toca, ni el trigger que
   la aplica, ni las dos políticas de SELECT separadas por `scope`. El registro
   describe la proyección; la frontera sigue siendo de las aristas.
2. **La cierra un poco más.** La assertion nº 10 de
   `supabase/tests/0028_registro_del_grafo.sql` comprueba que ninguna fuente
   produzca nodos en un ámbito distinto del que declara, y está escrita
   recorriendo `graph_sources` en vez de enumerar tablas (D-141): cuando se
   proyecte Money OS entero, cada tabla nueva llegará con esa comprobación ya
   aplicada.
3. **Lo que no puede ser fuente.** El validador rechaza cualquier tabla cuya
   clave primaria no sea una sola columna `id` de tipo `uuid`, porque todos los
   proyectores hacen `on conflict (entity_id)`. Eso deja fuera a `profiles`,
   `notification_prefs`, `nutrition_profiles`, `task_assignees`, `comment_reads`
   y `comment_reactions`, y el rechazo ocurre en la migración y no en un trigger
   en producción.

La hoja de ruta completa está en `docs/UNIVERSAL_GRAPH_ROADMAP.md`. El milestone
que más superficie de privacidad añade —unificar la recuperación de la IA con el
registro— queda marcado ahí como **pendiente de su propia revisión**: hoy el
filtro de dominios vive entero en `src/lib/insights/context.ts`, en un archivo
que se audita de una sentada, y esa propiedad no se puede perder por el camino.

## Datos de menores de edad (Hogar)

El módulo de Hogar (`family_members`) puede almacenar el nombre de un hijo
menor de edad, capturado por el titular. Esto es una **Open Decision legal**
(OD-016 de la Master Spec): antes de operar en producción con usuarios
reales, se requiere una revisión de privacidad específica sobre la base
legal de este tratamiento de datos, dado que este entorno de construcción no
pudo hacer esa revisión.

## Pendiente de revisión (Open Decisions heredadas de la Spec)

- OD-006: nivel ASVS objetivo y política de MFA.
- OD-013: modelo definitivo de invitados externos (Guest) y expiración de
  accesos compartidos.
- OD-016: base legal para datos de menores en el módulo de Hogar.

Ninguna de estas se cerró unilateralmente en este build; permanecen como
decisiones pendientes del Product Owner.
