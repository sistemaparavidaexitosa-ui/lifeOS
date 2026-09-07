# Life OS — Web App

Monorepo Next.js (App Router) + Supabase para Life OS: Execution OS, Money OS
e Intelligence OS, construido a partir de:

- **Master Spec** (`MASTER_PRODUCT_SOFTWARE_ARCHITECTURE_SPECIFICATION_v0.4.md`) — fuente de verdad para dominio, entidades, RLS, roles y trazabilidad de IDs.
- **HTML de referencia** (`LifeOS 4.html`) — fuente de verdad para UX, vistas, flujos y estados.

> **Estado de verificación:** el 2026-08-23 se corrió la cadena completa
> (`install`, `typecheck`, `lint`, 116 pruebas unitarias, `build`,
> `supabase db reset` y las 52 assertions pgTAP) contra una pila local de
> Supabase en Docker, en verde. La evidencia paso a paso está en
> `/docs/CHECKS.md`, que sigue siendo la única fuente de verdad sobre qué se
> ejecutó realmente y qué no.

## Quickstart

```bash
cp .env.example .env.local   # para desarrollo local sirve tal cual (ver abajo)
pnpm install --frozen-lockfile
pnpm verify                  # install + typecheck + lint + tests + build + db reset + db test
pnpm dev
```

### Desarrollo local con Docker

`pnpm verify` necesita una base Postgres: la levanta el CLI de Supabase sobre
Docker, no hace falta un proyecto en la nube.

```bash
npx supabase start           # Postgres + Auth + PostgREST + Studio en Docker
pnpm db:reset                # aplica las migraciones de cero y corre el seed
pnpm db:test                 # pruebas pgTAP de RLS
pnpm gen:types:local         # regenera src/types/database.types.ts desde la base local
```

`.env.example` ya trae la URL y las llaves por defecto de la pila local (son
las mismas en cualquier máquina y **no son secretas**). Para apuntar a un
proyecto real, sustitúyelas por las de Supabase → Project Settings → API, y usa
`pnpm gen:types` (`--linked`) en lugar de `gen:types:local`.

Studio queda en <http://127.0.0.1:54323> y los correos de prueba (invitaciones,
magic links) en Mailpit, <http://127.0.0.1:54324>.

## Estructura

Ver `/docs/TRACEABILITY.md` para el mapeo Requisito → Tabla → RLS → API →
Componente → Test, y `/docs/UX_MAP.md` para el mapeo Vista HTML → Ruta →
Componente → Fuente de datos → Acción real.

## Documentación

| Archivo | Contenido |
|---|---|
| `/docs/VERSIONS.md` | Versiones fijadas y compatibilidad |
| `/docs/UX_MAP.md` | Vista HTML → ruta → componente → dato → acción |
| `/docs/TRACEABILITY.md` | Requisito → tabla → RLS → API → test |
| `/docs/DECISIONS.md` | Resoluciones Spec ⇄ HTML y decisiones técnicas |
| `/docs/DEPLOY.md` | Pasos copy-paste: Supabase → GitHub → Vercel |
| `/docs/RUNBOOK.md` | Incidentes comunes y recuperación |
| `/docs/SECURITY.md` | Modelo de amenazas y matriz de controles |
| `/docs/CHECKS.md` | **Verificación honesta** — qué se ejecutó realmente |
| `/docs/FAILURE_MATRIX.md` | Copia de la matriz de fallos §1 con estado de mitigación |

## Privacidad (BR-012/019/020/027)

Tres partes de la app hablan con el exterior, y ninguna más.

**1. La IA** — el motor de recomendaciones, el chat lateral y el coach de vida.
Desde la migración 0053 la postura es **acceso total, dicho sin adornos**: viajan
hacia Gemini los hechos calculados de tu vida y, cuando el chat lo necesita para
contestar, **filas reales** de tus tablas —metas, agenda, gastos, rutinas,
comidas, notas, patrimonio, actividad de tu equipo—, con los **nombres reales**
de tus cuentas, personas y proyectos. Ya no hay alias: un coach que dice «Cuenta
#2» no puede hablar de tu vida. Sigue habiendo tres límites, y son los que
quedan: una **lista blanca** de tablas (lo que no está, no se consulta), el
**interruptor por dominio** de Configuración → IA (todo encendido por defecto,
se apaga uno a uno) y la **RLS de la base**, que decide qué filas existen para
ti. El filtro vive entero en `src/lib/insights/context.ts`, en un solo archivo
que se puede auditar de una sentada. Cada análisis, cada turno de chat y cada
mensaje del coach dejan en `audit_log` qué dominios viajaron y qué se buscó en
internet. El plan gratuito de Google admite usar los datos del free tier para
mejorar sus productos: es una decisión tomada con esa información delante.

Lo que **no** viaja aunque esté encendido: los nombres de tus compañeros de
espacio. Los hechos de actividad cuentan y describen —cuántas menciones, qué
proyecto concentra el movimiento— y nunca dicen quién
(`src/lib/domain/insights/facts/activity.ts`). Esa decisión fue sobre tus datos,
no sobre los de otras personas.

**2. Las búsquedas del coach y del chat.** Cuando la respuesta depende de algo
del mundo —un método, un precio de referencia—, la IA puede buscar en Google.
La consulta que sale no lleva tus cifras ni tus nombres, es una regla dura del
prompt, y queda registrada textualmente en `audit_log` para poder comprobarlo.

**3. Las notificaciones push**, si las activas en un dispositivo. El aviso pasa
por los servidores de Google (Android) o Apple (iPhone), que es el único camino
que existe para hacer sonar un teléfono desde la web. **Su contenido va cifrado
de extremo a extremo** (RFC 8291, `src/lib/domain/push/encrypt.ts`): ni Google
ni Apple pueden leer quién te mencionó ni qué te dijo. Sí ven que hubo un aviso
y cuándo. Nada de esto ocurre si no activas las notificaciones.

## Administración del catálogo de plantillas

Las plantillas de proyecto, rutina y hábito viven en la base (`template_catalog`,
migración 0044) y las edita un **administrador de plataforma** desde `/admin`,
al que se llega por Configuración. Una plantilla nace en borrador y no la ve
nadie hasta que se publica.

Ese rol solo alcanza esa tabla: no da acceso a los datos de ningún usuario, y hay
una prueba de RLS que lo demuestra. Se otorga con SQL después de desplegar — ver
`/docs/DEPLOY.md`, paso 3bis.

## Privacidad, en detalle

Money OS (cuentas, presupuesto, deudas, cashback, inversiones, patrimonio,
metas y Hogar) y la planeación personal (Hoy, ocupaciones, rango de
actividad, hábitos, lectura, **metas personales y rutinas**) son **siempre
privados** y nunca accesibles desde un Workspace de colaboración. Esto se
aplica en RLS (base de datos) y en la capa de Server Actions/Route Handlers
(aplicación) — defensa en profundidad.
