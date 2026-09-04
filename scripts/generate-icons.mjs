#!/usr/bin/env node
// Genera los iconos PNG de la PWA:
//
//   node scripts/generate-icons.mjs
//
// POR QUÉ UN SCRIPT Y NO CINCO BINARIOS SUELTOS EN GIT
// Un PNG en el repo es una caja negra: nadie sabe de dónde salió, con qué
// color, ni cómo rehacerlo cuando cambie la marca. Así el icono es CÓDIGO —
// se lee, se revisa en un diff y se regenera con un comando.
//
// SIN DEPENDENCIAS (D-008): el PNG se escribe a mano (IHDR/IDAT/IEND) sobre
// `zlib`, que trae Node. Es menos de lo que parece: sin filtros, sin paleta y
// sin entrelazado, un PNG es una cabecera y un array de píxeles comprimido.
//
// El dibujo es la palomita de `IconCheck` (src/components/icons.tsx) en blanco
// sobre el verde de marca (#0b8f75, el mismo `themeColor` de layout.tsx).

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const VERDE = [0x0b, 0x8f, 0x75];

// ─── PNG mínimo ──────────────────────────────────────────────────────────────
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

/** `pixeles` es RGBA de `lado*lado*4`. */
function png(lado, pixeles) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // 8 bits por canal
  ihdr[9] = 6; // RGBA
  // 10, 11, 12 = compresión, filtro y entrelazado estándar: todo en cero.

  // Cada scanline lleva delante su byte de filtro. Usamos 0 («ninguno»):
  // comprime algo peor que un filtro adaptativo, pero estas imágenes son
  // planas y el ahorro no compensa la complejidad.
  const crudo = Buffer.alloc(lado * (lado * 4 + 1));
  for (let y = 0; y < lado; y++) {
    crudo[y * (lado * 4 + 1)] = 0;
    pixeles.copy ? null : null;
    Buffer.from(pixeles.buffer, pixeles.byteOffset + y * lado * 4, lado * 4).copy(
      crudo,
      y * (lado * 4 + 1) + 1
    );
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(crudo, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

// ─── Dibujo ──────────────────────────────────────────────────────────────────

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

/**
 * @param escala fracción del lado que ocupa la palomita. Los iconos
 *   «maskable» la necesitan pequeña: Android recorta hasta un círculo
 *   inscrito y solo el 80% central está garantizado.
 */
function dibujar(lado, { fondo, escala }) {
  const px = new Uint8Array(lado * lado * 4);
  const c = lado / 2;
  const r = lado * escala;

  // La palomita, en coordenadas relativas a su caja.
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

      if (fondo) {
        // Blanco sobre verde: se mezclan los dos colores según la cobertura.
        px[i] = Math.round(fondo[0] + (255 - fondo[0]) * cobertura);
        px[i + 1] = Math.round(fondo[1] + (255 - fondo[1]) * cobertura);
        px[i + 2] = Math.round(fondo[2] + (255 - fondo[2]) * cobertura);
        px[i + 3] = 255;
      } else {
        // Sin fondo: blanco con transparencia. Es lo que pide el `badge` de
        // Android, que recolorea la silueta y descarta el color.
        px[i] = 255;
        px[i + 1] = 255;
        px[i + 2] = 255;
        px[i + 3] = Math.round(255 * cobertura);
      }
    }
  }
  return px;
}

mkdirSync("public/icons", { recursive: true });

const salidas = [
  // El manifest exige 192 y 512; sin ellos no es instalable.
  ["public/icons/icon-192.png", 192, { fondo: VERDE, escala: 0.34 }],
  ["public/icons/icon-512.png", 512, { fondo: VERDE, escala: 0.34 }],
  // `maskable`: Android recorta a su antojo, así que el dibujo se encoge para
  // caber en el 80% central pase lo que pase.
  ["public/icons/icon-512-maskable.png", 512, { fondo: VERDE, escala: 0.26 }],
  // iOS no lee el manifest para esto: usa `apple-touch-icon` y le pone él las
  // esquinas redondeadas, así que va a sangre y sin transparencia.
  ["public/icons/apple-touch-icon-180.png", 180, { fondo: VERDE, escala: 0.34 }],
  // El badge es la silueta monocroma de la barra de estado en Android.
  ["public/icons/badge-72.png", 72, { fondo: null, escala: 0.38 }]
];

for (const [ruta, lado, opciones] of salidas) {
  writeFileSync(ruta, png(lado, dibujar(lado, opciones)));
  console.log(`${ruta} (${lado}×${lado})`);
}
