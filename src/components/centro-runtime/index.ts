// src/components/centro-runtime/index.ts
// El ÚNICO sitio que conoce qué secciones existen (D-188). Cada import registra
// su componente al cargarse; el renderer importa este archivo y pregunta al
// registro. Una sección nueva = su archivo + una línea aquí.

import "./secciones/Hero";
import "./secciones/Narrativa";
import "./secciones/Tareas";
import "./secciones/Atajos";
import "./secciones/Mensajes";
import "./secciones/Lista";
import "./secciones/Metricas";
import "./secciones/Tabla";
import "./secciones/Grafica";
import "./secciones/Tarjetas";
import "./secciones/LineaDeTiempo";
import "./secciones/IrA";
import "./secciones/Recomendaciones";
import "./secciones/Insight";
import "./secciones/Portafolio";
import "./secciones/Movimientos";
import "./secciones/Watchlist";
import "./secciones/Rutina";
import "./secciones/PropuestaMovimiento";

export { registroDeSecciones } from "./registro";
