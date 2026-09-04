# SECURITY — modelo de amenazas breve y matriz de controles

## Modelo de amenazas (resumen)

| Amenaza | Vector | Control |
|---|---|---|
| Usuario A lee/escribe datos de Usuario B | Falta de RLS o RLS sin GRANT | RLS por `user_id = auth.uid()` en TODA tabla de negocio + GRANT explícito por migración (F9) + pruebas pgTAP positivas y negativas |
| Colaborador de un Workspace ve Money OS/Hogar/Tiempo/Hábitos de otro miembro | Política RLS que use `has_project_access`/`workspace_role` sobre tablas equivocadas | Ninguna tabla de Money OS, Hogar, Time o Habits tiene `workspace_id`; sus políticas RLS son siempre `user_id = auth.uid()` puro (BR-012/019/020/027) |
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
