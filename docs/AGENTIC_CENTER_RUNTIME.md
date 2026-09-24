# El Centro como runtime — arquitectura

**Fecha:** 2026-09-24 · **Estado:** Fase 1 construida en `feat/centro-runtime`, detrás de
`AGENTIC_CENTER_RUNTIME` (apagada). Decisiones **D-188 a D-192**. Spec en
`docs/superpowers/specs/2026-09-24-centro-runtime-design.md`; plan en
`docs/superpowers/plans/2026-09-24-centro-runtime.md`.

---

## 1. Qué es

Hasta D-187 el Centro tenía una sola pantalla: el lienzo de `tarjetasDelCentro`.
El runtime lo convierte en algo que **genera** pantallas:

- un **generador** decide QUÉ se enseña, como `ScreenPlan`: secciones y orden,
  **sin un solo dato**;
- el **servidor** llena cada sección, aplica el layout y **valida** el resultado;
- un **renderer genérico** lo pinta pidiendo a un **registro** el componente de
  cada `kind`.

Nunca se genera HTML, ni React, ni JSX. Una pantalla es JSON declarativo:

```json
{
  "id": "hoy", "intent": "hoy", "title": "Centro",
  "layout": { "densidad": "aireada" },
  "sections": [
    { "id": "hero", "kind": "hero", "data": { "saludo": "Buenos días", "nombre": "Luis", "fechaISO": "2026-09-24", "frase": null } },
    { "id": "foco", "kind": "tasks", "title": "Tu foco de hoy", "data": { "fechaISO": "2026-09-24", "items": [ … ] } }
  ],
  "actions": [], "refreshPolicy": { "tipo": "porFranja" },
  "permissions": { "lectura": true, "escritura": false }
}
```

## 2. El flujo

```
Intento ─► interpretarIntencion ─► ScreenGenerator ─► ScreenPlan (QUÉ, sin datos)
                                                          │
                          hidratadores (grafo primero, proveedor después)
                                                          │
                                  aplicarLayout ─► validarScreen ─► Screen JSON
                                                                        │ /api/centro
                                                                        ▼
                                    RuntimeScreen ─► registro ─► componentes puros
```

| Paso | Archivo |
|---|---|
| Intento | `src/lib/domain/centro/runtime/intencion.ts` |
| Plan | `generador.ts` (`generadorDeterminista`), forma en `plan.ts` |
| Hidratar | `ensamblar.ts` (límite por sección), `hoy.ts` (los de «Hoy») |
| Grafo | puerto `LectorDelGrafo` en `hoy.ts`; adaptador en `src/lib/centro/runtime/grafo.ts` |
| Layout | `layout.ts` |
| Validar | `validador.ts` + `acciones.ts` |
| Orquestar | `src/lib/centro/runtime/pantalla.ts` (`armarPantalla`) |
| Responder | `respuesta.ts` + `src/app/api/centro/route.ts` |
| Pintar | `src/components/centro-runtime/RuntimeScreen.tsx` + `registro.ts` + `secciones/*` |

## 3. Responsabilidades

**El agente decide QUÉ, el renderer decide CÓMO, React decide LO VISUAL.** Y cada
reparto lo sostiene un tipo, no una convención:

| Quién | Decide | Y no puede |
|---|---|---|
| Generador | qué secciones, en qué orden, para qué intento | poner datos: `ScreenPlan` no tiene dónde |
| Hidratador | qué datos lleva cada sección | elegir secciones |
| Layout | la densidad | reordenar: la prueba «El layout no reordena» |
| Validador | si la pantalla es legal | arreglarla: rechaza con motivo |
| Renderer | qué componente pinta cada `kind` | importar un componente concreto |
| Componente | lo visual | pedir datos |

## 4. Mapa de archivos

```
src/lib/domain/centro/runtime/     PURO: sin I/O, sin React, imports .ts relativos
  secciones.ts    catálogo de 24 kinds y el tipo de datos de cada uno
  types.ts        Screen, Section, AnySection, Action, Intent, RefreshPolicy
  plan.ts         ScreenPlan y HuecoDelPlan
  flags.ts        resolverFlags: los cuatro interruptores
  intencion.ts    frase → intento, por palabras
  generador.ts    interface ScreenGenerator + generadorDeterminista
  layout.ts       aplicarLayout
  acciones.ts     sanearAccion sobre destinoValido
  validador.ts    validarScreen (zod: es frontera)
  aprendizaje.ts  ScreenEvent, EventSink, sinkNulo, eventosDeCierre
  ensamblar.ts    ensamblarPantalla: hidratadores en paralelo con límite
  hoy.ts          LectorDelGrafo, FuentesDeHoy, hidratadoresDeHoy
  respuesta.ts    respuestaDelCentro
src/lib/centro/runtime/            SERVIDOR
  grafo.ts        lectorDelGrafo sobre src/lib/data/graph.ts
  pantalla.ts     armarPantalla
src/components/centro-runtime/     CLIENTE
  registro.ts     crearRegistroDeSecciones, registrarSeccion
  secciones/      Hero, Narrativa, Tareas, Atajos, Mensajes (vacía y error)
  index.ts        el único que importa las secciones
  RuntimeScreen.tsx
```

## 5. Cómo encaja con el Centro de hoy

**Nada se sustituye.** `CentroPremium` conserva su armazón: abrir, cerrar,
«Cerrar», la trampa de foco, `inert` sobre la app, `BarraCaptura` y el pie. El
runtime entra por **un único punto de corte**:

```tsx
{screen ? <RuntimeScreen screen={screen} onNavegar={onIrA} /> : <Navegacion … />}
```

- Con el flag apagado, `/api/centro` responde **campo por campo** lo de antes; lo
  fija la prueba «FLAG APAGADO = HOY» (`tests/domain/centro-runtime-respuesta.test.ts`).
- Con el flag encendido y una pantalla que falla, `screen: null` y se pinta el
  lienzo. **El camino viejo es el respaldo por diseño.**
- `tarjetasDelCentro`, `Navegacion` y la prueba «NO REORDENA» no se tocaron.
- La pantalla «Hoy» no añade consultas salvo las del grafo: todo lo demás sale de
  `loadRitualContent` y `sugerenciasDelCentro`, que la ruta ya pedía.

## 6. Flags

| Variable | Qué enciende | Fase 1 | Dónde se enchufa |
|---|---|---|---|
| `AGENTIC_CENTER_RUNTIME` | `/api/centro` arma la pantalla; el Centro pinta el runtime | **real** | `route.ts`, `CentroPremium` |
| `AGENTIC_GENERATED_SCREENS` | lo escrito en la barra pide pantalla | no-op | `route.ts`, donde hoy el intento es siempre «hoy» |
| `AGENTIC_LAYOUT_ENGINE` | el layout deja el orden fijo | no-op | `aplicarLayout` |
| `AGENTIC_DYNAMIC_NAVIGATION` | las acciones reordenan la navegación | no-op | pendiente: la navegación aprendida (D-183) |

- Solo `"1"` enciende (tras `trim()`); `"true"` no.
- Los tres secundarios **no cuentan** si `AGENTIC_CENTER_RUNTIME` está apagado.
  La regla vive en `resolverFlags` y el resto del código recibe el objeto resuelto.
- El cliente nunca lee variables: los flags viajan en la respuesta.
- Encender = `"1"` y redesplegar. Apagar = borrar y redesplegar.

## 7. Cómo añadir una sección

1. Su tipo de datos ya está en `secciones.ts` (los 24 existen).
2. Su esquema **estricto** en `ESQUEMAS` de `validador.ts`. Sin él, los datos
   solo se exigen objeto.
3. `src/components/centro-runtime/secciones/<Nombre>.tsx`, que termina en
   `registrarSeccion("<kind>", Componente)`.
4. Una línea en `index.ts`.
5. Un hidratador para ese `kind` en el `Hidratadores` del intento que la use.

El renderer no se toca. Si alguien añade un `if (kind === …)` en `RuntimeScreen`,
el diseño se ha roto.

## 8. Cómo añadir una pantalla

1. Si es un intento nuevo, en `INTENT_KINDS` (`types.ts`) y sus palabras en
   `intencion.ts`. Los seis de hoy ya tienen plan.
2. Sus huecos en `HUECOS` de `generador.ts`.
3. Una función `hidratadoresDe<Intento>(fuentes, puertos)` junto a `hoy.ts`,
   pura, con el grafo como puerto.
4. En `armarPantalla`, elegir esos hidratadores para ese intento.

## 9. Compromisos

**a) El grafo decide estructura, no valores (D-190).** El encargo pedía que todo
saliera del grafo. El grafo proyecta estructura: sabe que una tarea pertenece a
Malpaso, no el precio de NVDA (la watchlist no guarda precios, D-184) ni si hoy
marcaste un hábito. Así que de él salen las relaciones, y cada valor sale de un
proveedor **con nombre** en `FuentesDeHoy`. Coste: dos fuentes en vez de una;
ganancia: ninguna consulta escondida.

**b) Hidratar en el servidor (D-189).** Una sola validación, componentes puros,
ni un `fetch` desde una sección. Coste: la pantalla espera a la sección más
lenta, acotada a 1,5 s por sección.

**c) Generador determinista.** Se prueba, no cuesta una llamada y se equivoca de
formas que se leen en `intencion.ts`. Coste: entiende poco. Se sustituye sin
tocar a nadie porque `ScreenGenerator` ya es asíncrono.

**d) Sin `hydrate()` en el cliente**, a diferencia de la visión V2. Un componente
que pide sus datos es un componente que consulta módulos, que es lo que el
encargo prohibía.

**e) Rechazar, no arreglar.** Una pantalla con un fallo no se repara quitando la
sección mala; se cae al lienzo. Coste conocido: un texto tuyo con una etiqueta
(«Migrar <Header> a v2») hace caer la pantalla entera, y el motivo queda en el
log del servidor.

## 10. Evolución y migración

| Fase (visión V2) | En este código |
|---|---|
| 1 · Screen JSON | **esto** |
| 2 · Layout Engine | `AGENTIC_LAYOUT_ENGINE` dentro de `aplicarLayout`: columnas en escritorio, secciones que se ignoran al final |
| 3 · Context Engine | hidratadores de portafolio, proyecto, semana y dinero; más métodos en `LectorDelGrafo` |
| 4 · Adaptive Navigation | `AGENTIC_DYNAMIC_NAVIGATION` + un `EventSink` real |
| 5 · Multimodal Center | intentos desde voz o imagen: otra entrada a `interpretarIntencion`, mismo plan |
| 6 · Living Workspace | pantallas que se refrescan solas según `refreshPolicy` |

**El paso a modelo.** Un segundo `ScreenGenerator` que devuelve `ScreenPlan`
—nunca datos, porque el tipo no los admite—, detrás de
`AGENTIC_GENERATED_SCREENS` y pasando por la misma puerta, `validarScreen`.
**No antes de que el Agentic Kernel se haya ejecutado de verdad al menos una
vez**: sería el segundo camino de IA sin estrenar.

**Migración del Centro.** flag → lienzo sustituido (hoy) → la cabecera del
armazón pasa a ser el `hero` → el armazón entero se genera. Cada paso con el
anterior como respaldo.

## 11. Aprendizaje

El renderer ya emite `abierta`, `tiempo`, `descartada` y `accionAceptada` a un
`EventSink`; el conectado es `sinkNulo`. `accionIgnorada` está declarado y no se
emite: saber qué se ignoró exige saber qué se vio, y eso es visibilidad por
sección.

Dónde guardarlos, cuando toque: una tabla con la forma de `nav_visitas` (0072,
D-183), una fila por hecho, **ventana de 30 días y DELETE concedido**, para que
dejar de usar algo lo borre solo. Sin migración en Fase 1 a propósito.

## 12. Lo que NO está demostrado

- Que la pantalla «Hoy» con **datos reales de producción** pase el validador.
  Está probada con datos sintéticos y con la base local.
- Que `lectorDelGrafo` encuentre el proyecto de tareas reales: depende de que
  `graph_sources` proyecte `belongs_to` tarea → proyecto.
- Cuánto tarda el grafo de verdad frente al límite de 1,5 s.
