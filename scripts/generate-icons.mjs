#!/usr/bin/env node
// Genera los iconos PNG de la PWA:
//
//   node scripts/generate-icons.mjs
//
// PARA CAMBIAR EL ICONO, CAMBIA `scripts/icono-fuente.png` Y VUELVE A CORRER
// ESTO. Es el único archivo que hay que tocar: de ahí salen los cinco tamaños,
// el recorte y el relleno de las esquinas, todo medido sobre la propia imagen.
//
// POR QUÉ UN SCRIPT Y NO CINCO BINARIOS SUELTOS EN GIT
// Un PNG suelto en el repo es una caja negra: nadie sabe de dónde salió ni cómo
// rehacerlo cuando cambie la marca. Aquí el binario que se versiona es UNO —la
// fuente— y el resto es una derivación reproducible con un comando.
//
// POR QUÉ LA FUENTE ES UN PNG Y YA NO UN DIBUJO POR CÓDIGO
// Hasta el 2026-09-09 este script dibujaba la palomita a mano sobre el verde de
// marca. El icono nuevo es un render con degradados, biselado y reflejos: no
// hay aritmética de segmentos que lo reproduzca. Lo que se conserva del diseño
// anterior es el principio —un comando regenera todo— movido un nivel: de
// «dibujar el icono» a «derivarlo».
//
// EXCEPCIÓN: EL BADGE SIGUE DIBUJÁNDOSE. `badge-72.png` es la silueta que
// Android pinta en la barra de estado; recolorea la imagen y descarta todo
// menos el alpha. Un render con reflejos ahí se convierte en una mancha, así
// que ese sí se sigue trazando por código.
//
// SIN DEPENDENCIAS (D-008): el PNG se lee y se escribe a mano sobre `zlib`, que
// trae Node. Un PNG de 8 bits sin entrelazar es una cabecera, un deflate y un
// byte de filtro por fila.

import { deflateSync, inflateSync } from "node:zlib";
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";

const FUENTE = "scripts/icono-fuente.png";

// ─── PNG: escribir ───────────────────────────────────────────────────────────
const TABLA_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLA_CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(tipo, datos) {
  const largo = Buffer.alloc(4);
  largo.writeUInt32BE(datos.length);
  const cuerpo = Buffer.concat([Buffer.from(tipo, "ascii"), datos]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(cuerpo));
  return Buffer.concat([largo, cuerpo, crc]);
}

/** Predictor de PNG. `a` izquierda, `b` arriba, `c` diagonal. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * `pixeles` es RGBA de `lado*lado*4`. Con `opaco`, el alpha se descarta y se
 * escribe RGB: son tres cuartas partes de los datos en vez de cuatro, y en un
 * icono que ya se aplanó el canal sobra.
 */
function png(lado, pixeles, opaco = false) {
  const canales = opaco ? 3 : 4;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = opaco ? 2 : 6; // RGB / RGBA
  // 10, 11, 12 = compresión, filtro y entrelazado estándar: todo en cero.

  const fila = lado * canales;
  const datos = Buffer.alloc(lado * fila);
  for (let i = 0, o = 0; i < lado * lado; i++) {
    datos[o++] = pixeles[i * 4];
    datos[o++] = pixeles[i * 4 + 1];
    datos[o++] = pixeles[i * 4 + 2];
    if (!opaco) datos[o++] = pixeles[i * 4 + 3];
  }

  // Cada fila lleva delante su byte de filtro. Se arman las dos estrategias y
  // se comprimen las dos, quedándose con la que salga más pequeña.
  //
  // POR QUÉ DOS Y NO SOLO LA «BUENA»
  // La heurística de la especificación —menor suma de valores absolutos por
  // fila— es la correcta para el icono, que es un degradado con biselado: sin
  // filtrar ocupaba 325 KB. Pero para el badge, que es una silueta sobre un
  // vacío enorme, es peor: sin filtrar hay filas enteras de ceros y eso lo
  // aprovecha el deflate mucho mejor. Aplicada a ciegas engordaba el badge de
  // 428 a 587 bytes. Comprimir las dos cuesta milisegundos y quita la duda.
  const sinFiltrar = Buffer.alloc(lado * (fila + 1));
  const filtrado = Buffer.alloc(lado * (fila + 1));
  const intento = Buffer.alloc(fila);

  for (let y = 0; y < lado; y++) {
    datos.copy(sinFiltrar, y * (fila + 1) + 1, y * fila, (y + 1) * fila);

    let mejor = null;
    let mejorCoste = Infinity;
    for (let filtro = 0; filtro <= 4; filtro++) {
      let coste = 0;
      for (let x = 0; x < fila; x++) {
        const actual = datos[y * fila + x];
        const izq = x >= canales ? datos[y * fila + x - canales] : 0;
        const arriba = y > 0 ? datos[(y - 1) * fila + x] : 0;
        const diag = y > 0 && x >= canales ? datos[(y - 1) * fila + x - canales] : 0;
        let v;
        if (filtro === 0) v = actual;
        else if (filtro === 1) v = actual - izq;
        else if (filtro === 2) v = actual - arriba;
        else if (filtro === 3) v = actual - ((izq + arriba) >> 1);
        else v = actual - paeth(izq, arriba, diag);
        v &= 0xff;
        intento[x] = v;
        // El byte se interpreta con signo para estimar el coste: un -1 (0xff)
        // comprime como un 1, no como 255.
        coste += v < 128 ? v : 256 - v;
      }
      if (coste < mejorCoste) {
        mejorCoste = coste;
        mejor = { filtro, bytes: Buffer.from(intento) };
      }
    }
    filtrado[y * (fila + 1)] = mejor.filtro;
    mejor.bytes.copy(filtrado, y * (fila + 1) + 1);
  }

  const candidatos = [sinFiltrar, filtrado].map((c) => deflateSync(c, { level: 9 }));
  const idat = candidatos[0].length <= candidatos[1].length ? candidatos[0] : candidatos[1];

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ─── PNG: leer ───────────────────────────────────────────────────────────────
/** Devuelve `{ ancho, alto, px }` con `px` en RGBA, deshaciendo los filtros. */
function leerPng(ruta) {
  const buf = readFileSync(ruta);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${ruta} no es un PNG`);

  let ancho = 0;
  let alto = 0;
  let canales = 0;
  const idat = [];

  for (let i = 8; i < buf.length; ) {
    const largo = buf.readUInt32BE(i);
    const tipo = buf.toString("ascii", i + 4, i + 8);
    const datos = buf.subarray(i + 8, i + 8 + largo);
    if (tipo === "IHDR") {
      ancho = datos.readUInt32BE(0);
      alto = datos.readUInt32BE(4);
      const bits = datos[8];
      const color = datos[9];
      if (bits !== 8) throw new Error(`${ruta}: se esperaban 8 bits por canal, hay ${bits}`);
      if (datos[12] !== 0) throw new Error(`${ruta}: PNG entrelazado, no soportado`);
      // 2 = RGB, 6 = RGBA. Con paleta o escala de grises no se cuenta aquí:
      // exportar el icono como RGB/RGBA es trivial en cualquier editor y da un
      // error claro en vez de una imagen mal leída.
      if (color !== 2 && color !== 6) throw new Error(`${ruta}: tipo de color ${color}; usa RGB o RGBA`);
      canales = color === 6 ? 4 : 3;
    } else if (tipo === "IDAT") {
      idat.push(datos);
    } else if (tipo === "IEND") {
      break;
    }
    i += 12 + largo;
  }

  const datos = inflateSync(Buffer.concat(idat));
  const fila = ancho * canales;
  const px = new Uint8Array(ancho * alto * 4);
  const linea = Buffer.alloc(fila);
  let previa = Buffer.alloc(fila);

  for (let y = 0; y < alto; y++) {
    const filtro = datos[y * (fila + 1)];
    const cruda = datos.subarray(y * (fila + 1) + 1, y * (fila + 1) + 1 + fila);
    for (let x = 0; x < fila; x++) {
      const izq = x >= canales ? linea[x - canales] : 0;
      const arriba = previa[x];
      const diag = x >= canales ? previa[x - canales] : 0;
      let valor = cruda[x];
      if (filtro === 1) valor += izq;
      else if (filtro === 2) valor += arriba;
      else if (filtro === 3) valor += (izq + arriba) >> 1;
      else if (filtro === 4) valor += paeth(izq, arriba, diag);
      else if (filtro !== 0) throw new Error(`${ruta}: filtro ${filtro} desconocido en la fila ${y}`);
      linea[x] = valor & 0xff;
    }
    for (let x = 0; x < ancho; x++) {
      const o = (y * ancho + x) * 4;
      px[o] = linea[x * canales];
      px[o + 1] = linea[x * canales + 1];
      px[o + 2] = linea[x * canales + 2];
      px[o + 3] = canales === 4 ? linea[x * canales + 3] : 255;
    }
    previa = Buffer.from(linea);
  }

  return { ancho, alto, px };
}

// ─── Recorte y escalado ──────────────────────────────────────────────────────
/**
 * Caja del dibujo OPACO, ignorando la sombra difusa que suele rodearlo.
 *
 * Se mide sobre el alpha porque es lo único que distingue la placa del vacío
 * en cualquier icono que se ponga aquí mañana. El umbral alto (200) deja fuera
 * la sombra: incluirla metería un margen muerto y el icono saldría pequeño
 * dentro de su propio cuadro.
 */
function cajaOpaca({ ancho, alto, px }) {
  let x0 = ancho;
  let y0 = alto;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < alto; y++) {
    for (let x = 0; x < ancho; x++) {
      if (px[(y * ancho + x) * 4 + 3] > 200) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error(`${FUENTE}: la imagen está entera transparente`);
  return { x0, y0, x1, y1 };
}

/** El cuadrado más grande centrado en la caja: el icono tiene que ser cuadrado
 *  y estirar una imagen casi cuadrada se nota en las diagonales. */
function recorteCuadrado(img) {
  const { x0, y0, x1, y1 } = cajaOpaca(img);
  const lado = Math.min(x1 - x0 + 1, y1 - y0 + 1);
  return {
    left: Math.round(x0 + (x1 - x0 + 1 - lado) / 2),
    top: Math.round(y0 + (y1 - y0 + 1 - lado) / 2),
    lado
  };
}

/**
 * Reescala el recorte a `destino` promediando por áreas.
 *
 * Promediar y no tomar el píxel más cercano no es un lujo: al bajar de 770 a
 * 32 px el vecino más cercano se come el borde luminoso de la placa y deja la
 * palomita dentada.
 */
function reescalar(img, { left, top, lado }, destino) {
  const salida = new Uint8Array(destino * destino * 4);
  const paso = lado / destino;
  for (let y = 0; y < destino; y++) {
    const yIni = Math.floor(top + y * paso);
    const yFin = Math.max(yIni + 1, Math.floor(top + (y + 1) * paso));
    for (let x = 0; x < destino; x++) {
      const xIni = Math.floor(left + x * paso);
      const xFin = Math.max(xIni + 1, Math.floor(left + (x + 1) * paso));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = yIni; sy < yFin; sy++) {
        for (let sx = xIni; sx < xFin; sx++) {
          const o = (sy * img.ancho + sx) * 4;
          // Premultiplicado: sin esto el color de los píxeles casi
          // transparentes del borde se promedia con el mismo peso que el del
          // centro y aparece una orla clara alrededor del dibujo.
          const alfa = img.px[o + 3] / 255;
          r += img.px[o] * alfa;
          g += img.px[o + 1] * alfa;
          b += img.px[o + 2] * alfa;
          a += img.px[o + 3];
          n++;
        }
      }
      const o = (y * destino + x) * 4;
      const alfaMedio = a / n / 255;
      salida[o] = alfaMedio > 0 ? Math.round(r / n / alfaMedio) : 0;
      salida[o + 1] = alfaMedio > 0 ? Math.round(g / n / alfaMedio) : 0;
      salida[o + 2] = alfaMedio > 0 ? Math.round(b / n / alfaMedio) : 0;
      salida[o + 3] = Math.round(a / n);
    }
  }
  return salida;
}

/**
 * Compone sobre un fondo opaco. iOS no admite alpha en el icono de la pantalla
 * de inicio: lo que esté transparente lo pinta de negro sin avisar.
 *
 * `fondo` es [arriba, abajo] y se interpola por filas. Un color único bastaría
 * si la placa fuera plana, pero tiene un degradado vertical y las esquinas
 * rellenas se notaban como cuatro parches: claros abajo, oscuros arriba.
 */
function aplanar(px, lado, fondo) {
  const [arriba, abajo] = fondo;
  for (let y = 0; y < lado; y++) {
    const t = lado === 1 ? 0 : y / (lado - 1);
    const f = [0, 1, 2].map((c) => arriba[c] + (abajo[c] - arriba[c]) * t);
    for (let x = 0; x < lado; x++) {
      const i = (y * lado + x) * 4;
      const a = px[i + 3] / 255;
      px[i] = Math.round(px[i] * a + f[0] * (1 - a));
      px[i + 1] = Math.round(px[i + 1] * a + f[1] * (1 - a));
      px[i + 2] = Math.round(px[i + 2] * a + f[2] * (1 - a));
      px[i + 3] = 255;
    }
  }
  return px;
}

/** El dibujo encogido y centrado sobre el fondo, para el icono `maskable`. */
function conMargen(px, lado, fraccion, fondo) {
  const dentro = Math.round(lado * fraccion);
  const desfase = Math.round((lado - dentro) / 2);
  const salida = new Uint8Array(lado * lado * 4);
  const [arriba, abajo] = fondo;
  for (let y = 0; y < lado; y++) {
    const t = y / (lado - 1);
    for (let x = 0; x < lado; x++) {
      const i = (y * lado + x) * 4;
      for (const c of [0, 1, 2]) salida[i + c] = Math.round(arriba[c] + (abajo[c] - arriba[c]) * t);
      salida[i + 3] = 255;
    }
  }
  for (let y = 0; y < dentro; y++) {
    for (let x = 0; x < dentro; x++) {
      const origen = (Math.floor((y * lado) / dentro) * lado + Math.floor((x * lado) / dentro)) * 4;
      const destino = ((y + desfase) * lado + x + desfase) * 4;
      salida[destino] = px[origen];
      salida[destino + 1] = px[origen + 1];
      salida[destino + 2] = px[origen + 2];
      salida[destino + 3] = 255;
    }
  }
  return salida;
}

// ─── El badge: sigue dibujado a mano ─────────────────────────────────────────

/** Distancia de un punto al segmento AB. Con esto se dibuja un trazo grueso. */
function distanciaASegmento(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const largo2 = vx * vx + vy * vy;
  let t = largo2 === 0 ? 0 : ((px - ax) * vx + (py - ay) * vy) / largo2;
  t = Math.max(0, Math.min(1, t));
  const dx = px - (ax + t * vx);
  const dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

/** Silueta blanca sobre transparente: Android recolorea y descarta el color. */
function dibujarBadge(lado, escala) {
  const px = new Uint8Array(lado * lado * 4);
  const c = lado / 2;
  const r = lado * escala;

  const p1 = [-0.42, 0.02];
  const p2 = [-0.12, 0.32];
  const p3 = [0.45, -0.3];
  const grosor = 0.145 * r;
  // Suavizado: en vez de pintar el píxel entero, se mide cuánto entra en el
  // trazo. Sin esto los bordes diagonales salen en escalera.
  const borde = Math.max(0.8, lado / 192);

  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      const i = (y * lado + x) * 4;
      const cx = x + 0.5;
      const cy = y + 0.5;
      const d = Math.min(
        distanciaASegmento(cx, cy, c + p1[0] * r, c + p1[1] * r, c + p2[0] * r, c + p2[1] * r),
        distanciaASegmento(cx, cy, c + p2[0] * r, c + p2[1] * r, c + p3[0] * r, c + p3[1] * r)
      );
      const cobertura = Math.max(0, Math.min(1, (grosor - d) / borde + 0.5));
      px[i] = 255;
      px[i + 1] = 255;
      px[i + 2] = 255;
      px[i + 3] = Math.round(255 * cobertura);
    }
  }
  return px;
}

// ─── Salidas ─────────────────────────────────────────────────────────────────
mkdirSync("public/icons", { recursive: true });

const fuente = leerPng(FUENTE);
const recorte = recorteCuadrado(fuente);

// Con qué se rellenan las esquinas —transparentes en la fuente, porque la placa
// es un cuadrado REDONDEADO dentro de un lienzo cuadrado—.
//
// Se muestrea en el eje central, al 8% de cada extremo. El 8% no es un número
// bonito: al 0% se cae en el reflejo del bisel (rgb(100,103,109) en el icono
// actual, contra rgb(33,35,38) del interior) y las esquinas salían grises,
// como un marco alrededor del icono. Hay que entrar lo bastante para pasar el
// borde y no tanto como para tocar el dibujo.
const MUESTRA = 0.08;

function muestrear(y) {
  const x = recorte.left + Math.round(recorte.lado / 2);
  const o = (y * fuente.ancho + x) * 4;
  // Sin nada opaco ahí, negro: es lo que iOS pondría por su cuenta.
  if (fuente.px[o + 3] < 200) return [0, 0, 0];
  return [fuente.px[o], fuente.px[o + 1], fuente.px[o + 2]];
}

const FONDO = [
  muestrear(recorte.top + Math.round(recorte.lado * MUESTRA)),
  muestrear(recorte.top + recorte.lado - 1 - Math.round(recorte.lado * MUESTRA))
];

const salidas = [
  // El manifest exige 192 y 512; sin ellos no es instalable.
  ["public/icons/icon-192.png", 192, "plano"],
  ["public/icons/icon-512.png", 512, "plano"],
  // `maskable`: Android recorta a la forma del lanzador, así que el dibujo se
  // encoge para caber en el 80% central pase lo que pase.
  ["public/icons/icon-512-maskable.png", 512, "maskable"],
  // iOS no lee el manifest para esto: usa `apple-touch-icon` y le pone él las
  // esquinas redondeadas, así que va a sangre y sin transparencia. El enlace
  // <link rel="apple-touch-icon"> lo emite `metadata.icons` en layout.tsx; sin
  // él este archivo no lo usa nadie.
  ["public/icons/apple-touch-icon-180.png", 180, "plano"],
  // La pestaña del navegador.
  ["public/icons/icon-32.png", 32, "plano"],
  // El badge es la silueta monocroma de la barra de estado en Android.
  ["public/icons/badge-72.png", 72, "badge"]
];

for (const [ruta, lado, modo] of salidas) {
  let px;
  if (modo === "badge") px = dibujarBadge(lado, 0.38);
  else if (modo === "maskable")
    px = conMargen(aplanar(reescalar(fuente, recorte, lado), lado, FONDO), lado, 0.8, FONDO);
  else px = aplanar(reescalar(fuente, recorte, lado), lado, FONDO);
  writeFileSync(ruta, png(lado, px, modo !== "badge"));
  console.log(`${ruta} (${lado}×${lado})`);
}
