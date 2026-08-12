# Life OS — Web App

Monorepo Next.js (App Router) + Supabase para Life OS: Execution OS, Money OS
e Intelligence OS, construido a partir de:

- **Master Spec** (`MASTER_PRODUCT_SOFTWARE_ARCHITECTURE_SPECIFICATION_v0.4.md`) — fuente de verdad para dominio, entidades, RLS, roles y trazabilidad de IDs.
- **HTML de referencia** (`LifeOS 4.html`) — fuente de verdad para UX, vistas, flujos y estados.

> ⚠️ **Lee primero `/docs/CHECKS.md`**. Este proyecto se construyó en un entorno
> sin acceso a un registro npm real, sin CLI de Supabase y sin proyecto Supabase
> real disponible (ver evidencia en `/docs/CHECKS.md`). El código es completo y
> real (no hay mocks ni lógica de relleno), pero **tú, el owner, debes ejecutar
> `pnpm verify` localmente** para obtener instalación, build y pruebas de base
> de datos verdes antes del primer deploy. Este README no afirma nada que no
> se haya verificado.

## Quickstart

```bash
cp .env.example .env.local   # rellena tus valores (ver /docs/DEPLOY.md)
pnpm install                 # genera pnpm-lock.yaml (NO incluido en esta entrega — ver /docs/CHECKS.md)
git add pnpm-lock.yaml && git commit -m "chore: add lockfile"
pnpm verify                  # install + typecheck + lint + tests + build + db reset + db test
pnpm dev
```

> ⚠️ **`pnpm-lock.yaml` no viene en esta entrega**: este entorno de
> construcción no tuvo acceso a un registro npm real para generarlo (ver
> `/docs/CHECKS.md`). La primera vez que corras `pnpm install` se creará;
> commítealo de inmediato para que las instalaciones futuras (incluida la de
> Vercel) sean reproducibles con `--frozen-lockfile`.

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

Money OS (cuentas, presupuesto, deudas, cashback, inversiones, patrimonio,
metas y Hogar) y la planeación personal (Hoy, ocupaciones, rango de
actividad, hábitos y lectura) son **siempre privados** y nunca accesibles
desde un Workspace de colaboración. Esto se aplica en RLS (base de datos) y
en la capa de Server Actions/Route Handlers (aplicación) — defensa en
profundidad.
