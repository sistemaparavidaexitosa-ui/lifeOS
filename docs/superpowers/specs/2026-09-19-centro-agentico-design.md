# Centro agéntico — diseño (la IA propone; tú decides de un toque)

**Fecha:** 2026-09-19 · **Estado:** diseño aprobado, pendiente de plan. Continúa D-165 y D-166.

## Contexto

El centro (D-166) ya es la puerta de LifeOS, pero lo que muestra es **estático**:
el hábito que toca, las cifras del día, la Única Cosa y los destinos. El usuario
quiere que además **piense**: que al terminar la rutina le diga en qué proyecto
ha estado trabajando y le proponga seguir o cambiar; que a media tarde le sugiera
abrir finanzas o poner algo en su día.

Media pieza ya existe y no se va a duplicar:

- **`coach_proposals`** (0053): cola de propuestas con `tipo`, `titulo`,
  `detalle`, `payload`, y estados `pending | accepted | dismissed`.
- **`sanearPropuesta`** (`src/lib/domain/coach/proposals.ts`): saneado puro que no
  se fía del prompt.
- **`acceptProposal` / `dismissProposal`** (`src/lib/coach/actions.ts`): aceptar
  llama a la **Server Action real** que crea esa cosa; no escribe a mano.
- **`activityFacts`** con **`busyProjectFacts`** dentro
  (`src/lib/domain/insights/facts/activity.ts`): «qué proyecto concentra el
  movimiento» ya está calculado, y **sin nombrar a nadie** (privacidad del README).
- **`debeAnalizar(nHechos, huella, huellaAnterior)`**: la guarda que evita llamar
  al modelo cuando los hechos no han cambiado.
- **`buildContext` + `ai_domains`**: la puerta de privacidad de siempre.

**Alcance.** Esto es el subsistema **A** de dos. La **barra de captura** —escribir
una idea y que la IA la coloque en un notebook o en un proyecto— es el subsistema
**B**, va después y necesita un tipo de propuesta `nota` que hoy no existe.

## Decisiones del usuario (2026-09-19)

1. **Primero el centro que propone; la barra de captura, después.**
2. **La IA propone y la persona acepta de un toque.** Nada se escribe en sus
   datos sin ese toque. Se mantiene D-153.
3. **Piensa una vez por franja del día, y solo si algo cambió.** Tope de tres
   llamadas al modelo por día y persona.
4. **Una sola cola** (`coach_proposals`) con un tipo nuevo **`foco`** que no
   escribe nada: lleva a una pantalla.

## Invariantes que NO se tocan

1. **D-153: lo que la IA crea entra por una sola puerta.** Aceptar una propuesta
   que crea algo pasa por `acceptProposal`, que llama a la acción real.
2. **D-151: una sola cola de propuestas.** No se crea una segunda.
3. **El modelo no calcula.** Toda cifra sale de los hechos del dominio; el
   modelo redacta. Lo que cite y no exista, se descarta al sanear.
4. **`ai_domains` es la puerta.** Lo apagado no viaja. Con la IA apagada, el
   centro se queda exactamente como está hoy.
5. **NO-MOCK.** Sin actividad reciente no hay propuesta. Preferimos ninguna a
   una inventada.
6. **El centro sigue siendo navegación.** Las sugerencias van encima de los
   destinos y nunca los desplazan fuera de la pantalla.

## Cuándo piensa

| Pieza | Decisión |
|---|---|
| Franjas | `franjaDeHoy(hourLocal)`: `manana` si `h < 12`, `tarde` si `12 ≤ h < 19`, `noche` si `h ≥ 19`. Sin huecos ni solapes, y el 19 es el mismo corte que ya usa el tema nocturno del ritual (`INICIO_NOCHE`). Función pura |
| Disparo | La primera apertura del centro en cada franja, desde `GET /api/centro` |
| Guarda | Tabla nueva **`centro_runs`**, PK `(user_id, local_date, franja)`, con `facts_hash` y `outcome` |
| Ahorro | Si la huella de hechos coincide con la de la franja anterior, **no se llama al modelo**: se reutilizan las propuestas vivas |
| Tope | Tres franjas = tres llamadas al día como mucho |

**Por qué `centro_runs` y no `ai_job_runs`.** `ai_job_runs` (0066) tiene la RLS
cerrada y los grants revocados para `authenticated`: la escribe solo el reloj con
`service_role`. Esto se dispara desde el navegador de una persona, con su sesión.
Es el mismo obstáculo que ya resolvió D-165 con `ritual_runs.brief_attempted`, y
se resuelve igual: una tabla con dueño y su RLS.

**Por qué en la apertura y no en el reloj nocturno.** «Abro la app a media tarde
y me sugiere algo» exige que la sugerencia se piense **en esa franja**. El reloj
corre a horas fijas y no sabe cuándo abres la app.

## Qué propone

Como mucho **tres** propuestas, en un bloque **«Lo siguiente»** encima de los
destinos. Cada una: una frase corta y un motivo en gris con su cifra real.

- **`foco`** (tipo nuevo, **no escribe nada**): «Sigue con Rediseño de la tienda»
  · *12 movimientos esta semana*. «Abre Dinero» · *quedan 4 días de quincena*.
  `payload = { href, motivo }`.
- **Las que ya existen** (`tarea`, `bloque`, `rutina`, `meta`, `estructura`):
  «Pon *Llamar al proveedor* en tu día». Se aceptan por el camino de siempre.

**El destino de un `foco` se valida en el servidor** contra `NAV_ITEMS` y contra
los proyectos reales de la persona. Un `href` inventado no se guarda. Esto es una
función pura, `destinoValido(href, proyectos)`, con sus pruebas: es la diferencia
entre una sugerencia y un enlace roto que el modelo se imaginó.

## Aceptar, descartar y caducar

| Gesto | Qué pasa |
|---|---|
| Aceptar un `foco` | El centro se cierra y navega. Queda `accepted`; no se vuelve a proponer |
| Aceptar una que crea | `acceptProposal`, que ya existe y llama a la Server Action real |
| Descartar | `dismissProposal`. **No vuelve.** Una IA que repite lo rechazado deja de leerse |
| No hacer nada | Sigue viva hasta el final del día local |

## Unidades

| Unidad | Qué hace |
|---|---|
| `src/lib/domain/centro/franja.ts` (puro) | `franjaDeHoy(hourLocal)`, `FRANJAS` |
| `src/lib/domain/centro/sugerencias.ts` (puro) | `destinoValido(href, proyectos)`, `sanearSugerencias(crudas, ctx)` sobre `sanearPropuesta`, tope de 3, sin duplicar lo ya propuesto hoy |
| Migración `0070` + pgTAP `0043` | `coach_proposals.tipo` admite `foco`; tabla `centro_runs` con RLS de dueño |
| `src/lib/centro/generar.ts` | Prompt y llamada única a `generateJson` con `CENTRO_BUDGET`; nunca lanza |
| `src/lib/centro/sugerencias.ts` | Orquesta: franja → guarda → hechos → huella → generar o reutilizar → guardar |
| `GET /api/centro` (modificado) | Devuelve además `sugerencias` |
| `src/components/ritual/Sugerencias.tsx` | El bloque «Lo siguiente» con aceptar y descartar |

## Pruebas

- **Dominio (TDD):** las fronteras de las tres franjas; `destinoValido` rechaza
  rutas inventadas, rutas ocultas del menú y proyectos ajenos; `sanearSugerencias`
  corta a tres, tira las que citan cifras que no están en los hechos y no repite
  una ya propuesta hoy.
- **pgTAP:** `foco` se acepta como tipo y un tipo inventado no; `centro_runs`
  aislada por persona; la PK impide dos generaciones en la misma franja.
- **Navegador:** con propuestas sembradas a mano en la base, el bloque aparece,
  aceptar un `foco` navega y lo marca `accepted`, descartar lo quita y no vuelve
  al recargar, y con `ai_domains` sin `execution` el bloque no aparece.

## Lo que NO se construye, y por qué

- **Que la IA escriba sola.** Decisión del usuario y D-153.
- **Una segunda cola de propuestas.** D-151.
- **Notificaciones push del centro.** 0049 ya es dueño de los avisos.
- **La barra de captura.** Es el subsistema B, con su propio spec.
- **Aprendizaje de qué sugerencias funcionan.** Hace falta historial antes de
  poder medir nada; hoy sería inventar una correlación sobre cuatro datos.

## Riesgos aceptados

| Riesgo | Mitigación |
|---|---|
| Con poca actividad, las propuestas son pobres o no hay | Preferimos ninguna a una inventada. El centro sin bloque sigue completo |
| Tres llamadas al día por persona cuestan dinero | Huella de hechos: si nada cambió, cero llamadas. El presupuesto es el más pequeño del repo |
| El modelo propone algo que no existe | Saneado en el servidor y validación del destino, ambos puros y probados |
| Abrir el centro en una franja nueva tarda unos segundos | Las sugerencias llegan **después** del resto: el centro pinta y navega sin esperarlas |

## Fases

| # | Fase | Hecho cuando… |
|---|---|---|
| 0 | D-167 y este documento | El reparto A/B y los tres límites están por escrito |
| 1 | Migración `0070` + pgTAP `0043` | `supabase test db` verde; `foco` admitido, `centro_runs` aislada |
| 2 | Dominio `franja.ts` y `sugerencias.ts` con TDD | `pnpm test:unit` verde; los tests fallaban antes |
| 3 | `centro/generar.ts` + orquestación + `/api/centro` | Con la IA apagada no pasa nada; con hechos, se guardan propuestas |
| 4 | `Sugerencias.tsx` en el centro | Aceptar navega o crea; descartar no vuelve |
| 5 | Navegador, `CHECKS.md`, `TRACEABILITY.md`, `DEPLOY.md` | `CHECKS.md` dice qué se probó con el modelo real y qué no |

La watchlist pasa a **D-168 y migración 0071**.
