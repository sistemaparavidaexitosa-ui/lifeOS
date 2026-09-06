# Notas con formato en vivo (WYSIWYG) — diseño

Fecha: 2026-09-05
Módulo: Execution OS · Notebooks
Estado: aprobado en brainstorming, pendiente de plan de implementación

## El problema

El editor de notas es un `<textarea>` con un conmutador «Editando / Vista».
Escribes `## Acuerdos` y ves `## Acuerdos`; para ver un título tienes que
cambiar de modo y volver. En el escritorio se tolera. En el iPhone —que es
donde D-040 dice, con razón, que se van a escribir las notas de verdad— es
justo la fricción que hace que nadie apunte nada: nadie teclea asteriscos con
el pulgar.

Y faltan tres cosas que la gente da por hechas porque su teléfono ya las
tiene: casillas que se marcan al tocarlas, tablas, y subrayado/tachado.

D-038 excluyó las tablas por escrito —«un cuaderno necesita títulos, listas,
negrita y enlaces, no tablas ni notas al pie»—. Ese juicio fue correcto
cuando el editor era un textarea: una tabla en sintaxis pipe, escrita a mano
en un móvil, no la usa nadie. Con formato en vivo la tabla deja de ser
sintaxis y pasa a ser una rejilla que se toca, y el argumento se cae. **Esta
es la parte de D-038 que se deroga, y solo esa.**

## La decisión

**El cuerpo se edita con formato en vivo, y se sigue guardando como texto.**

Dos mitades, y la segunda es la que sostiene todo lo demás:

- **`markup.ts` deja de ser un parser de lectura y pasa a ser el modelo del
  editor.** Gana una inversa, `serializeNote`, y el editor trabaja sobre el
  árbol `Block[]` que ese archivo ya produce y ya tiene probado.
- **`notes.body` sigue siendo Markdown en texto plano.** No es una comodidad:
  la columna generada `notes.search`, `search_notes()` (0032) y
  `search_workspace` (0039) leen `body` directamente. Guardar JSON obligaría a
  rehacer la búsqueda en español, los `ts_headline` y una migración de datos,
  a cambio de nada que el set de formato del iPhone necesite. **Cero
  migraciones de base de datos en todo este trabajo.**

De ahí se derivan las demás:

- **Desaparece el conmutador «Editando / Vista».** Es lo primero que separa
  esto de las notas del iPhone. `NoteBody.tsx` sobrevive, pero solo para
  lectura: el rol Viewer y cualquier sitio donde una nota se lea sin editarse.
- **Sin dependencias nuevas** (D-008 intacto) **y sin `execCommand`.** Las
  marcas se aplican sobre datos, no sobre el DOM.
- **El alcance es `/notebooks` y nada más.** Bitácora, conocimiento de
  proyecto y comentarios de tarea siguen como están.

## 1 · El dialecto

Se amplía el subconjunto de Markdown de `src/lib/domain/notes/markup.ts`.

### Marcas inline nuevas

```ts
| { kind: "underline"; text: string }   // ++subrayado++
| { kind: "strike";    text: string }   // ~~tachado~~
```

`++…++` para el subrayado y no `__…__`: en CommonMark `__x__` es negrita, y
quien pegue Markdown de fuera vería subrayado donde escribió negrita. `++…++`
no colisiona con nada que llegue pegado.

### Bloques nuevos

```ts
| { kind: "todo";  items: { done: boolean; content: Inline[] }[] }   // - [ ] / - [x]
| { kind: "table"; head: Inline[][]; rows: Inline[][][] }            // | a | b |
| { kind: "mono";  text: string }                                    // ```
```

El menú «Aa» del iPhone mapea entero sobre lo que ya hay más esto:

| iPhone          | Bloque                  |
|-----------------|-------------------------|
| Título          | `heading` nivel 1 (`#`) |
| Encabezado      | `heading` nivel 2 (`##`)|
| Subencabezado   | `heading` nivel 3 (`###`)|
| Cuerpo          | `paragraph`             |
| Monoespaciado   | `mono`                  |

La cita (`quote`) se queda aunque el iPhone no la tenga: ya hay notas
escritas con ella y quitarla las rompería.

`mono` abre con ``` en una línea propia y cierra con ``` o con el fin del
cuerpo — una valla sin cerrar no puede tragarse la nota entera. **No admite
etiqueta de lenguaje**: el iPhone tampoco resalta sintaxis, y aceptar una
etiqueta obligaría a decidir qué hacer con un lenguaje desconocido.

### La inversa

```ts
export function serializeNote(blocks: Block[]): string
```

Inversa exacta de `parseNote`. El editor mantiene `Block[]`; al guardar
serializa.

### El escapado, que es la parte delicada

Hoy no existe escapado. Si alguien escribe literalmente `2 ** 3`, o mete un
`|` dentro de una celda, serializar y volver a parsear devuelve un árbol
distinto — y en un editor con formato en vivo eso significa que **el texto se
transforma solo mientras escribes**. Es el modo de fallo más desconcertante
que puede tener un editor.

Entra `\` como escape, en el parser y en el serializador, sobre el mínimo de
caracteres: `*`, `` ` ``, `~`, `+`, `|`, `[`, `\`.

Eso da la propiedad que ancla el diseño entero:

```
parse(serialize(parse(x)))  ≡  parse(x)     para todo x
```

No se promete que el texto vuelva byte a byte —serializar normaliza— sino que
**el árbol es un punto fijo**. Es lo que garantiza que abrir una nota vieja y
guardarla no la deforme.

## 2 · Arquitectura del editor

### Los dos regímenes

El problema central de un WYSIWYG en React: si React repinta el bloque donde
estás escribiendo, el cursor salta. Se resuelve partiendo el trabajo en dos.

**Escribir texto → el DOM manda.** El `contenteditable` del bloque enfocado es
*no controlado*: React lo pinta al montarlo y no vuelve a tocarlo. Cada
`input` se lee recorriendo el DOM y se actualiza el modelo, pero **nunca se
escribe de vuelta**. Cero repintados, cero saltos de cursor, y el dictado y el
teclado predictivo de iOS funcionan porque nadie les pisa la entrada.

**Dar formato → el modelo manda.** Al tocar **B**, cambiar a Encabezado o
insertar una tabla: se calcula el offset de la selección, se aplica una
operación pura sobre el modelo, se repinta el bloque y se restaura el cursor
por offset. Ocurre en un toque, no en cada tecla, así que el repintado no se
nota.

**Por eso no se usa `execCommand`.** Está deprecado y cada navegador escupe un
HTML distinto (Safari mete `<font>`, Chrome `<div>`). Aquí las marcas se
aplican sobre datos, el resultado es determinista, y se prueba sin navegador.

### Componentes

```
NoteEditor.tsx      pantalla: barra, estado de guardado, firma, borrar,
                    conflicto. Mantiene Block[] + el autoguardado de D-040.
  └─ NoteDoc.tsx    recorre Block[], un componente por bloque; dueño del
                    foco y de Enter/Backspace ENTRE bloques.
      └─ EditableLine.tsx   un contenteditable que pinta Inline[].
                            Lo reutilizan párrafo, encabezado, ítem de
                            lista y celda de tabla.
  └─ FormatBar.tsx  el menú «Aa» + marcas + listas + tabla + enlace + ↩︎↪︎

NoteBody.tsx        se queda, solo para LECTURA (rol Viewer). Se amplía
                    con todo / table / mono.
```

`EditableLine.tsx` es **el único sitio del proyecto con `contenteditable`**.
Todo lo demás lo rodea.

### El módulo puro

`src/lib/domain/notes/edit.ts` — sin DOM ni React, igual que `markup.ts`:

```ts
applyMark(inlines, start, end, mark)  → Inline[]   // mark: Inline["kind"]
setBlockStyle(block, style)           → Block      // style: BlockStyle
toggleTodo(block, index)              → Block
splitBlock(block, offset)             → [Block, Block]   // Enter
mergeBlocks(a, b)                     → Block | null     // Backspace al inicio
sliceInlines(inlines, start, end)     → Inline[]         // aritmética de offsets
```

donde `BlockStyle` es el menú «Aa» de la sección 1 más las tres listas:

```ts
type BlockStyle =
  | "title" | "heading" | "subheading" | "body" | "mono" | "quote"
  | "bullets" | "ordered" | "todo";
```

`setBlockStyle` es total: convertir cualquier bloque en cualquier estilo está
definido. Al pasar de `table` a otra cosa se conserva el texto de las celdas
como líneas; al pasar a `table` se hace una 2×2 con la línea actual en la
primera celda. Un caso sin definir aquí es un caso que el editor resuelve
improvisando en producción.

Ahí vive lo difícil y ahí se prueba. La capa de React solo lleva la cuenta del
cursor.

### La lista blanca de entrada

Al leer el DOM, `EditableLine` no confía en lo que encuentre. Recorre con una
lista blanca —`b`, `i`, `u`, `s`, `code`, `a[href^=http]`— y **cualquier otra
cosa colapsa a texto**. Eso cubre el pegado: si pegas de Word o de una web, el
estilo se cae y el texto sobrevive.

Es la misma garantía de D-038 —nunca se guarda ni se pinta HTML ajeno—
sostenida ahora también en el lado de la entrada, que antes no existía porque
un textarea no tiene DOM que ensuciar.

## 3 · Interacción

### Enter y Backspace

Los gobierna `NoteDoc`. Son las reglas que separan un editor que se siente
bien de uno que estorba:

- **Enter** en un párrafo → `splitBlock`, foco al nuevo con cursor al inicio.
- **Enter en un ítem vacío** → sale de la lista y lo vuelve párrafo. Sin esto,
  salir de una viñeta en el móvil es imposible.
- **Enter en un encabezado** → el bloque siguiente nace como Cuerpo.
- **Backspace al inicio** → `mergeBlocks` con el anterior, cursor en la junta.
  Si el anterior es `table` o `mono` no fusiona: solo mueve el foco, porque
  fusionar ahí no significa nada.
- **Flechas arriba/abajo en el borde** → saltan de bloque.

### Autoformato al escribir

`- `, `1. `, `[] `, `# `, `## ` al inicio de una línea convierten el bloque al
vuelo. Es una operación pura sobre el bloque, así que sale casi gratis, y es
de donde sale la sensación de rapidez.

### Checkboxes

Tocar el círculo es `toggleTodo`: no pasa por edición de texto y **no roba el
foco**, así que se puede ir marcando sin que salte el teclado.

Queda fuera mover las marcadas al final automáticamente. El iPhone lo tiene
como ajuste, y aquí sería inventar un ajuste que nadie pidió.

### Tablas

- Insertar crea 2×2 con fila de encabezado, como el iPhone.
- Cada celda es un `EditableLine`. **Tab** y **Shift-Tab** recorren celdas, y
  Tab en la última **crea fila**.
- Añadir y quitar fila/columna con controles al borde, visibles — no
  escondidos en un menú largo.
- La tabla scrollea **dentro de su propio contenedor** (`overflow-x: auto`).
  Una tabla ancha no puede poner a scrollear la nota entera de lado.
- Al serializar, las celdas escapan `|`. Al parsear, una fila con más o menos
  celdas que el encabezado se normaliza a la anchura del encabezado.
- La fila separadora se escribe siempre como `|---|---|` y **la alineación se
  ignora** al parsear: `:---:` se acepta sin romper, pero no se guarda ni se
  pinta. Alinear columnas no está en el menú del iPhone, y sostener un dato
  que nadie puede cambiar es cómo se acumulan los formatos muertos.

### Enlaces

Seleccionas y tocas 🔗: pide URL. Pegar una URL sobre texto seleccionado lo
convierte en enlace. La validación `https?://` sigue donde siempre estuvo —en
el modelo, no en el DOM— así que un `javascript:` no llega a construirse.

### Deshacer

Al manejar nosotros el DOM se pierde el undo del navegador. Va una pila propia
en `NoteEditor`: instantáneas de `Block[]` más la posición del cursor,
agrupadas por pausa (~500 ms) para que escribir seguido no genere una entrada
por tecla. La pila se corta a **50 entradas**: una nota larga con instantáneas
sin tope es una fuga de memoria en un teléfono. ⌘Z / Ctrl+Z en teclado, y **botones ↩︎ ↪︎ en la barra** — en la web
no existe API para el «sacudir para deshacer» del iPhone, y prometerlo sería
mentir.

### La barra de formato y D-040

D-040 dice que las acciones van arriba porque «una barra fija abajo pelea con
el teclado y con la barra de gestos». Sigue siendo cierto **para las
acciones** —guardar, borrar, volver— y ahí no se toca nada.

La barra de formato es otra cosa: actúa sobre la selección y tiene que estar
donde está el pulgar. Va anclada **encima del teclado** leyendo
`visualViewport.height`, que es la forma correcta de hacerlo en Safari iOS;
sin soporte, cae a estática al final del documento.

**Es una excepción acotada a D-040, no su derogación.**

## 4 · Guardado, roles y errores

### Guardado

D-040 no se toca: sin botón, guarda 1200 ms después de parar, al perder foco y
en `visibilitychange`. Lo único que cambia es qué se manda —
`serializeNote(blocks)` en lugar del valor del textarea. `saveNote` conserva
su firma.

**El detalle del que depende que esto no pierda trabajo**: el bloque enfocado
es no controlado, así que el modelo va un paso por detrás del DOM mientras
escribes. Antes de serializar hay que **volcar el bloque enfocado leyendo su
DOM**. En `visibilitychange` sobre todo: si bloqueas el teléfono a media
palabra, sin ese volcado se pierde exactamente lo último escrito — que es el
escenario que D-040 existe para proteger.

### Concurrencia

`version` optimista igual que hoy. Al chocar, el editor se bloquea; ahora
además el documento pasa a `contenteditable="false"`: tu texto sigue en
pantalla, se puede seleccionar y copiar, pero no seguir escribiendo sobre un
conflicto.

### Roles

Con `canWrite=false` (Viewer) **no se monta el editor**, se monta `NoteBody`.
Quien no puede escribir no recibe un `contenteditable` en ningún caso.

### Notas existentes: cero migración

Todo lo escrito hoy es válido en el dialecto nuevo. La primera vez que se
guarde una nota vieja, `serializeNote` la normaliza —`* viñeta` sale como
`- viñeta`, `#  título` con dos espacios sale con uno—. No cambia el
contenido, pero sí el texto guardado. Queda escrito aquí para que no aparezca
como sorpresa en un diff.

### Un hueco que este cambio agrava

`saveNote` valida `body: z.string()` **sin límite de tamaño**. Hoy escribir
mucho cuesta escribirlo; con formato en vivo, pegar un documento entero es un
gesto. Entra un tope explícito de 256 KB con mensaje claro, en el mismo
trabajo.

## 5 · Pruebas

Tres niveles, y el tercero es el que hay que decir en voz alta.

1. **`tests/domain/notes-markup.test.ts`** (se amplía) — los tres bloques
   nuevos, las dos marcas nuevas, el escapado, y la propiedad round-trip
   `parse(serialize(parse(x))) ≡ parse(x)` sobre un corpus de casos torcidos a
   propósito: asteriscos sueltos, `|` dentro de celdas, backslashes, líneas en
   blanco dentro de una lista.
2. **`tests/domain/notes-edit.test.ts`** (nuevo) — cada operación de `edit.ts`
   en sus bordes: `applyMark` partiendo una negrita existente, `splitBlock` a
   mitad de una marca, `mergeBlocks` entre tipos distintos, `toggleTodo`.
3. **Lo que no se puede probar sin navegador** —cursor, foco, pegado, la barra
   sobre el teclado, el dictado— va como lista de verificación manual en
   iPhone dentro de `docs/CHECKS.md`, bajo el Contrato de Honestidad:
   EJECUTADO OK / FALLÓ / NO EJECUTADO. **No se declara que funciona en Safari
   móvil sin haberlo abierto.**

## 6 · Documentación

Tres decisiones nuevas en `docs/DECISIONS.md`:

- La ampliación de D-038: entran las tablas, y por qué el criterio cambió al
  cambiar el editor.
- La excepción acotada a D-040 para la barra de formato.
- Por qué ni `execCommand` ni una librería de editor (y por tanto D-008
  sigue intacto, a diferencia de D-027).

Y hay que corregir la cabecera de `src/lib/domain/notes/markup.ts`, que hoy
dice literalmente «no tablas ni notas al pie».

## Orden de trabajo

1. Dialecto y escapado en `markup.ts` + `serializeNote` + la propiedad
   round-trip. Sin tocar nada de React. **Esto se puede probar entero antes de
   escribir una línea de editor.**
2. `edit.ts` con sus operaciones puras y sus pruebas.
3. `EditableLine.tsx`: contenteditable, lista blanca de entrada, restauración
   de cursor.
4. `NoteDoc.tsx`: Enter/Backspace/flechas entre bloques, autoformato.
5. `FormatBar.tsx` + anclaje sobre el teclado.
6. Tablas.
7. Deshacer/rehacer.
8. `NoteBody.tsx` ampliado, tope de 256 KB, decisiones y `CHECKS.md`.

## Fuera de alcance

- **Adjuntos** (imágenes, archivos): pide Supabase Storage, RLS de bucket,
  límites y miniaturas. Es un subproyecto aparte.
- **Fuente, tamaño y color arbitrarios**: no caben en texto y el iPhone
  tampoco los tiene.
- **Arrastrar bloques para reordenar** y **plegar secciones**.
- **Limpiar la sintaxis de los fragmentos de búsqueda** (`ts_headline` seguirá
  mostrando `## Acuerdos`). Ya pasa hoy; con checkboxes y tablas se notará
  más, pero es trabajo aparte.
- **Bitácora, conocimiento de proyecto y comentarios de tarea**: siguen con
  sus textareas. Si el editor funciona, extenderlo después es barato porque
  queda como componente propio.
