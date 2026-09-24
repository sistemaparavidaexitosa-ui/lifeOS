"use client";

import { createContext } from "react";

/**
 * Lo que las secciones del agente necesitan del entorno y no viene en `data`:
 * hoy solo el workspace, porque `Recomendaciones` llama a `acceptProposal` con
 * él. Un contexto y no una prop más en `PropsDeSeccion`: el contrato de
 * sección es igual para las 24, y esto es solo del agente.
 */
export const ContextoDelAgente = createContext<{ workspaceId: string | null }>({ workspaceId: null });
