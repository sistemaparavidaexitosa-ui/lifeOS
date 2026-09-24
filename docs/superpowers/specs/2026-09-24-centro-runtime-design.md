# El Centro como runtime — diseño (Fase 1: Screen JSON)

**Fecha:** 2026-09-24 · **Estado:** diseño aprobado en conversación, spec pendiente de revisión. **Decisiones: D-188 en adelante.**

## Contexto

El Centro (D-165…D-185) es un overlay de cliente, `CentroPremium.tsx`, que pide
`GET /api/centro` y pinta un lienzo fijo decidido por `tarjetasDelCentro`. El
encargo es convertirlo en un **runtime**: que un agente decida QUÉ se enseña
describiéndolo en JSON declarativo —nunca HTML, nunca JSX— y que un renderer
genérico de React decida CÓMO, descubriendo los componentes en un registro.

El encargo pide explícitamente arquitectura antes que implementación: contratos,
abstracciones, flags apagados y el Centro actual intacto.

## Decisiones del usuario (2026-09-24)

1. **Fase 1 = contratos + UNA pantalla real.** La pantalla «Hoy» (maqueta de la
   mañana), generada de forma **determinista**, sin modelo. Las demás pantallas
   del encargo (portafolio, proyecto, semana, dinero) existen como plan y
   contrato, y se pintan con `emptyState` hasta que tengan hidratadores.
2. **Se sustituye solo el lienzo.** `CentroPremium` conserva su armazón —abrir,
   cerrar, foco, «Ahora no», `BarraCaptura`, pie—. Con el flag apagado el Centro
   es idéntico al de hoy.
3. **Se hidrata en el servidor.** `/api/centro` devuelve una pantalla ya
   hidratada y validada. Los componentes de cliente son puros: datos dentro,
   píxeles fuera. No hay `hydrate()` en el cliente.

## Lo que el repositorio impone

- **Los flags son variables de entorno**, leídas por funciones de
  `src/config/env.ts` (`coachPorElKernel()`, `insightsPorElKernel()`). No hay
  tabla de flags y no se crea una.
- **El grafo es proyección de estructura**, no de valores. Sabe que Malpaso
  tiene tareas, metas y personas; no sabe el precio de NVDA (la watchlist no
  guarda precios, D-184) ni si hoy marcaste un hábito. Por eso «todo sale del
  grafo» no se puede cumplir al pie de la letra: **el grafo decide qué y cómo se
  relaciona; un proveedor explícito, con nombre, pone los valores.**
- **Patrones que se reutilizan:** `validar…() → motivo | null` del Kernel
  (`domain/agents/contrato.ts`) para el registro, y `destinoValido()`
  (`domain/centro/sugerencias.ts`) para todo enlace que salga de una pantalla.
- **El Kernel nunca se ha ejecutado de verdad.** Un generador con modelo sería el
  segundo camino de IA sin estrenar; por eso el primero es determinista.

## Flujo

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

## Responsabilidades

| Quién | Decide | Y no puede |
|---|---|---|
| Generador | QUÉ secciones, en qué orden, para qué intento | poner datos: `ScreenPlan` no tiene dónde |
| Hidratador | QUÉ datos lleva cada sección | elegir secciones |
| Layout | orden y densidad | inventar secciones |
| Validador | si la pantalla es legal | arreglarla: rechaza con motivo |
| Renderer | CÓMO: qué componente pinta cada `kind` | importar un componente concreto |
| Componente | LO VISUAL | pedir datos |

## Arquitectura

```
src/lib/domain/centro/runtime/     PURO (sin I/O, sin React)
  types.ts        Screen, Section<K>, Action, RefreshPolicy, Intent
  secciones.ts    SECTION_KINDS y el tipo de datos de cada uno
  intencion.ts    interpretarIntencion(texto | null, { franja }) → Intent
  plan.ts         ScreenPlan: kinds + orden + hueco, SIN datos
  generador.ts    interface ScreenGenerator + generadorDeterminista
  layout.ts       aplicarLayout(plan, flags): orden fijo; el motor es un no-op tras su flag
  validador.ts    validarScreen(unknown) con zod: es la frontera con el futuro modelo
  acciones.ts     sanearAccion(), sobre destinoValido()
  aprendizaje.ts  ScreenEvent, interface EventSink, sinkNulo
src/lib/centro/runtime/            SERVIDOR
  grafo.ts        puerto LectorDelGrafo sobre loadSubgraph / nodeForEntity
  hidratadores.ts un hidratador por kind; los de «hoy» en Fase 1
  pantalla.ts     armarPantalla(intent, ctx) → Screen | null
src/components/centro-runtime/     CLIENTE
  registro.ts     registrarSeccion(kind, Componente) / componenteDe(kind)
  secciones/      Hero, Narrative, Tasks, QuickActions, EmptyState, Error
  index.ts        importa secciones/* por efecto; es el único que las conoce
  RuntimeScreen.tsx renderer genérico
```

### El modelo de pantalla

```ts
interface Screen {
  id: string;
  title: string;
  subtitle?: string;
  narrative?: string;
  layout: { densidad: "aireada" | "compacta" };
  sections: Section[];
  actions: Action[];
  refreshPolicy: { tipo: "alAbrir" } | { tipo: "cada"; segundos: number } | { tipo: "porFranja" };
  permissions: { lectura: true; escritura: false };
}
interface Section<K extends SectionKind = SectionKind> { id: string; kind: K; title?: string; data: DatosDe<K> }
type Action = { label: string; href: string } | { label: string; intent: IntentKind };
type IntentKind = "hoy" | "portafolio" | "proyecto" | "semana" | "dinero" | "libre";
```

- **Una sección nunca es ejecutable.** Es un `kind` y datos serializables. Una
  acción es un enlace interno o un intento: no hay forma de expresar «ejecuta
  esto».
- **`permissions.escritura` es `false` como tipo literal.** En Fase 1 ninguna
  pantalla escribe; ensancharlo exige cambiar el tipo, no una línea de datos.

### Catálogo de secciones

`hero, text, narrative, chat, portfolio, watchlist, chart, timeline, calendar,
tasks, projects, habits, books, money, cards, table, metric, graph, journal,
knowledge, quickActions, emptyState, error, loading`.

Todas tienen tipo de datos. Solo seis tienen componente en Fase 1: `hero`,
`narrative`, `tasks`, `quickActions`, `emptyState` y `error`. El resto se
declara para que el contrato sea completo y un plan que las pida sea legal: el
renderer las pinta como `emptyState`.

### La pantalla «Hoy»

`interpretarIntencion(null, { franja })` → `{ kind: "hoy" }` → plan
`[hero, narrative, tasks, quickActions]`.

| Sección | Datos | Fuente |
|---|---|---|
| hero | saludo + nombre + fecha | `greetingFor(puerta.hourLocal)`, `puerta.nombre`, `puerta.dateISO`: lo mismo que ya arma `RitualGate` |
| narrative | el «cómo voy» de la franja | `resumen` de `sugerenciasDelCentro` |
| tasks | foco de hoy, numerado, con «Proyecto · X» | `ContenidoDelRitual` + grafo para las etiquetas |
| quickActions | «Sigue por aquí» | `senales` de `ContenidoDelRitual`, hrefs por `destinoValido` |

**No se añade ni una consulta nueva a la base** salvo las etiquetas del grafo:
`ContenidoDelRitual` ya se carga en esa misma ruta.

## Qué pasa cuando algo falla

- **Kind sin componente:** `emptyState`. Una sección que falta nunca rompe la
  pantalla.
- **Hidratador que lanza o tarda más de 1,5 s:** esa sección pasa a `error` y el
  resto se pinta.
- **Pantalla que no valida:** `screen: null` y el Centro pinta el lienzo de hoy.
  El camino viejo es el respaldo, y eso es diseño, no parche.

## Flags

| Variable | Qué enciende | Fase 1 |
|---|---|---|
| `AGENTIC_CENTER_RUNTIME` | `/api/centro` arma la pantalla y el Centro pinta el runtime | real |
| `AGENTIC_GENERATED_SCREENS` | lo escrito en la barra va a `interpretarIntencion` | contrato, no-op |
| `AGENTIC_LAYOUT_ENGINE` | `aplicarLayout` deja el orden fijo | contrato, no-op |
| `AGENTIC_DYNAMIC_NAVIGATION` | las acciones de la pantalla reordenan la navegación | contrato, no-op |

- `flagsDelRuntime()` devuelve un objeto resuelto; los tres últimos solo cuentan
  si el primero está encendido.
- El cliente recibe los flags en la respuesta de `/api/centro`. No hay
  `NEXT_PUBLIC_*` que pueda desincronizarse del servidor.
- Todos valen `"1"` para encender, como los del Kernel. Apagar es borrar y
  redesplegar.

## Aprendizaje (solo interfaces)

`ScreenEvent = abierta | descartada | tiempo | accionAceptada | accionIgnorada`,
cada uno con `screenId`, `intentKind` y `sectionKind?`. `EventSink` es una
interfaz; en Fase 1 se conecta `sinkNulo`, pero el renderer ya emite los eventos,
así que el día que exista un sink real no hay que tocar ni un componente. El
precedente para guardarlos es `nav_visitas` (0072), con su ventana de 30 días.
**Sin migración.**

## Interfaz

Maqueta de la mañana: fondo blanco, tipografía negra, espacio generoso, sin
bordes. Hero de tipografía grande; narrativa en un bloque gris suave; foco como
lista numerada con ›; «Sigue por aquí» como fila de tarjetas sin borde. Bloque
`.rt-*` en `globals.css` con los tokens existentes, sin colores nuevos. El modo
oscuro sigue a `temaDelRitual`.

## Cambios en código existente

- `src/config/env.ts`: `flagsDelRuntime()`.
- `src/app/api/centro/route.ts`: si `flags.runtime`, añade `screen` y `flags` a
  la respuesta. Si no, la respuesta es la de hoy, campo por campo.
- `src/components/ritual/CentroPremium.tsx`: un único punto de corte,
  `screen ? <RuntimeScreen /> : <lienzo actual>`.
- `src/app/globals.css`: bloque `.rt-*`.

## Documentación

- `docs/AGENTIC_CENTER_RUNTIME.md`, a imagen de `AGENTIC_KERNEL_ARCHITECTURE.md`:
  arquitectura, flujo, responsabilidades, evolución futura (fases 1–6 de la
  visión V2 contra los flags), compromisos, estrategia de migración (flag →
  lienzo → armazón completo → generador con modelo detrás de `ScreenGenerator`)
  y cómo encaja con el Centro actual.
- `docs/DECISIONS.md`: D-188 en adelante.

## Fuera de alcance

Generador con modelo; hidratadores de portafolio, proyecto, semana y dinero;
motor de layout; navegación dinámica; aprendizaje persistido; intentos desde
`BarraCaptura`.

## Pruebas

`tests/domain/centro-runtime-*.test.ts`, con el runner de node:

- el validador rechaza marcado en los datos, kinds desconocidos, hrefs externos y
  acciones sin destino válido;
- el generador devuelve el mismo plan para la misma entrada;
- `interpretarIntencion` lleva las cinco frases del encargo a sus cinco intentos;
- `armarPantalla` con un hidratador que falla deja esa sección en `error` y pinta
  el resto;
- **«FLAG APAGADO = HOY»**: sin el flag, la respuesta de `/api/centro` no tiene
  `screen` ni `flags`.

«NO REORDENA», el test de `tarjetasDelCentro`, no se toca.

Verificación: `pnpm typecheck && pnpm lint && pnpm test:unit` (**no**
`pnpm verify`, que borra la base local). En navegador, `pnpm build && pnpm start`
con y sin `AGENTIC_CENTER_RUNTIME=1`, a ancho de iPhone.
