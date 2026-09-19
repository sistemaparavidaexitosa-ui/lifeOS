# Arranque guiado — diseño (la capa que conduce la mañana)

**Fecha:** 2026-09-19 · **Estado:** implementado en `feat/arranque-guiado`. Correcciones en «Lo que cambió al implementarlo».

## Contexto

LifeOS ya tiene todas las piezas de un ritual matutino, repartidas en pantallas
distintas. El brief de identidad se escribe solo a las 04:00 (D-161, D-164):
afirmaciones categorizadas, mantra, visualización y acción del día. Las rutinas
saben qué hábitos tocan hoy y en qué orden (0046). `getHomeData` agrega dinero de
la quincena, tareas de impacto, saturación y recordatorios en una sola pasada.
`greetingFor(hour)` lleva desde el primer día sabiendo si es de día o de noche.

Lo que no existe es el **momento** que las une. Hoy la persona abre la app y
aterriza en un panel: una rejilla de tarjetas que hay que leer y decidir. El
material de un arranque guiado está escrito y probado, pero nadie lo ha puesto
en una secuencia.

Esto no es un rediseño ni una app nueva. Es una **capa opcional** que se monta
sobre el shell actual, se calcula con los datos que ya existen y se puede apagar
entera.

## Invariantes que NO se tocan

1. **El frontend actual no se toca.** Ninguna ruta cambia, ningún componente
   existente cambia de contrato. Lo único que se modifica de lo ya escrito son
   tres extracciones sin cambio de conducta (`loadRoutinesForToday`,
   `HabitCheckbox`, `exigirAdmin`) y una línea en `(app)/layout.tsx`.
2. **Nace apagada.** `ritual_policy.enabled` se siembra en `false`. Desplegar
   esta migración no le cambia la mañana a nadie.
3. **NO-MOCK (F8).** Ningún paso existe si su dato no existe. No hay secuencia
   fija, no hay contenido de relleno, no hay una afirmación de ejemplo.
4. **El modelo no calcula.** Toda cifra que aparezca en el ritual sale de
   funciones puras de `src/lib/domain/**`, como en el resto del repo.
5. **BR-012/027.** El ritual es personal por construcción: todo lo que lee sale
   de tablas filtradas por `user_id` con la sesión de la persona. No hay `?ws=`,
   no hay workspace, no hay nada compartido.
6. **`guardarBrief()` sigue siendo el único escritor de `identity_briefs`**, o el
   tope de tres generaciones al día se fugaría por el camino que no lo cuenta.
7. **D-008:** no se añade Testing Library. Lo que hay que probar del DOM se
   extrae a un módulo sin React y se prueba en jsdom, como `linea-dom.ts`.

## La decisión de fondo: el ritual no es contenido, es una proyección

La tentación evidente era una tabla `ritual_steps` donde el administrador
compusiera la secuencia. Se descarta, y el motivo es el que ordena todo lo demás:
**una secuencia guardada es una secuencia que miente en cuanto los datos cambian.**
Si el paso «toma agua» vive en una fila, sigue ahí el día que la persona borra
ese hábito, y sigue ahí a las once de la mañana cuando ya se lo tomó.

Así que la secuencia **se calcula en cada apertura** a partir de rutinas, hábitos,
registros de hoy, brief, tareas y dinero. Lo que el administrador configura no es
el contenido: es **qué tipos de paso están permitidos**, en qué ventana horaria y
con qué frecuencia. El orden es narrativo —saludo, identidad, rutina, contexto,
plan— y lo fija el dominio, no una fila arrastrable.

Consecuencia que conviene escribir para que nadie la «arregle»: un día sin
hábitos pendientes, sin brief y sin tareas **no produce ritual**. `hayContenido()`
devuelve `false` y el overlay no se monta. Un saludo solo no es un ritual.

## Topología

```
(app)/layout.tsx
   └── <Suspense fallback={null}><RitualGate/></Suspense>     ← server
          │
          ├─ loadRitualGate()  ──RPC ritual_gate(p_date)──>  política + preferencia + ¿ya visto?
          │        └─ resolverAjustes()   ← la regla dura, pura
          │        └─ debeMostrarseHoy()  ← puro
          │
          ├─ (solo si la puerta dice que sí)
          │  loadRitualContent()  ──> getHomeData · loadTodayBrief · loadRoutinesForToday
          │        └─ construirSecuencia()  ← puro
          │
          └── <RitualHost datos/>  ← cliente; engancha el primer contenido
                 └── <RitualOverlay/>
                       ├─ toggleHabitToday()          (acción que YA existe)
                       ├─ fetch POST /api/ritual/brief (respaldo, fuera de la cola de acciones)
                       └─ start/advance/skip/completeRitual()
```

**Por qué la puerta vive en el layout y no en cada pantalla.** El ritual dispara
en la primera sesión del día, sea cual sea la pantalla que la persona abrió. El
layout de `(app)` es el único ancestro que las envuelve a todas — el mismo
argumento que ya lleva escrito para `CommandPalette` y `NotificationsBell`.

**Por qué no un redirect a `/ritual`.** Rompería los enlaces profundos, ensuciaría
el historial del navegador y obligaría a recordar a dónde iba la persona. El
overlay se cierra y debajo ya está la pantalla que pidió.

**Qué cuesta.** Una consulta más por carga de página. Se resuelve con una RPC que
devuelve política, preferencia y «¿ya hay ejecución hoy?» en un viaje; con la
política apagada es una lectura de una tabla de una fila.

## La regla dura, en una función de doce líneas

> El usuario puede apagar lo que el administrador encendió. **Nunca al revés.**

Vive en `resolverAjustes(policy, pref)`, y es una conjunción monótona:

```
resolver(p, f).enabled   = p.enabled   ∧ f.enabled
resolver(p, f).aiEnabled = p.aiEnabled ∧ f.aiEnabled
resolver(p, f).steps     = p.steps \ f.stepsOff        ⊆ p.steps
```

Que sea una conjunción es lo que la hace **demostrable con una prueba de
propiedad** sobre una matriz de combinaciones, en vez de con una lista de casos
que siempre deja uno fuera.

La forma de la tabla ya impide la mitad prohibida: `ritual_prefs` tiene
`steps_off`, no `steps_on`. No existe columna con la que un usuario pueda
encender un paso que el administrador dejó apagado. Y `/settings` no pinta los
interruptores de los pasos que la política no ofrece: un interruptor que no puede
encender nada es una promesa rota en pantalla.

## Cómo se recuerda que hoy ya se mostró

Tres candidatos, y el argumento completo porque es la clase de decisión que se
revierte por olvido:

| Opción | Por qué no / por qué sí |
|---|---|
| **Cookie** | Cero escrituras, pero no sobrevive a otro navegador: el ritual reaparecería a las 23:00 en el teléfono tras haberlo hecho a las 6:00 en el portátil. Y el servidor no podría responder «¿se terminó?» |
| **Columna en `profiles`** | Barata y sobrevive, pero pierde la distinción entre terminar y omitir, y abre la puerta a que cada feature futura cuelgue su marca diaria de la tabla de perfil |
| **Tabla `ritual_runs`** | **Elegida.** Es la forma que el repo ya conoce (`routine_runs`, 0024/0046): mismo `local_date`, mismo par started/completed. Cae con `on delete cascade` y distingue terminado de omitido. Cuesta un `insert` al día por persona. (No alimenta estadísticas del administrador: es privada por persona, y `is_admin` no abre datos ajenos.) |

Se escribe al **montar**, no al cerrar: «primera sesión del día» es literalmente
lo que se pidió. La consecuencia —abrir la app y cerrar la pestaña consume el
arranque— se mitiga con un botón «Repetir el arranque de hoy» en
`/development/routines`, que abre el overlay a mano y no dispara nada automático.

## El brief que falta: el respaldo que ya existe, sin bloquear

El paso de identidad se alimenta de `identity_briefs`, que se escribe a las 04:00.
Las mañanas en que esa fila no existe —cuenta nueva, agente y respaldo caídos,
reloj que no corrió— el ritual **usa la cadena de respaldo que ya está probada**,
no inventa otra.

Lo que no puede hacer es poner veinte segundos de espera delante de la primera
pantalla del día. Así que:

1. El overlay **monta con lo que se puede construir ya**: saludo, rutina,
   contexto, plan. El saludo ocupa la pantalla entera y se lee en varios
   segundos. **Ese es el presupuesto de latencia**, y es gratis.
2. En paralelo, `ensureTodayBrief()` dispara el camino de siempre —
   `generarManifestacion()` (agente Python → respaldo `generar.ts`) y
   `guardarBrief()`, que sigue contando el tope.
3. Al resolver, el cliente actualiza `brief` dentro de `EntradaSecuencia` y
   **vuelve a llamar a `construirSecuencia()`**. Es pura, así que corre igual en
   el cliente; los pasos de identidad aparecen en su sitio de la secuencia. Esta
   es la razón práctica —no estética— de que el dominio no importe nada del
   servidor.
4. Guarda: la columna **`ritual_runs.brief_attempted`**. Un intento por persona
   y día, pase lo que pase. Si falla, la secuencia sigue sin esos pasos y no se
   reintenta hoy. (El diseño original decía `ai_job_runs`; ver «Lo que cambió al
   implementarlo».)

Si la persona llega al paso de identidad antes de que resuelva, ve su identidad
declarada (`identity_profiles.desired_identity`) y un estado de espera, no un
hueco. Si tampoco hay identidad declarada, el paso no existe.

## El tema: por hora local, no por `prefers-color-scheme`

Blanco con texto negro de día; invertido de noche. La frontera es `[19, 7)` y la
decide **la hora local del perfil**, el mismo reloj que `todayForUser()`.

No `prefers-color-scheme`, y el motivo es concreto: daría un ritual oscuro a
mediodía en un portátil con el sistema en oscuro, que es exactamente lo contrario
de lo que se pidió. Tampoco `data-theme` del `<html>`: el ritual es una sala
aparte, y la app de debajo conserva su tema.

Se implementa redefiniendo **tokens propios con ámbito** en
`.rit-shell[data-ritual-theme]`, que es el precedente exacto de `.gr-shell` del
Execution Graph (`globals.css:3508`). Al cerrar el overlay no parpadea nada.

## Escala de capas

Token nuevo en la escala de `globals.css`, no incrustado en un archivo suelto:

```css
--z-ritual: 80;   /* el arranque del día: manda incluso sobre el menú móvil */
```

Es el único valor por encima de `--z-nav: 70`, y tiene que serlo: si el drawer
móvil quedara por encima, el ritual se pintaría debajo de un menú que la persona
no abrió.

## Lo que NO se crea, y por qué

- **Un `<Dialog>`/`<Modal>` genérico.** El repo no lo tiene y es tentador, pero
  `MenuSurface` resuelve otra cosa (popover anclado, `role="menu"`, sin trampa de
  foco) y generalizar con **un solo** consumidor produce una abstracción que el
  segundo tendrá que romper. `RitualOverlay` es específico; cuando aparezca el
  segundo caso, ahí se extrae.
- **Tabla de pasos, o pasos reordenables desde admin.** Ver arriba: la secuencia
  es una proyección, y el orden narrativo tiene una sola respuesta buena.
- **Segmentación por usuario, rol o segmento.** Una fila global y una preferencia
  por persona. Añadir un motor de reglas para un usuario real sería inventar
  el problema antes que la solución.
- **Que el ritual llame al modelo en su camino normal.** El brief ya está escrito
  desde las 04:00. `ai_enabled` decide qué se **muestra**, no qué se **genera**.
- **Notificación push del arranque.** 0049 ya es dueño de los avisos y el coach ya
  tiene su hora matutina. Un segundo despertador compite con el primero.
- **Cookie de «ya visto».** Dos fuentes de verdad para el mismo hecho.
- **Un segundo calendario de días hábiles.** `frequency` reutiliza los cuatro
  valores de `routines.frequency` y `routineDueToday()`. Un solo sitio en el repo
  decide qué es «entre semana».

## Riesgos aceptados

| Riesgo | Mitigación |
|---|---|
| Una consulta más en cada carga de página | Una RPC contra una tabla de una fila más dos joins por clave primaria. Si algún día duele, se cachea la política, que es global e inmutable entre ediciones |
| Abrir y cerrar la pestaña consume el arranque del día | Es la definición literal de «primera sesión del día». Botón «Repetir el arranque de hoy» |
| El overlay aparece sobre una pantalla abierta con prisa | Siempre omitible con Escape **y** con un botón visible. `blocking` no puede volverlo inevitable: eso es invariante de producto, no ajuste |
| La pestaña abierta cruza la medianoche | La decisión ya se tomó en el servidor y la PK `(user_id, local_date)` impide el doble registro. Se acepta que no se redispare sin recargar |
| Sin brief y sin identidad declarada | Se pierden cuatro de los nueve pasos; si no queda nada, no se muestra. Probado en `ritual-secuencia.test.ts` |
| El respaldo de brief gasta una llamada al modelo en horario de uso | Un intento por persona y día bajo `ai_job_runs`, y nunca bloquea la pantalla |

## Frontera con la watchlist (spec aparte)

La watchlist de Money OS es un subsistema independiente que llegará después.
El único punto de acoplamiento posible es el paso `context`, y queda cerrado por
diseño: `construirSecuencia()` recibe `contexto: HechoRitual[]` **ya construido**
y no sabe de dónde salen los hechos. El único ensamblaje vive en
`src/lib/data/ritual.ts`, que es capa de datos y sí puede importar de ambas.

**Regla que se verifica en revisión:** ningún archivo bajo
`src/lib/domain/ritual/**`, `src/components/ritual/**` ni `src/lib/ritual/**`
importa de `src/lib/market/**` ni de `src/lib/data/watchlist.ts`. Si se borrara
la watchlist entera del repo, el ritual seguiría compilando y pasando los tests.

## Lo que cambió al implementarlo

Cinco correcciones sobre el diseño, todas encontradas por una prueba y no por
una opinión. Se dejan aquí porque cada una es la clase de cosa que alguien
«simplificaría» de vuelta.

1. **La guarda del respaldo vive en `ritual_runs.brief_attempted`, no en
   `ai_job_runs`.** Esa tabla tiene la RLS cerrada y los grants revocados para
   `authenticated`: la escribe solo el reloj con `service_role`. Usarla desde el
   ritual exigía meter la llave de servicio en un camino que arranca en el
   navegador de una persona, para ganar una columna.
2. **El respaldo del brief va por `POST /api/ritual/brief`, no como Server
   Action.** Next ejecuta EN FILA las Server Actions de un mismo cliente. Con el
   agente apuntando a una dirección que no contesta, marcar el hábito quedaba
   encolado detrás de la llamada al modelo. Por `fetch`, la casilla responde en
   menos de un segundo mientras el respaldo sigue esperando.
3. **El overlay vive en un anfitrión cliente (`RitualHost`) que engancha el
   primer contenido.** Marcar un hábito revalida la pantalla; el layout se vuelve
   a pintar, la puerta ve la fila de `ritual_runs` que el propio overlay escribió
   y contesta «ya visto». Sin el anfitrión, el ritual desaparecía en cuanto la
   persona hacía lo que le pedía. «Ya visto» decide montar, no desmontar.
4. **Marcar un hábito no lo saca de la secuencia**, y el brief que llega tarde
   solo se inserta si la persona sigue en el saludo. Las dos cosas desplazaban el
   índice y cambiaban el paso que la persona tenía delante.
5. **La hora del día decide qué rutina toca.** Una rutina anclada a un bloque de
   Autogestión del Tiempo no se propone si su bloque ya terminó ni si empieza a
   más de `HORIZONTE_RUTINA_MIN` (tres horas). Orden: en curso, sin hora, lo que
   viene. Sin esto, a las nueve de la mañana el ritual proponía «Cierre del día»
   de las 20:30.

Y dos de acabado: el saludo usa el nombre de pila («Buenos días, Luis.»), y el
titular vence con especificidad la regla móvil general `h2 { font-size: 1.15rem
!important }` sin tocarla.

## Fases

| # | Fase | Hecho cuando… |
|---|---|---|
| 0 | D-165 y este documento | La regla «nunca al revés» y el argumento cookie/columna/tabla están por escrito |
| 1 | Migración `0068` + pgTAP `0041` | `supabase db test` verde; un no-admin lee la política y no la escribe; nadie nota nada porque nace apagada |
| 2 | Dominio `ritual/**` + cinco tests | `pnpm test:unit` verde; la prueba de propiedad de `resolverAjustes` pasa; los tests fallaban antes |
| 3 | `loadRoutinesForToday()` extraído | `/development/routines` pinta idéntico a antes del cambio |
| 4 | `ritual-focus.ts` + test jsdom | Tab cicla dentro, Shift+Tab también, al cerrar el foco vuelve |
| 5 | `data/ritual.ts` + `ritual/actions.ts` | Con la política encendida a mano por SQL, la puerta devuelve la secuencia correcta |
| 6 | `HabitCheckbox` + overlay + `--z-ritual` | Aparece una vez al día, se omite con Escape, marca un hábito de verdad, se invierte de noche |
| 7 | `/admin/ritual` | Un no-admin recibe 404; la RLS rechaza su `update` aunque llame la acción a mano |
| 8 | `/settings` → `RitualPrefs` | El usuario apaga lo que el admin encendió; no hay forma de hacerlo al revés |
| 9 | `CHECKS.md`, `TRACEABILITY.md`, `DEPLOY.md` | `CHECKS.md` dice qué se probó con un navegador de verdad y qué no |

Las fases 2, 3 y 4 dejan valor aunque se abandone todo lo demás: el dominio
probado, una página más limpia y un módulo de foco reutilizable. La 6 es la
primera que se ve, y la 1 garantiza que hasta entonces nadie note nada.
