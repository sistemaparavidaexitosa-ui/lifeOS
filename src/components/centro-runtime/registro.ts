// src/components/centro-runtime/registro.ts
// Qué componente pinta cada tipo de sección (D-188). Probado en
// tests/domain/centro-runtime-registro.test.ts.
//
// EL RENDERER NO IMPORTA COMPONENTES. Los pide aquí por su `kind`, y cada
// componente se registra a sí mismo al importarse (`index.ts` los importa
// todos). Añadir una sección es crear un archivo y una línea en `index.ts`; el
// renderer no se entera.
//
// Misma forma que el registro del Kernel (domain/agents/registro.ts): devuelve
// `{ ok, reason }` en vez de lanzar, y ante un duplicado gana el primero, porque
// que el segundo sustituyera en silencio haría depender la pantalla del orden de
// los imports. Imports relativos con `.ts`: el runner de node lo carga sin Next.

import type { ComponentType } from "react";
import { esSectionKind, type DatosDe, type SectionKind } from "../../lib/domain/centro/runtime/secciones.ts";

export interface PropsDeSeccion<K extends SectionKind> {
  data: DatosDe<K>;
  title?: string;
  /** Llamar al seguir un enlace de la sección: apunta el evento y cierra el Centro. */
  alAceptar: (href: string) => void;
}

export type ComponenteDeSeccion<K extends SectionKind> = ComponentType<PropsDeSeccion<K>>;

export type ResultadoDeRegistro = { ok: true } | { ok: false; reason: string };

export interface RegistroDeSecciones {
  registrar<K extends SectionKind>(kind: K, componente: ComponenteDeSeccion<K>): ResultadoDeRegistro;
  componenteDe<K extends SectionKind>(kind: K): ComponenteDeSeccion<K> | null;
  registrados(): SectionKind[];
}

export function crearRegistroDeSecciones(): RegistroDeSecciones {
  const porKind = new Map<SectionKind, unknown>();

  return {
    registrar(kind, componente) {
      if (!esSectionKind(kind)) return { ok: false, reason: `«${String(kind)}» no es un tipo de sección del catálogo.` };
      // Función o componente envuelto (memo/forwardRef son objetos).
      const esComponente = typeof componente === "function" || (typeof componente === "object" && componente !== null);
      if (!esComponente) return { ok: false, reason: `Lo registrado para «${kind}» no es un componente.` };

      const previo = porKind.get(kind);
      if (previo !== undefined && previo !== componente) {
        return { ok: false, reason: `Ya hay un componente registrado para «${kind}».` };
      }
      porKind.set(kind, componente);
      return { ok: true };
    },

    componenteDe<K extends SectionKind>(kind: K) {
      return (porKind.get(kind) as ComponenteDeSeccion<K> | undefined) ?? null;
    },

    registrados() {
      return [...porKind.keys()].sort();
    }
  };
}

/** El registro de la aplicación. Las pruebas crean el suyo con `crearRegistroDeSecciones`. */
export const registroDeSecciones = crearRegistroDeSecciones();

/** Registrar y, si no se pudo, decirlo en la consola: un fallo aquí es de programación. */
export function registrarSeccion<K extends SectionKind>(kind: K, componente: ComponenteDeSeccion<K>): ResultadoDeRegistro {
  const r = registroDeSecciones.registrar(kind, componente);
  if (!r.ok) console.warn(`[centro-runtime] ${r.reason}`);
  return r;
}
