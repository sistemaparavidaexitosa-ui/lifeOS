"use client";

import { createContext } from "react";

/**
 * Lo que las secciones del agente necesitan del entorno y no viene en `data`:
 * el workspace, porque `Recomendaciones` llama a `acceptProposal` con él, y
 * desde D-204 también cómo mandar el turno siguiente o llevar el foco al
 * compositor. Un contexto y no una prop más en `PropsDeSeccion`: el contrato
 * de sección es igual para las 24, y esto es solo del agente.
 */
export const ContextoDelAgente = createContext<{
  workspaceId: string | null;
  /** D-204: una sección puede mandar un turno nuevo (confirmación, «No es esto»). */
  enviar?: (texto: string) => void;
  /** D-204: lleva el foco al compositor («Otra cosa»). */
  enfocar?: () => void;
}>({ workspaceId: null });
