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

## 1ter) Las funciones de IA (una sola llave)

Tres cosas llaman al modelo y las tres salen por la misma variable: el motor de
recomendaciones (Intelligence OS), «Generar plan con IA» en `/execution` y el
chat del rail lateral. Sin ella la app **no falla**: esas tres avisan de que no
están configuradas y todo lo demás sigue igual (F11).

```bash
GEMINI_API_KEY=AIza...   # https://aistudio.google.com/apikey (gratis)
```

El modelo es `gemini-2.5-flash` y está fijado en
`src/lib/ai/gemini-provider.ts`, que es el único archivo del proyecto que habla
con la API; `gemini-2.5-flash-lite` es ahí el cambio de una línea si hiciera
falta algo más barato o más rápido.

**Sobre el free tier.** Tiene límite por minuto y por día. Ninguna de las tres
funciones corre sola: no hay cron ni llamadas en segundo plano, siempre las
dispara el usuario con un gesto, así que el consumo es una llamada por clic o
por turno de chat. Al topar el límite, la respuesta lo dice con esas palabras
—«se agotó la cuota gratuita, inténtalo en un minuto»— y no como un error
genérico.

**Fue de dos llaves a una.** Hasta la migración a Gemini convivían
`ANTHROPIC_API_KEY` (recomendaciones) y `OPENAI_API_KEY` (plan de proyecto).
Las dos se pueden borrar del entorno: ya no las lee nadie.

⚠️ Lo que sale del servidor, en los tres casos:

- **Recomendaciones y chat:** los **hechos ya calculados**, en texto, con los
  nombres de cuentas y dependientes sustituidos por alias, y solo de los
  dominios que el usuario haya encendido en Configuración → IA (vacío por
  defecto). Nunca filas crudas. El filtro vive en un solo archivo,
  `src/lib/insights/context.ts`.
- **Plan de proyecto:** el **objetivo que escribió el usuario** y, en un
  proyecto que ya tiene tareas, los **títulos** de sus grupos y tareas. Nada
  más: ni responsables, ni fechas, ni comentarios, ni ids. El panel lo dice en
  pantalla antes de generar.

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
   | `GEMINI_API_KEY` | https://aistudio.google.com/apikey (gratis). **Opcional**: sin ella la app despliega y funciona; solo las tres funciones de IA avisan de que no están configuradas (§1ter) | Production, Preview |
   | `RESEND_API_KEY` | https://resend.com → API Keys. **Opcional**: sin ella la invitación se crea igual y se muestra el enlace para compartirlo a mano (§1bis) | Production, Preview |
   | `EMAIL_FROM` | El remitente de las invitaciones, p. ej. `LifeOS <no-reply@tudominio.com>`. Solo si pusiste `RESEND_API_KEY` | Production, Preview |

   Esta tabla no listaba ninguna llave opcional y por eso se desplegaba sin
   ellas sin saber que faltaban. Las cuatro primeras son **obligatorias**; las
   tres últimas apagan su feature y nada más.

3. Install/Build commands ya están fijados en `vercel.json`
   (`pnpm install --frozen-lockfile`, `pnpm build`); Node se toma de `.nvmrc`.
4. Deploy.

## 3bis) Nombrar al primer administrador (migración 0044)

El catálogo de plantillas se edita desde `/admin`, y esa ruta devuelve **404** a
quien no sea administrador de plataforma. Nadie lo es al desplegar: la columna
nace en `false` para todo el mundo y **no hay pantalla para repartir el
privilegio** — repartir permisos desde la interfaz es superficie de ataque que
no hace falta mientras los administradores se cuenten con los dedos de una mano.

En Supabase → SQL Editor, con el correo de la cuenta que va a administrar:

```sql
update public.profiles
set is_admin = true
where user_id = (select id from auth.users where email = 'tu-correo@ejemplo.com');
```

Comprueba que quedó (debe devolver una fila):

```sql
select p.user_id, u.email, p.is_admin
from public.profiles p join auth.users u on u.id = p.user_id
where p.is_admin;
```

Después, en la aplicación: **Configuración → Administración → Catálogo de
plantillas**. Si el enlace no aparece, el `update` no encontró el perfil —
normalmente porque esa cuenta todavía no ha iniciado sesión nunca y su fila de
`profiles` aún no existe.

Para quitarlo, el mismo `update` con `false`. Es reversible y no borra nada: las
plantillas que haya publicado siguen publicadas.

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
- [ ] **Catálogo de plantillas**: en `/execution`, el selector de plantilla del
      formulario de nuevo proyecto ofrece las once de siempre (si sale vacío, el
      seed de la migración 0044 no llegó).
- [ ] **Panel de administración**: con el usuario sin `is_admin`, `/admin`
      responde 404. Con el administrador, abre y lista los tres catálogos.
- [ ] **Borrador invisible**: crea una plantilla en `/admin`, déjala sin
      publicar y confirma con el otro usuario que NO aparece en su selector.
      Publícala y confirma que sí.

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
