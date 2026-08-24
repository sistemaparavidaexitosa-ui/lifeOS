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

**Intelligence OS es la única parte que envía datos fuera del servidor**, y solo
cuando pulsas «Analizar»: viajan hechos ya calculados, en texto, con los nombres
de cuentas y personas sustituidos por alias, y únicamente de los dominios que
hayas encendido en Configuración (todos apagados por defecto). Nunca filas
crudas de la base. El filtro vive en `src/lib/insights/context.ts`.

Money OS (cuentas, presupuesto, deudas, cashback, inversiones, patrimonio,
metas y Hogar) y la planeación personal (Hoy, ocupaciones, rango de
actividad, hábitos, lectura, **metas personales y rutinas**) son **siempre
privados** y nunca accesibles desde un Workspace de colaboración. Esto se
aplica en RLS (base de datos) y en la capa de Server Actions/Route Handlers
(aplicación) — defensa en profundidad.
