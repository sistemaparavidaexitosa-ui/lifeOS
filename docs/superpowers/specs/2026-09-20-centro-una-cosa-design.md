# El centro dice qué hacer — diseño (una cosa a la vez)

**Fecha:** 2026-09-20 · **Estado:** diseño aprobado, pendiente de plan. **Decisión: D-169.** La watchlist pasa a D-170 y migración 0073.

## Contexto

Tras usar el centro lienzo (D-168), el usuario fue claro:

> «aún no se siente como experiencia premium de navegación inteligente, lo que
> quiero es que todo se sienta como el flujo de la rutina de inicio, pero no en
> pasos como está ese flujo, sino que sea un flujo semiconversacional, sobre el
> centro como lienzo dinámico, no necesito que el "centro" muestre todas los
> módulos y sus secciones, sino que me diga que es lo que debo hacer con base en
> los proyectos, rutinas, money OS, etc.»

**El diagnóstico es de proporción, no de inteligencia.** Hoy el centro dedica
casi toda su superficie a cosas fijas —23 destinos agrupados, una rejilla de
cifras— y unas pocas líneas a lo derivado. Aunque la IA acierte, la pantalla se
lee como un panel con un widget de sugerencias encima. Lo que se pide es
invertir la proporción: que **lo derivado sea la pantalla**.

Y hay algo que lo hace posible sin romper nada: **la barra lateral sigue
existiendo debajo**. El centro puede dejar de ser un menú porque la aplicación ya
tiene uno.

## Decisiones del usuario (2026-09-20)

1. **Una cosa a la vez, a pantalla completa.** Se resuelve y entra la siguiente.
2. **Sin pasos numerados ni flechas.** No se avanza por una secuencia: se
   atiende lo que hay. Es la diferencia con el ritual de la mañana (D-165), que
   sí es una secuencia y no se toca.
3. **Fuera la lista de módulos.** Para navegar está la barra lateral; la salida
   del centro es «Ahora no» o Escape.

## Qué es una tarjeta

Tres capas, siempre en el mismo orden:

| Capa | Qué es | Ejemplo |
|---|---|---|
| **La voz** | Por qué te lo dice, con su cifra real. En pequeño, arriba | «Llevas dos días sin tocarlo y hoy vencen tres» |
| **El qué** | La acción, en la tipografía grande del ritual | «Retoma Rediseño de la tienda» |
| **Las acciones** | La principal y la salida | «Abrir» · «Ahora no» |

La voz es lo que hace esto **semiconversacional**: no es una etiqueta, es alguien
hablando. Y no se inventa: sale de los mismos hechos que ya alimentan todo lo
demás, o del resumen que escribió el modelo en esta franja.

## De dónde salen, y en qué orden

Una función pura, `tarjetasDelCentro(entrada)`, ordena por **lo que caduca
antes**:

1. **Apertura** — el «cómo voy» de la franja, si existe. Es la primera carta de
   la conversación, no un párrafo suelto.
2. **El hábito que toca ahora**, según su bloque horario (la regla de D-165 con
   `HORIZONTE_RUTINA_MIN`). Se marca sin salir del centro.
3. **Lo que la IA propuso** esta franja: `foco`, `tarea`, `nota`. Aceptar llama a
   la Server Action real (D-153).
4. **Tu Única Cosa**, si sigue sin hacerse.
5. **Dinero**, si la quincena cierra en tres días o menos, o el presupuesto está
   en rojo.
6. **Lo vencido**, si hay.
7. **Cierre** — «Ya está. ¿Algo más?», con la barra debajo.

Tope: **seis** tarjetas antes del cierre. Más que eso deja de ser «qué hago
ahora» y vuelve a ser una bandeja.

**Ninguna tarjeta existe sin su dato** (NO-MOCK). Un día sin nada que atender
abre directamente en el cierre, que sigue siendo útil: ahí está la barra.

## Cómo se comporta

- **Se resuelve y entra la siguiente**, con la misma transición corta que ya usa
  el ritual (y ninguna con `prefers-reduced-motion`).
- **Un contador discreto** —«quedan 2»— porque ver una cosa a la vez tiene una
  pega conocida: no saber cuánto falta. Es un número pequeño, no una barra de
  progreso: no es una secuencia que haya que terminar.
- **«Ahora no»** en una tarjeta la pospone al final de la tanda; **Escape**
  cierra el centro entero.
- **La barra de captura está siempre visible**, al pie. Es lo que separa una
  conversación de un carrusel: en cualquier momento puedes decir otra cosa.
- **Nada se escribe sin un toque.** Igual que siempre (D-153).

## Qué desaparece del centro, y por qué no se pierde nada

| Desaparece | Dónde sigue estando |
|---|---|
| La lista de 23 destinos agrupados | La barra lateral, que nunca se tocó |
| Los atajos «Sigue por aquí» (D-168) | Convertidos en tarjetas cuando hay motivo |
| La rejilla de cifras «Tu día» | Convertidas en tarjetas cuando importan: Dinero solo si aprieta, vencidas solo si hay |

`destinosDelCentro` y `destacadosDelCentro` **se borran**, con sus pruebas: dejan
de tener consumidor, y dejar código muerto «por si acaso» es cómo se acumulan
dos formas de hacer lo mismo.

## Invariantes que NO se tocan

1. **El ritual de la mañana (D-165) sigue igual.** Es una secuencia guiada y
   tiene que seguir siéndolo; al terminar sigue dejando en el centro.
2. **D-153:** la IA propone, la persona acepta, y lo que crea pasa por la acción
   real.
3. **D-151:** una sola cola de propuestas.
4. **El coste no cambia:** las tarjetas se componen de lo que el centro ya lee y
   de las propuestas ya guardadas. Ni una llamada nueva al modelo.
5. **El centro sigue llegando en el primer HTML** (D-168): la apertura y las
   tarjetas que no dependen de la IA se pintan sin esperar.

## Unidades

| Unidad | Qué hace |
|---|---|
| `src/lib/domain/centro/lienzo.ts` (puro) | `tarjetasDelCentro(entrada): Tarjeta[]`, con el orden, el tope y el cierre |
| `src/components/ritual/Lienzo.tsx` | Pinta una tarjeta, resuelve y avanza |
| `src/components/ritual/CentroPremium.tsx` | Se queda como armazón: cabecera, lienzo, barra |
| `src/lib/domain/centro/destinos.ts`, `destacados.ts` | **Se borran**, con sus pruebas |

## Pruebas

- **Dominio (TDD):** el orden de los seis tipos; ninguna tarjeta sin su dato; el
  tope de seis; un día vacío abre en el cierre; «ahora no» manda al final y no
  repite; la apertura solo existe si hay resumen.
- **Navegador:** se ve UNA tarjeta; marcar el hábito la resuelve y entra la
  siguiente; aceptar una propuesta crea de verdad; «Ahora no» la pospone;
  Escape cierra; la barra está visible en todo momento; **no hay lista de
  módulos**; a 400 px sigue sin desbordar.

## Riesgos aceptados

| Riesgo | Mitigación |
|---|---|
| Quitar el menú deja a alguien sin saber cómo llegar a un módulo desde el centro | La barra lateral está debajo y «Ahora no» cierra en un toque. Es la decisión explícita del usuario |
| Ver una cosa a la vez oculta el conjunto | El contador dice cuántas quedan |
| Si la IA no propone nada y el día está tranquilo, el centro abre casi vacío | Abre en el cierre, con la barra: sigue sirviendo para capturar |
| Es la tercera forma del centro en dos días | Por eso se borra lo que deja de usarse en vez de acumularlo |
