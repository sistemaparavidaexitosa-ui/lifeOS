# El Centro como agente de interfaz — diseño (Fase 2)

**Fecha:** 2026-09-24 · **Estado:** diseño aprobado en conversación, spec pendiente de revisión.
**Decisiones: D-194 en adelante.** Sucede a la Fase 1 (D-188…D-192, PR #74, ya en `main`).

## Por qué hay una Fase 2

La Fase 1 se probó y **no se siente agéntica**. Palabras del usuario:

> «no se siente para nada agéntico, no produce la UI dinámica como el ejemplo de
> estas imágenes, al abrir parece que se mezclan con el antiguo centro»

> «no solo quiero que se muestre la parte de stocks, eso es una capacidad, una
> posibilidad, además de esto, el UI GPT produce lo que el usuario requiere,
> direcciona a secciones de la app y muestra información, además de
> recomendaciones»

**El diagnóstico, en tres partes:**

1. **Nadie decide.** «Hoy» sale de reglas fijas; lo que se escribe en la barra
   va a la captura vieja (nota/tarea), nunca a una pantalla. Lo que hace
   agénticas las maquetas es que una pregunta produce texto **y** la interfaz
   que esa pregunta necesita.
2. **Se mezcla con el Centro viejo.** Solo se sustituyó el lienzo: la línea de
   saludo con «Cerrar», la barra «Escribe una idea… Enviar», el pie y el lienzo
   viejo (durante la carga) siguen ahí, con el tema nocturno del ritual.
3. **Lo que se pidió no es un catálogo de pantallas por tema.** Es un agente de
   interfaz general: cualquier pregunta sobre cualquier módulo produce UI,
   navega a la sección que toca y recomienda. Mercado es **una capacidad**.

## Decisiones del usuario (2026-09-24)

1. **Conversación.** El Centro es un hilo a pantalla completa: abre con «Hoy» y
   cada cosa que se escribe añade un turno con texto + bloques generados.
2. **Mercado con Polygon + series.** El usuario pondrá `POLYGON_API_KEY`. Se
   añade la serie histórica para sparklines y gráficas. Sin llave, nunca se
   inventan cifras.
3. **Mismo cerebro, hilo propio.** Mismo modelo, herramientas y memoria que el
   chat de IA; el hilo del Centro no se mezcla con el del panel lateral y no se
   guarda.
4. **Enfoque A: el agente elige bloques, el servidor los llena.** El modelo
   decide QUÉ enseñar y QUÉ decir; las cifras salen siempre de la base o de
   Polygon.
5. **Agente general, no pantallas por tema** (ver arriba): bloques genéricos
   anclados a filas reales, navegación, recomendaciones y capacidades
   enchufables.

## Lo que el repositorio ya da

- **El cerebro.** `generateJson` (`src/lib/ai/gemini-provider.ts`): Gemini con
  `responseSchema` + `validate` de zod, respaldo en Groq (arreglado en D-193:
  sus dos modelos estaban apagados desde el 16-ago-2026).
- **Las manos para leer.** `crearCajaDeHerramientas` (`src/lib/ai/tools.ts`):
  `leer_hechos`, `consultar` (48 tablas bajo RLS, `MAX_FILAS_CONSULTA = 50`),
  `explorar_grafo`, `buscar_en_internet`. Cada fila vuelve como
  `{ id: "fila:<tabla>:<uuid>", ...columnas }` y su id queda en `entregados`.
- **El filtro de privacidad.** `tablaConsultable(tabla, ai_domains)`: solo los
  dominios que la persona autorizó.
- **Proponer sin escribir.** `coach_proposals` + `acceptProposal` /
  `dismissProposal` (`src/lib/coach/actions.ts`).
- **Destinos seguros.** `destinoValido()` (`domain/centro/sugerencias.ts`).
- **La Fase 1.** Catálogo cerrado, `validarScreen`, registro de componentes,
  `RuntimeScreen`, hidratadores con límite por bloque, «Hoy».
- **Mercado.** `cotizaciones(tickers)` y `buscarTickers` (`src/lib/money/polygon.ts`),
  tabla `watchlist` (qué sigues, nunca cuánto vale).

## Arquitectura

```
Composer ─► POST /api/centro/turno { texto, historial }
              │
              ├─ contexto: perfil, ai_domains, memoria, hechos   (como el chat)
              ├─ caja de herramientas (conserva los VALORES de lo entregado)
              ├─ generateJson ─► { texto, bloques: [{ kind, … }] }   zod
              ├─ resolver bloques:
              │     genéricos   → referencias a filas entregadas en ESTE turno
              │     capacidades → hidratador propio (mercado, hoy)
              │     navegación  → destinoValido
              │     recomendaciones → coach_proposals (origen «centro»)
              ├─ validarScreen (Fase 1)
              ▼
         { turno: { texto, secciones, acciones } }
              ▼
   CentroAgente ─► hilo ─► RuntimeScreen ─► registro ─► componentes
```

### 1. La superficie: `CentroAgente`

- Con `AGENTIC_CENTER_RUNTIME=1`, `RitualHost` monta **`CentroAgente`** en lugar
  de `CentroPremium`. Nada del armazón viejo se pinta. Apagado, `CentroPremium`
  sigue idéntico.
- Estilo de las maquetas: blanco, tipografía negra, sin bordes; cabecera con el
  logo **LifeOS** y ✕; composer abajo **(+) «¿Qué quieres hacer hoy?» (→)**.
  Tema propio (`--ag-*`), claro por defecto y oscuro solo con
  `prefers-color-scheme: dark`; no hereda el tema nocturno del ritual.
- **Primer turno = «Hoy»** (la pantalla de la Fase 1, sin cambios de contrato).
  Mientras carga, esqueleto; **nunca** el lienzo viejo.
- **Cada envío** añade un turno: burbuja del usuario a la derecha; respuesta
  con ✓, texto y bloques. El hilo baja al turno nuevo. Estado «pensando…» con
  el ✓ mientras llega.
- **(+)** abre la captura rápida existente (`/api/centro/capturar`) como hoja
  inferior: la función se conserva, deja de ser la barra principal.
- Escape y ✕ cierran; seguir cualquier enlace cierra el Centro y navega.
- El hilo vive mientras el Centro está abierto. Reabrir empieza en «Hoy».

### 2. El turno: `POST /api/centro/turno`

**Entrada** (zod): `{ texto: string 1..2000, historial: { rol: "persona"|"agente", texto: string }[] ≤ 12 }`.
El historial es solo texto: los bloques de turnos anteriores no vuelven al modelo.

**Salida del modelo** (zod, `responseSchema` equivalente):

```ts
{
  texto: string;                         // 1–3 frases; puede citar cifras SOLO si están en lo leído
  bloques: BloqueDelAgente[];            // 0..4
}
```

`BloqueDelAgente` es una unión cerrada (sección 3). Lo que no encaja se
descarta **con motivo en el log** y el turno sigue con el resto; si no queda
ningún bloque, el turno es solo texto.

**Presupuesto:** `CENTRO_AGENTE_BUDGET = { maxOutputTokens: 3000, thinkingBudget: 256 }`;
hasta `MAX_RONDAS_HERRAMIENTAS` rondas; `maxDuration = 60` en la ruta; el
cliente corta a los 45 s.

**Respuesta de la ruta:** `{ ok: true, turno: { id, texto, secciones: AnySection[], acciones: Action[] } }`
o `{ ok: false, reason }` (401 sin sesión, 400 entrada inválida). Un fallo del
modelo **no** es `ok: false`: es un turno con el texto «No pude pensar esto
ahora; inténtalo de nuevo» y sin bloques.

### 3. El vocabulario del agente

#### 3a. Bloques genéricos anclados a filas

El agente los usa para CUALQUIER módulo. **Nunca escribe un valor**: escribe
una **referencia** a una fila que le entregaron las herramientas en este turno.

```ts
type Ref = { fila: string; campo: string };     // fila = "fila:<tabla>:<uuid>"
type Etiqueta = string;                          // texto libre corto (≤ 60)
```

| kind | Forma (lo que escribe el agente) | Se pinta como |
|---|---|---|
| `lista` | `{ titulo, items: { fila, titulo: Ref, detalle?: Ref, estado?: Ref }[] ≤ 8 }` | filas con enlace a su sección |
| `metricas` | `{ titulo?, items: { etiqueta, valor: Ref, formato: "numero"|"dinero"|"porcentaje"|"fecha" }[] 1..4 }` | tarjetas KPI |
| `tabla` | `{ titulo, columnas: { etiqueta, campo, formato }[] ≤ 4, filas: string[] ≤ 10 }` | tabla compacta |
| `grafica` | `{ titulo, tipo: "linea"|"barras", campoX, campoY, filas: string[] 2..31 }` — todas las filas de la misma tabla; x e y se leen de `campoX`/`campoY` de cada fila | serie |
| `tarjetas` | `{ titulo, items: { fila, titulo: Ref, detalle?: Ref }[] ≤ 4 }` | tarjetas con enlace |
| `linea` | `{ titulo, items: { fila, fecha: Ref, titulo: Ref }[] ≤ 8 }` | línea de tiempo |

**Resolución (el corazón del diseño):**

- La caja de herramientas pasa a conservar el **registro** de cada fila
  entregada (`filasEntregadas(): Map<id, Record<string, unknown>>`), no solo su id.
- `resolverRef({ fila, campo })` devuelve el valor **de esa fila leída en este
  turno**. Una fila que no se leyó, o un campo que la fila no tiene, invalida
  **ese ítem** (no el bloque ni el turno).
- El enlace de cada ítem lo deriva el servidor de la tabla de la fila
  (`tasks`/`projects` → `/execution?project=…`, `habits`/`routines` →
  `/development/routines`, `debts` → `/debt`, …) con una tabla de rutas por
  tabla y `destinoValido`. El agente no escribe hrefs de ítems.
- El formato lo aplica el servidor (`fmoney`, `fdate`, porcentaje), con la
  moneda y el locale del perfil.

#### 3b. Navegación

`{ kind: "ir_a", destinos: { etiqueta, href }[] 1..3 }` → botones. Cada `href`
pasa por `destinoValido` (menú visible, o `/execution?project=<uuid tuyo>`).
Seguir uno cierra el Centro y navega.

#### 3c. Recomendaciones

`{ kind: "recomendaciones", items: { titulo, motivo, tipo: "tarea"|"habito"|"nota"|"foco", destino? }[] 1..3 }`.
El servidor las guarda como `coach_proposals` (origen `centro`) con el mismo
saneado que las sugerencias del Centro (`sanearPropuesta`), y el bloque pinta
**Aceptar / Descartar**, que llaman a `acceptProposal` / `dismissProposal`. El
agente propone; **escribir es siempre un clic de la persona**.

#### 3d. Texto de apoyo

`{ kind: "insight", texto }` → el recuadro 💡 de la maqueta. Pasa por el
validador de marcado.

#### 3e. Capacidades enchufables

Para lo que no vive en la base. Un **registro de capacidades** en el servidor:

```ts
interface Capacidad<P> {
  kind: string;                       // "mercado", "hoy", …
  descripcion: string;                // lo que el agente lee para decidir usarla
  parametros: z.ZodType<P>;           // lo que el agente puede pedir
  esquemaGemini: GeminiSchema;        // lo mismo, para responseSchema
  hidratar(p: P, ctx): Promise<AnySection[]>;   // ya validables
}
```

Añadir una capacidad = registrarla; el agente la ve en su prompt y el renderer
la pinta con sus componentes. Dos en esta entrega:

- **`hoy`** — la pantalla de la Fase 1.
- **`mercado`** — `{ vista: "portafolio"|"movimientos"|"watchlist"|"grafica", tickers?: string[] ≤ 8, rango?: "1D"|"1S"|"1M"|"1A" }`:
  - **portafolio**: total = suma de `investments.valuation` (moneda del perfil),
    con la fecha de la última valuación; línea desde `net_worth_snapshots` si
    hay ≥ 3 puntos, si no, sin gráfica.
  - **movimientos**: los N mayores `|%|` de la watchlist (o de `tickers`), con
    precio, % y una nota de una línea que escribe el agente en `notas[ticker]`
    (≤ 80, sin cifras).
  - **watchlist**: filas con iniciales, precio, % y sparkline 1S.
  - **grafica**: serie de un ticker en el rango pedido.
  - Tickers pedidos que no están en tu watchlist se consultan igual (datos
    públicos), pero **nunca** se añaden a ella.

**Series de mercado:** `serieDe(ticker, rango)` en `src/lib/money/polygon.ts`
sobre `/v2/aggs/ticker/{t}/range/{n}/{unidad}/{desde}/{hasta}` (1D = 5 min,
1S = hora, 1M = día, 1A = semana), mismo timeout de 10 s y misma llave.

**Sin `POLYGON_API_KEY`:** los bloques de mercado se pintan con los tickers y la
línea «Falta conectar la fuente de mercado» donde irían las cifras. Nunca ceros.

### 4. La regla que no se cruza

**El agente no escribe cifras dentro de los bloques.** Todo número de un bloque
sale de una `Ref` resuelta, de un hidratador o de Polygon. El texto libre de los
bloques (`insight`, `notas` de mercado, `motivo` de recomendaciones) pasa por un
filtro que rechaza dígitos con unidad monetaria o porcentaje; el `texto` del
turno sí puede mencionar cifras, y el prompt le exige que solo mencione las que
leyó.

### 5. Componentes nuevos (renderer de la Fase 1)

`Lista`, `Metricas`, `Tabla`, `Grafica` (SVG propio, sin librería), `Tarjetas`,
`LineaDeTiempo`, `IrA`, `Recomendaciones` (con Aceptar/Descartar), `Insight`,
`Portafolio`, `Movimientos`, `Watchlist` (con `Sparkline`). Cada uno se registra
solo y trae su esquema estricto al validador. Estilo de las maquetas: tarjetas
blancas con sombra mínima, cifras grandes, verde/rojo solo en variaciones.

## Qué pasa cuando algo falla

| Fallo | Lo que se ve |
|---|---|
| Gemini y Groq fallan | turno con «No pude pensar esto ahora; inténtalo de nuevo» |
| Bloque con forma inválida | ese bloque no sale; log con motivo |
| Ref a una fila no leída | ese ítem no sale; si el bloque queda vacío, no sale |
| Hidratador de capacidad falla o tarda > 8 s | ese bloque en `error`, el resto se pinta |
| `validarScreen` rechaza | el turno queda en solo texto |
| Proyecto nombrado que no existe | el agente lo dice o pregunta cuál; nunca uno ajeno |
| Petición > 45 s | «Tardó demasiado», el hilo sigue |

## Flags

Mismo `AGENTIC_CENTER_RUNTIME`: encendido monta `CentroAgente`. Los tres
secundarios siguen sin usarse. Sin variables nuevas salvo `POLYGON_API_KEY`, que
ya existía.

## Pruebas

Dominio puro con el runner de node:

- contrato zod del turno y de cada bloque (incluidos límites);
- `resolverRef`: fila no leída, campo inexistente, fila de otra tabla;
- derivación de enlaces por tabla y su paso por `destinoValido`;
- filtro «sin cifras en el texto libre de los bloques»;
- capacidad `mercado` con un Polygon falso: con y sin llave, ticker desconocido;
- `serieDe`: construcción de la URL por rango;
- turno con modelo que falla → solo texto; con bloque ilegal → el resto sale;
- flag apagado → `CentroPremium` y `/api/centro` como hoy.

Navegador (Chromium local, 390 px, `pnpm build && pnpm start`) **con el modelo
real**: requiere `GEMINI_API_KEY` en `.env.local`, que pone el usuario. No se
añade ningún modelo falso activable por variable: sería una puerta en el código
de producción. Polygon real si hay llave; si no, se verifica el estado «Falta
conectar la fuente de mercado». Las tres
conversaciones de las maquetas («¿Qué hago hoy?», «¿Cómo van mis acciones?»,
«Muéstrame mi watchlist») más una de otro módulo («¿Cómo voy con mis hábitos?»),
con capturas comparadas contra las maquetas. Después, una prueba real en
producción con las llaves puestas.

## Fuera de alcance

Portafolio en vivo por posiciones (necesita migración: ticker y cantidad en
`investments`); guardar el hilo; streaming token a token; pantalla `semana` con
calendario; voz e imagen; que el agente **ejecute** acciones (solo propone).

## Documentación

Actualizar `docs/AGENTIC_CENTER_RUNTIME.md` (la Fase 2 cambia la superficie y
añade el agente), decisiones D-194 en adelante, y `docs/DEPLOY.md` si cambia algo
de variables.
