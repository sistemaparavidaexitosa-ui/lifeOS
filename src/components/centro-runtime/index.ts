// src/components/centro-runtime/index.ts
// El ÚNICO sitio que conoce qué secciones existen (D-188). Cada import registra
// su componente al cargarse; el renderer importa este archivo y pregunta al
// registro. Una sección nueva = su archivo + una línea aquí.

import "./secciones/Hero";
import "./secciones/Narrativa";
import "./secciones/Tareas";
import "./secciones/Atajos";
import "./secciones/Mensajes";

export { registroDeSecciones } from "./registro";
