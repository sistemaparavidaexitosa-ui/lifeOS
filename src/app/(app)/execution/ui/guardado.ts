"use client";

// Lo que el aparato recuerda por proyecto. Es comodidad de esta persona en
// este aparato, nada más: si el navegador no deja guardar (modo privado,
// datos borrados) la página funciona igual con los valores por defecto.
//
// - usePreferenciasLista: la ficha, la forma de la Lista y lo plegado, en una
//   cookie que el servidor lee (page.tsx) para pintar ya la lista como se
//   dejó.
// - useGuardado: lo que no cambia el primer pintado (lo reciente de la
//   búsqueda), en el almacenamiento del navegador, leído después de montar.

import { useCallback, useEffect, useState } from "react";
import { cookiePreferencias, escribirPreferencias, type PreferenciasLista } from "@/lib/domain/execution/arbol.ts";

const MEDIO_ANIO = 60 * 60 * 24 * 182;

export function usePreferenciasLista(
  projectId: string,
  inicial: PreferenciasLista
): [PreferenciasLista, (cambio: (prev: PreferenciasLista) => PreferenciasLista) => void] {
  const [prefs, setPrefs] = useState(inicial);
  const actualizar = useCallback(
    (cambio: (prev: PreferenciasLista) => PreferenciasLista) => {
      setPrefs((prev) => {
        const siguiente = cambio(prev);
        try {
          // Solo bajo /execution: no viaja en las peticiones del resto de la app.
          document.cookie = `${cookiePreferencias(projectId)}=${encodeURIComponent(escribirPreferencias(siguiente))}; path=/execution; max-age=${MEDIO_ANIO}; samesite=lax`;
        } catch {
          // Sin cookies: se recuerda hasta recargar.
        }
        return siguiente;
      });
    },
    [projectId]
  );
  return [prefs, actualizar];
}

export function useGuardado<T>(
  clave: string,
  inicial: T,
  valido: (v: unknown) => v is T
): [T, (v: T | ((prev: T) => T)) => void] {
  const [valor, setValor] = useState<T>(inicial);

  useEffect(() => {
    try {
      const crudo = window.localStorage.getItem(clave);
      if (crudo === null) return;
      const leido: unknown = JSON.parse(crudo);
      if (valido(leido)) setValor(leido);
    } catch {
      // Sin almacenamiento: se queda el valor por defecto.
    }
    // `valido` es una función de módulo: no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);

  const guardar = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValor((prev) => {
        const siguiente = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          window.localStorage.setItem(clave, JSON.stringify(siguiente));
        } catch {
          // Igual que al leer: se pierde al recargar y ya.
        }
        return siguiente;
      });
    },
    [clave]
  );

  return [valor, guardar];
}

export function esListaDeTextos(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}
