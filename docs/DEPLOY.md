# DEPLOY — Supabase + GitHub + Vercel (copy-paste)

## 1) Supabase

1.1. Crea un proyecto en https://supabase.com/dashboard → anota **Project URL**
     y las keys (Project Settings → API).

1.2. Vincula el proyecto local y aplica las migraciones:

```bash
npm i -g supabase   # o: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <TU_PROJECT_REF>
supabase db push     # aplica supabase/migrations/*.sql en orden
```

1.3. **⚠️ F10 — `supabase db push` NO ejecuta `seed.sql` en un proyecto
     remoto.** Para poblarlo con datos reales de arranque, ve al **SQL
     Editor** de Supabase Studio, pega el contenido completo de
     `supabase/seed.sql` y ejecútalo. (En local, `supabase db reset` sí lo
     ejecuta automáticamente.)

1.4. Verifica RLS y GRANTS: en Table Editor, cada tabla debe mostrar el
     candado de "RLS enabled". Si alguna tabla muestra "permission denied"
     al probarla desde la app, revisa que la migración correspondiente
     tenga su bloque `grant select/insert/update/delete` (§4bis del prompt
     de build) — no debería faltar, pero valida.

1.5. Genera los tipos reales de TypeScript (reemplaza el stub — **F3**):

```bash
pnpm gen:types
# equivalente a: supabase gen types typescript --linked > src/types/database.types.ts
```

1.6. Auth: en Authentication → Providers, confirma que **Email** está
     habilitado. En Authentication → URL Configuration, agrega tu dominio de
     Vercel a **Redirect URLs** (`https://tu-dominio.vercel.app/auth/callback`).

## 1bis) Correo transaccional (invitaciones a workspaces)

Las invitaciones a workspaces envían un correo con el enlace de aceptación.
Sin estas variables la app **no falla**: crea la invitación igual y muestra el
enlace para copiarlo y compartirlo a mano (ver `InviteMemberForm.tsx`).

```bash
RESEND_API_KEY=re_xxxxxxxx        # https://resend.com → API Keys
EMAIL_FROM="LifeOS <no-reply@tudominio.com>"
NEXT_PUBLIC_APP_URL=https://tu-dominio.vercel.app   # base de los enlaces del correo
```

⚠️ Resend solo entrega desde un **dominio verificado** (Domains → Add Domain →
registros DNS). Mientras no lo verifiques, el remitente de prueba
`onboarding@resend.dev` únicamente entrega a la dirección con la que te
registraste en Resend: a cualquier otro destinatario el envío se rechaza y la
UI mostrará el motivo devuelto por el proveedor.

⚠️ `NEXT_PUBLIC_APP_URL` debe apuntar al dominio real. Si se queda en
`http://localhost:3000` (el default), los enlaces del correo no funcionarán
para nadie más.

## 2) GitHub

```bash
git init
git add -A
git commit -m "Life OS — monorepo Next.js + Supabase inicial"
git branch -M main
git remote add origin https://github.com/<tu-usuario>/lifeos-app.git
git push -u origin main
```

`.gitignore` ya excluye `.env*`, `.next`, `node_modules`, `.vercel`.
**Confirma que `pnpm-lock.yaml` SÍ quedó commiteado** (`git ls-files | grep lock`).

## 3) Vercel

1. Importa el repo → Framework preset: **Next.js** (autodetectado).
2. **Environment Variables** (Project → Settings → Environment Variables):

   | Nombre | Dónde obtenerlo | Alcance |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Production, Preview, Development |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public | Production, Preview, Development |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role (⚠️ nunca la expongas con prefijo `NEXT_PUBLIC_`) | Production, Preview |
   | `NEXT_PUBLIC_APP_URL` | Tu URL de Vercel, p. ej. `https://lifeos-app.vercel.app` | Production, Preview |

3. Install/Build commands ya están fijados en `vercel.json`
   (`pnpm install --frozen-lockfile`, `pnpm build`); Node se toma de `.nvmrc`.
4. Deploy.

## 4) Smoke test post-deploy (§8bis)

- [ ] `GET https://tu-dominio.vercel.app/api/health` → `{"status":"ok",...}`.
- [ ] Inicia sesión con el usuario demo (`luis.demo@lifeos.local` /
      `LifeosDemo!2026`, del seed) → debe llegar a `/home` con datos reales
      (proyecto "Lanzar Life OS MVP", cuentas con saldo, etc.), **no una
      pantalla vacía**.
- [ ] Crea una tarea nueva en `/execution`, cámbiala de estado, verifica que
      persiste tras recargar (confirma lectura/escritura real contra
      Postgres, no `localStorage`).
- [ ] En `/money`, registra un gasto vinculado a una deuda existente y
      confirma que el saldo de la deuda baja en `/debt` (FR-DEB-006).
- [ ] **RLS negativa**: crea un segundo usuario (signup) y confirma que NO ve
      ninguna de las cuentas/proyectos del primero.

## 5) Rollback

- **Vercel**: Deployments → selecciona el deployment anterior → "Promote to
  Production".
- **Supabase**: las migraciones son forward-only. Para revertir un cambio de
  esquema, escribe una migración compensatoria nueva (p. ej.
  `drop column ...` o `drop policy ...`) — nunca elimines archivos de
  migración ya aplicados en producción.

## 6) Errores comunes → causa → fix

Ver la Matriz de Fallos Conocidos completa en `/docs/FAILURE_MATRIX.md`
(copia exacta de la tabla del prompt de build, con el estado de mitigación
de cada fila marcado para este proyecto).
