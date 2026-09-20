// src/lib/domain/agents/registro.ts
// Dónde están los agentes (D-170) — lógica pura, probada en
// tests/domain/agents-registro.test.ts.
//
// POR QUÉ EXISTE
// Es el primer `Map<id, algo>` del repo, y hay que justificarlo: hasta ahora el
// patrón ha sido unión discriminada más `switch` explícito —`ejecutar()` en
// lib/ai/tools.ts, `decide()` en domain/automations/rules.ts— y ese patrón es
// mejor casi siempre, porque el compilador obliga a cubrir cada caso.
//
// Aquí no sirve. Un `switch` exige que el archivo que despacha CONOZCA a todos
// los candidatos, y eso es exactamente lo que impide que Coach, Manifestation o
// Insights se sumen sin tocar un archivo central. El registro invierte la
// dependencia: los agentes conocen al registro, el registro no conoce a nadie.
// Se paga con la pérdida de exhaustividad, y por eso existe contrato.ts.
//
// Es una FÁBRICA, no un singleton. El singleton vive en lib/agents/runtime.ts,
// que es la raíz de composición; si el estado compartido naciera aquí, cada
// test heredaría los agentes del anterior y la suite pasaría a depender del
// orden en que se ejecuta.

// Ruta relativa y con extensión, no `@/…`: ningún archivo de `domain/` usa el
// alias, porque los tests corren con Node a secas y Node no lo resuelve.
import type { ActionResult } from "../../supabase/errors.ts";
import { validarAgente } from "./contrato.ts";
import type { AgentId, AnyAgentDefinition } from "./types.ts";

export interface RegistroDeAgentes {
  /** Añade un agente. NO lanza (D-021): devuelve el motivo si no pudo ser. */
  registrar(def: AnyAgentDefinition): ActionResult;
  /** El agente con ese id, o `null`. Nunca lanza por un id desconocido. */
  obtener(id: AgentId): AnyAgentDefinition | null;
  /** Todos los agentes, ordenados por id. */
  listar(): AnyAgentDefinition[];
}

export function crearRegistro(): RegistroDeAgentes {
  const porId = new Map<AgentId, AnyAgentDefinition>();

  return {
    registrar(def) {
      const invalido = validarAgente(def);
      if (invalido) return { ok: false, reason: invalido };

      // Registrar dos veces el mismo id es un fallo de programación, no un dato
      // malo del usuario. Aun así no se lanza: que la aplicación entera no
      // arranque porque un agente secundario está duplicado es peor que
      // arrancar sin él y poder decirlo. Gana el primero, porque el segundo
      // reemplazando en silencio haría que el comportamiento dependiera del
      // orden de los imports.
      if (porId.has(def.id)) {
        return { ok: false, reason: `Ya hay un agente registrado con el identificador «${def.id}».` };
      }

      porId.set(def.id, def);
      return { ok: true };
    },

    obtener(id) {
      return porId.get(id) ?? null;
    },

    listar() {
      // Orden por id y no de inserción: el orden de inserción es el orden de
      // los imports, que nadie controla y que cambia al mover una línea. Un
      // listado estable es lo que permite compararlo en un test o pintarlo sin
      // que salte de sitio entre despliegues.
      return [...porId.values()].sort((a, b) => a.id.localeCompare(b.id));
    }
  };
}
