# Navegación premium — diseño (el centro como puerta de la aplicación)

**Fecha:** 2026-09-19 · **Estado:** diseño aprobado, pendiente de plan. Continúa D-165.

## Contexto

El arranque guiado (D-165, PR #52) está en producción: una secuencia editorial,
blanca y en negro bold, que conduce la primera sesión del día. Tras verlo
funcionar, el usuario quiere que esa experiencia **deje de ser solo un momento
de la mañana y pase a ser la forma normal de moverse por LifeOS**: una
navegación premium de la que siempre se puede salir hacia la navegación
habitual, y a la que se puede volver desde Home.

Decisiones del usuario (2026-09-19), en el orden en que se tomaron:

1. **Un centro premium que abre las pantallas de siempre.** No se rediseña
   ningún módulo: el centro es la puerta, y al elegir un destino se abre la
   pantalla habitual de ese módulo.
2. **El centro aparece al empezar una visita, y con un botón fijo para volver.**
   No en cada navegación.
3. **La secuencia de la mañana vive dentro del centro**, la primera vez del día,
   y al terminar deja en el centro.
4. **El modo lo decide solo cada persona.** Sin ajustes de administración para
   el modo. La política de D-165 sigue gobernando la secuencia de la mañana.
5. **Enfoque A: capa sobre el shell actual**, no una ruta propia ni un
   reemplazo de `/home`.

## Invariantes que NO se tocan

1. **Ninguna ruta cambia y ningún módulo se rediseña.** La barra lateral, el
   Topbar y cada pantalla siguen idénticos en los dos modos. El centro es una
   capa encima.
2. **Siempre se puede salir.** Escape y «Ahora no» cierran el centro esta vez;
   «Navegación habitual» lo apaga hasta que la persona lo reactive.
3. **NO-MOCK.** Cada bloque del centro existe solo si tiene datos.
4. **Todo lo de D-165 sigue vigente**: `guardarBrief()` único escritor, el
   respaldo fuera de la cola de Server Actions, `RitualHost` enganchando el
   contenido, la hora decidiendo la rutina, el tema por hora local.
5. **Una sola lista de destinos**: el centro lee `NAV_ITEMS`, la misma de la
   barra lateral. Dos listas se desincronizan a la primera pantalla nueva.

## El modo

| Pieza | Decisión | Por qué |
|---|---|---|
| Dónde vive | Columna `ritual_prefs.nav_mode text not null default 'premium' check (nav_mode in ('premium','habitual'))`, migración **0069** | Es una preferencia de la persona que tiene que seguirla entre dispositivos. `ritual_prefs` ya es su fila de preferencias del ritual, con su RLS de dueño. Una cookie no sobreviviría al teléfono |
| Sin fila | `premium` | El usuario pidió que sea «el nuevo sistema de navegación». Salir cuesta un clic y se recuerda |
| Administración | Ninguna para el modo | Decisión del usuario. La política de D-165 sigue mandando sobre la secuencia de la mañana, no sobre el modo |

La watchlist, que tenía reservados D-166 y la migración 0069, pasa a **D-167 y 0070**.

## Cuándo aparece el centro

Una **visita** es una apertura nueva de la aplicación en una pestaña, o de la
PWA en el teléfono. No es cada navegación. Se detecta en el navegador con
`sessionStorage`, que dura lo que dura la pestaña.

El centro se abre **solo** si se cumplen las tres cosas:

1. el modo es `premium`;
2. es el principio de una visita (no hay marca en `sessionStorage`);
3. la visita empezó en `/home`. La raíz `/` redirige siempre a `/home`, así que
   abrir la app a secas cuenta.

Un enlace directo —una notificación que abre una tarea, un marcador— lleva a su
pantalla sin taparla. El botón «Centro» está ahí para quien lo quiera.

La decisión es una función pura, `debeAbrirseElCentro(...)`, con sus pruebas.

## Qué muestra el centro

La misma estética que la secuencia (tokens `.rit-*`, tema por hora local), en
una sola pantalla que se desplaza en el móvil, de arriba abajo:

1. **Saludo corto** y la fecha: «Buenas tardes, Luis.»
2. **Ahora**: el siguiente hábito pendiente según la hora (la misma regla de
   bloques y horizonte de D-165), con `HabitCheckbox`. Si no hay, no sale.
3. **Tu día**: `hechosDeContexto()` en compacto.
4. **Lo que mueve el día**: la Única Cosa, si existe.
5. **A dónde vas**: los destinos de `NAV_ITEMS` no ocultos, agrupados como en la
   barra lateral. **El grupo va en tipografía grande y sus destinos en tamaño
   medio**: son 23 destinos en cinco grupos, y 23 titulares enormes serían una
   pared, no un menú. «Home» no se lista (es el centro) y «Configuración» baja
   al pie.
6. **Pie**: «Repetir el ritual de hoy» (solo si la política lo permite),
   «Configuración» y **«Navegación habitual»**.

La composición es otra función pura, `componerCentro(...)`, que decide qué
bloques existen. El renderizado no decide nada.

## Entrar, salir y reactivar

| Gesto | Qué pasa | ¿Persiste? |
|---|---|---|
| Visita nueva en Home, modo premium, **toca el ritual** | Arranca la secuencia de D-165. Su último paso ya no pinta enlaces: **abre el centro** | — |
| Visita nueva en Home, modo premium, no toca el ritual | Se abre el centro | — |
| Elegir un destino | El centro se cierra y se navega a la ruta de siempre | — |
| Botón **«Centro»** (abajo a la derecha, negro, pequeño; solo en premium) | Reabre el centro y pide su contenido en ese momento | — |
| Escape o «Ahora no» | Cierra el centro esta vez | No |
| **«Navegación habitual»** | Cierra el centro y quita el botón. La app queda como antes | **Sí**, `nav_mode = 'habitual'` |
| Home en modo habitual | Tarjeta sobria arriba: **«Activar navegación premium»**. Al pulsarla, `nav_mode = 'premium'` y se abre el centro | **Sí** |

**El modo habitual conserva la secuencia de la mañana.** La sigue gobernando la
política de D-165 y la preferencia de «Arranque del día» en Configuración.
«Habitual» quita el centro y el botón, no el ritual; en ese modo el último paso
de la secuencia vuelve a ser el cierre con enlaces de D-165.

## El coste, que es la decisión técnica central

Con premium por defecto, cada carga de página de cada persona pasa por el
layout. Si el layout leyera el contenido del centro —rutinas, `getHomeData`,
brief, identidad—, **toda la aplicación pagaría media aplicación en cada
clic**.

Así que se separa en dos:

- **La puerta del layout sigue siendo barata**: la RPC `ritual_gate` gana
  `nav_mode` como una columna más del mismo viaje. Con eso el anfitrión sabe si
  pintar el botón y si abrir el centro al empezar la visita.
- **El contenido del centro se pide solo al abrirlo**, con `GET /api/centro`: un
  Route Handler con sesión que reutiliza `loadRitualContent()`. Por `fetch` y no
  como Server Action por la misma razón que el respaldo del brief en D-165:
  Next ejecuta en fila las Server Actions de un cliente.

La secuencia de la mañana, cuando toca, sigue llegando como hoy desde el
servidor: ese camino ya se paga solo la primera vez del día.

## Unidades

| Unidad | Qué hace | Depende de |
|---|---|---|
| `src/lib/domain/centro/*.ts` (puro) | `debeAbrirseElCentro`, `componerCentro`, `destinosDelCentro` (agrupa `NAV_ITEMS`) | tipos del ritual, nada de servidor |
| Migración `0069` + pgTAP `0042` | `nav_mode`, `ritual_gate` con la columna nueva | 0068 |
| `GET /api/centro` | Contenido del centro, con sesión | `loadRitualContent` |
| `setNavMode(modo)` | Server Action: guarda el modo | `ritual_prefs` |
| `CentroPremium.tsx` | Pinta el centro a partir de `componerCentro` | `HabitCheckbox`, `RitualStep` para piezas comunes |
| `BotonCentro.tsx` | El botón flotante | `--z-ritual` |
| `ActivarPremium.tsx` | La tarjeta de Home | `setNavMode` |
| `RitualHost` | Orquesta: ritual → centro, botón, visita | todo lo anterior |

## Pruebas

- **Dominio** (TDD, rojo antes que verde): las tres condiciones de apertura y
  sus combinaciones; `componerCentro` sin datos inventados; `destinosDelCentro`
  agrupa como la barra lateral, excluye ocultos y Home, y una entrada nueva de
  `NAV_ITEMS` aparece sola.
- **pgTAP**: `nav_mode` fuera del vocabulario se rechaza; la persona solo ve y
  escribe el suyo; `ritual_gate` lo devuelve con `premium` sin fila.
- **Navegador** (la prueba de D-165, ampliada): visita nueva en Home abre el
  centro; un enlace directo no; elegir destino navega y deja el botón; «Centro»
  lo reabre; «Navegación habitual» lo quita y **persiste tras recargar**; la
  tarjeta de Home lo reactiva; la secuencia de la mañana termina en el centro;
  400 px sin desborde; cero errores de consola.

## Lo que NO se construye, y por qué

- **Rediseño de los módulos.** Decisión del usuario: el centro abre las
  pantallas de siempre.
- **Ajustes de administración del modo.** Decisión del usuario.
- **Centro en cada navegación.** Descartado por el usuario: interrumpe lo que
  se está haciendo.
- **Ruta `/centro`.** Tocaría el middleware y el historial; «atrás» devolvería
  al centro.
- **Ocultar la barra lateral en modo premium.** El centro es la puerta, no un
  reemplazo; quien está dentro de un módulo sigue necesitando moverse entre
  pantallas vecinas.

## Riesgos aceptados

| Riesgo | Mitigación |
|---|---|
| Premium por defecto cambia la primera pantalla de todo el mundo al desplegar | Un clic en «Navegación habitual» y se recuerda. Hoy hay un usuario real |
| Abrir el centro cuesta una petición | Solo al abrirlo, nunca en la navegación normal |
| `sessionStorage` puede no estar disponible (modo privado estricto) | Se trata como «sin marca» dentro de un `try`: en el peor caso el centro se abre al empezar cada carga en Home, que sigue siendo omitible |
| 23 destinos es mucho para una pantalla editorial | Jerarquía grupo grande / destino medio; la lista crece con `NAV_ITEMS`, no a mano |

## Fases

| # | Fase | Hecho cuando… |
|---|---|---|
| 0 | D-166 y este documento | El modo, la regla de apertura y el coste están por escrito |
| 1 | Migración 0069 + pgTAP 0042 | `supabase test db` verde; `ritual_gate` devuelve `nav_mode` |
| 2 | Dominio `centro/**` con TDD | `pnpm test:unit` verde; los tests fallaban antes |
| 3 | `GET /api/centro` + `setNavMode` | Con sesión devuelve el contenido; sin ella, 401 |
| 4 | `CentroPremium`, `BotonCentro`, `ActivarPremium`, `RitualHost` | El recorrido completo funciona en `pnpm start` |
| 5 | Prueba de navegador ampliada + `CHECKS.md`, `TRACEABILITY.md`, `DEPLOY.md` | `CHECKS.md` dice qué se probó de verdad y qué no |
