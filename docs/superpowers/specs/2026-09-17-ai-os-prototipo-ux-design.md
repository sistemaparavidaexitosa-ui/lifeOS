# LifeOS AI Operating System — prototipo UX (dirección experimental)

**Fecha:** 2026-09-17 · **Estado:** prototipo para decidir. No es producto, no
toca dominio, no toca Supabase, no modifica ningún módulo existente.

**Entregable:** `public/ai-os.html` (autocontenido) servido en `/ai-os`.

## La pregunta que responde

> «¿Cómo se siente usar una IA que conoce mi vida completa y me ayuda a
> ejecutar mis objetivos?»

No se responde con un dashboard. Se responde con un **viaje de un día**: el
prototipo se puede recorrer de las 05:00 a las 22:00 y ver cómo la IA **habla
primero** en cada momento. Esa es la tesis central: **IA activa, no pasiva**.

## Decisiones de diseño (y por qué)

| Decisión | Por qué |
|---|---|
| **La navegación no son módulos.** Cuatro superficies: `Ahora`, `Life Graph`, `Mi día`, `Memoria` | `Projects / Money / Habits / Books` obliga a la persona a saber en qué cajón está lo que quiere. Las cuatro superficies son *modos de relación con la IA*, no áreas de datos: qué me dice ahora, qué sabe de mi vida, cómo me acompaña hoy, qué recuerda de mí. |
| **Motor del tiempo como control de primer nivel** (barra + «vivir el día») | Es lo único que demuestra "IA activa" en un prototipo sin backend: la pantalla cambia sola de discurso, de ambiente y de piezas según la hora. Sin esto, cualquier prototipo se lee como un dashboard bonito. |
| **El ambiente cambia de color con la hora** (amanecer → día → noche) | Que el sistema *se sienta vivo* sin añadir una sola tarjeta. El color es información periférica: sabes qué momento del día es antes de leer nada. |
| **Orbe de presencia** que respira y late al pensar | Un indicador de estado de la IA que no ocupa espacio ni pide atención. Sustituye a los spinners. |
| **Máquina de escribir en el texto de la IA** | La diferencia entre "informe impreso" y "alguien te está hablando". Solo en la línea de apertura; el resto aparece directo para no hacer esperar. |
| **Un solo input para todo**, siempre visible | Tareas, intenciones y preguntas entran por la misma puerta. No hay formularios: el sistema decide dónde va y **pregunta cuando no lo tiene claro**. |
| **La IA nunca guarda a ciegas: desambigua con la estructura real** | Es la promesa concreta que pidió el usuario: «esta tarea va en el proyecto X» → la IA responde *en cuál de sus tres frentes*. Requiere conocer el grafo, y por eso el grafo es el centro y no un adorno. |
| **El grafo se dibuja en `<canvas>`, no en SVG/DOM** | Mismo motivo que el Execution Graph real del repo: con cientos de nodos y etiquetas el DOM se arrodilla. Aquí además permite reusar `src/lib/domain/graph/**` cuando se porte. |
| **Cada arista lleva verbo** (`requiere`, `se expresa en`, `protege`) | Un grafo sin verbos es decorativo. El verbo es lo que convierte "están conectados" en "esto depende de aquello". |
| **Pantalla de Memoria con «Olvidar»** | Una IA con memoria sin una pantalla donde verla y corregirla da miedo. Con ella, da confianza. Es requisito de producto, no un extra. |
| **Nunca «no te entendí»** | El fallback del parser siempre devuelve contexto del grafo y ofrece dónde colgar lo dicho. Una IA que conoce tu vida no puede quedarse en blanco. |

## Arquitectura del prototipo

```
public/ai-os.html          (un archivo, sin dependencias, sin red)
├─ §1 MOCK: el día         MOMENTS[] · 7 momentos con discurso, ambiente y piezas
├─ §2 MOCK: Life Graph     TYPES · NODES(37) · EDGES(54 con verbo) · INSIGHTS
├─ §3 MOCK: memoria        MEMORY[] con fuente y confianza
├─ §4 estado + motor del tiempo
├─ §5 componentes          (ver tabla de abajo)
└─ §6 arranque             atajos, voz, "vivir el día"
```

### Mapa componente → React (si la dirección se adopta)

Cada bloque del HTML está marcado con `COMPONENTE: X` y se porta 1:1:

| Componente | Qué es | Al portarlo se apoyaría en |
|---|---|---|
| `AICommandCenter` | La home: lo que la IA tiene que decir ahora y nada más | `lib/domain/coach`, `lib/domain/insights` |
| `MorningBriefing` | Sueño, recuperación, energía prevista | integración de wearable (no existe aún) |
| `AffirmationRitual` | Afirmación del día + registro de evidencia | `lib/domain/identity` (ya existe) |
| `PriorityStack` | Las 3 prioridades, con su porqué | `daily_plans`, `tasks` |
| `KnowledgeGraph` + `GraphNode` + `GraphRelationship` | Lienzo, nodos, aristas con verbo | `lib/domain/graph/**` y `graph_nodes`/`graph_edges` (ya existen y están probados) |
| `ContextPanel` | Panel del nodo: relaciones agrupadas + acciones | RPC `graph_subgraph` / `graph_impact` |
| `AIInsightCard` | Insight anclado a datos | `lib/domain/insights/facts` + `validateAnchoring` |
| `SmartCommandInput` | La única puerta de entrada; desambigua con la estructura | `lib/ai-chat`, `lib/domain/ai` |
| `DailyTimeline` | El día acompañado, con detección de huecos | `occupations`, `daily_plans` |
| `MemoryPanel` | Lo que la IA sabe, con fuente, confianza y «Olvidar» | `/intelligence/memory` (ya existe) |
| `VoicePresence` | Voz de salida (`speechSynthesis`) y dictado (`SpeechRecognition`) | API del navegador; nada que construir |

## Aislamiento

- **Ni un import** desde `src/`. No hereda `globals.css` ni `AppShell`.
- `src/app/ai-os/page.tsx` solo redirige a `public/ai-os.html`.
- `src/middleware.ts`: un único bloque, el primero de la función, que deja
  pasar `/ai-os*` sin sesión y con **CSP propia** (`connect-src 'none'`: el
  prototipo no puede llamar a nada). Sin esa excepción la CSP con nonce del
  resto de la app bloquearía sus scripts inline y se vería en blanco.
- Borrar el experimento = borrar dos archivos y ese bloque.

## Lo que el prototipo NO hace (a propósito)

Sin autenticación, sin base de datos, sin agentes reales, sin APIs, sin
Supabase. El "razonamiento" es determinista y está escrito a mano: lo que se
prueba aquí es la **conversación y el sentimiento**, no el modelo.

## Siguientes pasos recomendados

1. **Decidir la dirección** recorriendo el día completo (botón ▶). Si lo que
   se siente no es "Jarvis", ningún backend lo va a arreglar.
2. **Cablear una sola superficie de verdad**: `Ahora` leyendo `daily_plans`,
   `tasks` e `identity`. Es la que más valor da por línea de código.
3. **Reusar el grafo existente**: `/graph` ya proyecta 14 tablas a
   `graph_nodes`/`graph_edges`. El Life Graph es otra *vista* de ese motor,
   con verbos y panel de contexto nuevos — no un grafo nuevo.
4. **Desambiguación real en el input**: el paso con más valor de producto.
   Necesita catálogo de proyectos/frentes + un clasificador; la conversación
   ya está diseñada aquí.
5. **Momentos del día como automatización**: el repo ya tiene push
   (`api/push/dispatch` + pg_cron) e insights nocturnos. Un "momento" es un
   insight con hora y voz.
