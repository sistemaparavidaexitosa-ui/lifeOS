# Centro lienzo — diseño (sin parpadeo, con voz, con contexto y con barra)

**Fecha:** 2026-09-20 · **Estado:** diseño aprobado, pendiente de plan. Continúa D-165, D-166 y D-167.

**Decisión:** D-168. La watchlist de Money OS pasa a D-169 y migración 0072.

## Contexto

El centro agéntico (D-167) salió a producción y el usuario lo usó. Su lectura,
literal, fue:

1. «tiene delay para aparecer "centro" al abrir la aplicación, primero se ve la
   navegación normal»;
2. «no logro identificar la barra de conversación para dar indicaciones»;
3. «me salieron tres sugerencias pero no hay texto que me diga cómo voy como el
   coach del chat»;
4. «sigo sin sentir el menú dinámico que se construye con base al contexto,
   aprendizaje, actividad previa».

Lo primero es un **fallo**. Lo segundo es una pieza **que nunca se construyó**
—el subsistema B, aplazado de común acuerdo—. Lo tercero y lo cuarto son
**huecos de diseño**: el centro enseña cifras pero no cuenta nada, y su menú es
siempre el mismo, ordenado como la barra lateral.

## Decisiones del usuario (2026-09-20)

1. **Menú dinámico = una fila «Sigue por aquí» arriba**, de tres a cinco
   destinos, con la lista completa agrupada debajo, intacta. No reordenar la
   lista entera ni recortarla: se gana contexto sin perder la memoria muscular
   de dónde está cada cosa.
2. **La narrativa sale de la misma llamada** que ya hace las sugerencias, como un
   campo más. Coste cero extra.
3. **La barra de captura entra en esta ronda.**
4. **La barra propone; la persona acepta.** No escribe sola.

## 1. El parpadeo

**Causa, verificada en el código:** la decisión de abrir el centro vive en un
`useEffect` de `RitualHost`, porque «¿es el principio de una visita?» se resuelve
con `sessionStorage`, que solo existe en el navegador. El servidor manda la
pantalla normal, React hidrata, el efecto corre y el centro aparece encima. Los
dos estados se ven, en ese orden.

**Arreglo:** la señal pasa a una **cookie de sesión** (`lifeos_visita`, sin
`Max-Age`: muere al cerrar el navegador, que es justo lo que significa «visita»),
puesta por el **middleware**, que ya gestiona cookies y cabeceras para la sesión
y la CSP. El middleware añade además la cabecera `x-visita-nueva` a la petición,
y `RitualGate` —Server Component— la lee con `headers()` y decide **antes de
pintar**. El centro viaja en el primer HTML o no viaja: no hay dos estados.

Efecto secundario bueno: deja de depender de `sessionStorage`, así que funciona
también en ventanas privadas estrictas, donde ese API puede lanzar.

`debeAbrirseElCentro` no cambia: sigue siendo la misma función pura con las
mismas tres condiciones. Lo que cambia es de dónde sale `inicioDeVisita`.

## 2. «Cómo voy»

Dos o tres frases debajo del saludo, en el tono del coach: qué se movió, qué
lleva parado, dónde está la atención.

- **De dónde sale:** de la llamada que ya se hace por franja. Un campo
  `resumen` más en el esquema que el modelo devuelve. **Ni una llamada extra.**
- **Dónde se guarda:** columna `centro_runs.resumen`. El resto de aperturas de
  la franja lo leen de ahí, gratis.
- **Límites:** máximo 280 caracteres y se sanea como todo lo demás. Sigue
  valiendo «el modelo no calcula»: las cifras que cite tienen que estar en los
  hechos, y el prompt se lo dice con las mismas palabras que ya usa.
- **Sin resumen no hay bloque.** Un hueco vacío bajo el saludo se lee como un
  error de carga.

## 3. «Sigue por aquí»

De tres a cinco destinos grandes, encima de la lista completa, cada uno con su
motivo en gris.

**Sin IA, y es deliberado.** Se calculan con reglas puras sobre datos que el
centro ya tiene: el proyecto con más movimiento reciente, Dinero cuando la
quincena está por cerrar o el presupuesto en rojo, Rutinas si quedan hábitos
pendientes, Proyectos y Tareas si hay vencidas. Tres razones:

1. **Es instantáneo.** Llega con el primer HTML, no con la respuesta del modelo.
2. **Es exacto.** «Llevas tres días en Rediseño» es un hecho, no una opinión.
3. **Funciona sin llave de IA y sin hechos suficientes**, que es justo cuando el
   centro más se nota vacío.

La función es pura —`destacadosDelCentro(señales)`— y devuelve como mucho cinco,
ordenados por peso, sin repetir un destino que ya esté en «Lo siguiente». Si no
hay señales, no hay fila: la lista completa sigue ahí.

## 4. La barra de captura

Al pie del centro, una línea de escritura: «Escribe una idea, una tarea, lo que
sea».

**El recorrido:**

1. La persona escribe. `POST /api/centro/capturar` (ruta, no Server Action: es
   una llamada al modelo y no puede quedarse en la cola de acciones).
2. Una llamada a `generateJson` decide entre tres salidas:
   - **`nota`** — va a un cuaderno. Devuelve `notebookId`, `titulo` y `cuerpo`.
   - **`tarea`** — va a un proyecto. Devuelve `projectId` y `titulo`.
   - **`pregunta`** — no está claro. Devuelve la pregunta y hasta tres opciones,
     cada una con la forma de una de las dos anteriores.
3. Lo que sale se **sanea igual que todo**: el cuaderno y el proyecto tienen que
   existir y ser de la persona; si no, la salida se degrada a `pregunta`.
4. El resultado se guarda como **propuesta** (`origen = 'centro'`, tipo `nota` o
   `tarea`) y se pinta con sus botones. **Aceptar de un toque es lo que crea.**
5. Aceptar una `nota` llama a `createNote(notebookId)` y luego a
   `saveNote(id, titulo, cuerpo, 0)`, las acciones que ya existen. Aceptar una
   `tarea` sigue llamando a `quickAddTask`, como hoy.

**Lo que NO hace:** no escribe sin el toque, no crea cuadernos ni proyectos
nuevos —solo coloca en los que ya tienes—, y no conversa: es una captura, no un
chat. El chat transversal sigue donde está.

**Sin llave de IA:** la barra lo dice y ofrece guardar el texto tal cual como
nota en el primer cuaderno, que es lo que la persona quería hacer de todos
modos.

## Esquema (migración 0071)

- `coach_proposals.tipo` admite **`nota`**. `payload = { notebookId, cuerpo }`;
  el título es el de la propuesta.
- `centro_runs` gana **`resumen text not null default ''`**.

## Invariantes que NO se tocan

1. **D-153:** la IA no escribe en las tablas de nadie; aceptar sí.
2. **D-151:** una sola cola de propuestas.
3. **`ai_domains`** sigue siendo la puerta. Sin IA, el centro y la barra siguen
   siendo utilizables.
4. **NO-MOCK:** sin señales no hay fila de destacados; sin resumen no hay bloque.
5. **El coste no crece por carga de página.** La narrativa viaja en la llamada
   que ya existía; los destacados no llaman a nadie; la barra solo llama cuando
   la persona escribe.

## Unidades

| Unidad | Qué hace |
|---|---|
| `src/middleware.ts` | Pone la cookie de visita y la cabecera `x-visita-nueva` |
| `src/lib/domain/centro/destacados.ts` (puro) | `destacadosDelCentro(señales)` |
| `src/lib/domain/centro/captura.ts` (puro) | `sanearCaptura(cruda, ctx)`: degrada a `pregunta` lo que no existe |
| Migración `0071` + pgTAP `0044` | tipo `nota`, `centro_runs.resumen` |
| `src/lib/centro/generar.ts` | Un campo `resumen` más en el esquema y en la validación |
| `src/lib/centro/capturar.ts` | La llamada al modelo de la barra |
| `POST /api/centro/capturar` | Su ruta |
| `src/components/ritual/BarraCaptura.tsx` | La barra y sus respuestas |
| `src/components/ritual/CentroPremium.tsx` | Narrativa, destacados y barra |
| `src/lib/coach/actions.ts` | `case "nota"` en `ejecutar()` |

## Pruebas

- **Dominio (TDD):** `destacadosDelCentro` respeta el tope, ordena por peso, no
  repite lo que ya está en «Lo siguiente» y sin señales devuelve vacío;
  `sanearCaptura` degrada a `pregunta` un cuaderno o un proyecto que no existe,
  y rechaza una salida sin título.
- **pgTAP:** el tipo `nota` se admite; `centro_runs.resumen` existe; lo demás
  sigue rechazándose.
- **Navegador:** el centro aparece **en el primer HTML** (se comprueba que el
  diálogo ya está antes de que la página termine de hidratar); la narrativa y
  los destacados se pintan; escribir en la barra produce una propuesta y
  aceptarla crea la nota de verdad; una entrada ambigua devuelve pregunta con
  botones.

## Riesgos aceptados

| Riesgo | Mitigación |
|---|---|
| La cookie de visita se comparte entre pestañas del mismo navegador | Es lo que significa «visita»: abrir la app, no abrir una pestaña. Quien quiera verlo otra vez tiene el botón «Centro» |
| El resumen puede sonar genérico | Es el mismo riesgo que ya tiene el coach. Si molesta, se apaga quitando el dominio en Configuración |
| Los destacados por reglas pueden no coincidir con lo que la persona quería | Son una fila corta, y la lista completa está justo debajo sin cambios |
| La barra puede clasificar mal | Por eso propone en vez de escribir. Y ante la duda pregunta |
