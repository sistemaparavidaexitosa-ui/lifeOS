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

---

## 13. Fase 2: el agente de interfaz (D-194 a D-196)

**Por qué.** La Fase 1 se probó y el usuario la rechazó: «no se siente para nada
agéntico… se mezcla con el antiguo centro». Tenía razón en las dos cosas: «Hoy»
salía de reglas fijas y lo escrito en la barra seguía yendo a la captura vieja;
y solo se había sustituido el lienzo. Lo que pidió no son pantallas por tema,
sino un **agente de interfaz general**: cualquier pregunta sobre cualquier
módulo produce texto, la interfaz que esa pregunta necesita, navegación y
recomendaciones. Mercado es UNA capacidad. Spec en
`docs/superpowers/specs/2026-09-24-centro-agente-design.md`.

### La superficie

Con `AGENTIC_CENTER_RUNTIME=1`, `RitualHost` monta `CentroAgente`
(`src/components/centro-agente/`) en lugar de `CentroPremium`: nada del armazón
viejo se pinta. Es una conversación: abre con «Hoy» (la pantalla de la Fase 1),
y cada envío añade un turno —burbuja de la persona, respuesta con ✓, texto y
bloques—. El (+) abre la captura rápida de siempre en una hoja. El hilo vive
mientras el Centro está abierto y no se guarda. Tema propio `--ag-*`, claro por
defecto.

### El turno

`POST /api/centro/turno { texto, historial }` → `pensarTurno`
(`src/lib/centro/agente/pensar.ts`):

1. `prepararCerebro()` (`src/lib/ai-chat/cerebro.ts`): el MISMO contexto,
   memoria y herramientas que el chat de IA. Se extrajo de `sendChatMessage`;
   el prompt del chat quedó idéntico byte a byte (`textoDelContexto`, con prueba).
2. `generateJson` con `SYSTEM_AGENTE` y `ESQUEMA_RESPUESTA`: el modelo devuelve
   `{ texto, bloques: [{ kind, datos: "<JSON>" }] }`, parseado bloque a bloque
   (`contrato.ts`). Un bloque malo se descarta con motivo; el turno sigue.
3. Cada bloque se resuelve:
   - **genéricos** (`lista`, `metricas`, `tabla`, `grafica`, `tarjetas`,
     `linea`) → `resolver.ts`: el modelo escribe REFERENCIAS
     `fila:<tabla>:<uuid>` + columna, y el valor se lee de las filas que
     `consultar` entregó EN ESTE TURNO (`filasEntregadas`). Fila no leída o
     campo inexistente: fuera ese ítem. El enlace lo deriva el servidor de la
     tabla y pasa por `destinoValido`;
   - **`ir_a`** → `destinoValido`;
   - **`recomendaciones`** → `sanearRecomendacion` (destino validado, sin cifras,
     también dentro de `datos`) y fila pendiente en `coach_proposals` (origen
     `centro`); Aceptar es `acceptProposal`;
   - **`insight`** → sin cifras;
   - **capacidades** (`mercado`, `hoy`) → `capacidades.ts`, 8 s de límite, ids
     prefijados con el del bloque.
4. `componerTurno` → `validarScreen`. Si no valida, el turno queda en texto.
5. Cualquier fallo inesperado → «No pude pensar esto ahora; inténtalo de
   nuevo.», HTTP 200. El hilo sigue.

### La regla que no se cruza

El agente **no escribe cifras dentro de los bloques**. Todo número sale de una
fila leída, de un hidratador o de Polygon. El `texto` del turno sí puede
mencionarlas, y el prompt le exige citar solo lo que leyó.

### Añadir una capacidad

Una entrada en `CAPACIDADES_REGISTRADAS` (`src/lib/centro/agente/capacidades.ts`)
con su hidratador, su nombre en `CAPACIDADES` (`contrato.ts`) y su descripción en
`SYSTEM_AGENTE`. El renderer la pinta con los componentes registrados.

### Mercado

`seccionesDeMercado` (puro) + `serieDe` (Polygon `/v2/aggs`). Portafolio = suma
de tus `investments.valuation` en tu moneda (no se valora en vivo: la tabla no
guarda ticker ni cantidad). Sin `POLYGON_API_KEY`, los tickers se ven y las
cifras no: «Falta conectar la fuente de mercado».

### Lo que NO está demostrado (Fase 2)

- **Ninguna respuesta real del modelo se ha visto en el navegador**: en local no
  hay `GEMINI_API_KEY`. Se verificó la superficie, «Hoy», el camino de fallo
  (disculpa) y el flag apagado. Que Gemini siga el contrato de referencias
  `fila:` + columna con datos reales es la primera prueba pendiente.
- Polygon con datos: sin llave en ningún entorno.
- El respaldo de Groq para este turno depende de D-193 (rama aparte).
