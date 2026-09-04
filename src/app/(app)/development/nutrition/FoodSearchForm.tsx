"use client";

import { useState, useTransition } from "react";
import { Field, FormActions } from "../FormSheet";
import { logFoodEntry, logMealFromRoutine } from "./actions";
import { scalePer100g, type Meal } from "@/lib/domain/development/nutrition.ts";
import type { FoodCandidate } from "@/lib/domain/development/nutrition-lookup.ts";

/**
 * Buscar un alimento y registrarlo.
 *
 * El buscador es OPCIONAL de principio a fin: si los dos proveedores caen, o
 * si el alimento no está en ninguno, se teclean los valores a mano y el diario
 * funciona igual. Por eso el formulario de captura manual no está escondido
 * tras el fallo de la búsqueda: está siempre, debajo.
 */
export default function FoodSearchForm({
  localDate,
  meal,
  close,
  habitId
}: {
  /**
   * El día del diario. Cadena vacía cuando se registra desde la rutina: ahí el
   * día lo resuelve el servidor con la zona del perfil (D-018), y el cliente
   * no tiene por qué saber qué día es.
   */
  localDate: string;
  meal: Meal;
  close: () => void;
  /**
   * Cuando la comida se registra DESDE la rutina: además de la entrada del
   * diario, marca el hábito. Una sola acción para las dos cosas, porque
   * hacerlas en dos pantallas es lo que hace que una se abandone.
   */
  habitId?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<FoodCandidate[]>([]);
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<FoodCandidate | null>(null);
  const [gramos, setGramos] = useState("100");

  async function buscar() {
    const q = query.trim();
    if (!q || buscando) return;
    setBuscando(true);
    setAviso(null);
    setError(null);
    try {
      const res = await fetch(`/api/development/food-lookup?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { ok: boolean; foods?: FoodCandidate[]; reason?: string };
      setResultados(data.foods ?? []);
      // `reason` con `ok` puede venir: es el caso de «los proveedores no
      // respondieron, esto es lo que teníamos guardado».
      setAviso(data.reason ?? (data.foods?.length ? null : "No se encontró nada. Puedes capturarlo a mano."));
    } catch {
      setAviso("No se pudo buscar. Puedes capturarlo a mano.");
    } finally {
      setBuscando(false);
    }
  }

  const gramosNum = Number(gramos) || 0;
  const previo = elegido ? scalePer100g(elegido.per100g, gramosNum) : null;

  return (
    <div className="flex flex-col gap-3">
      <Field label="Buscar alimento o código de barras">
        <div className="flex gap-1.5">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void buscar();
              }
            }}
            placeholder="avena, pechuga de pollo, 3017620422003"
            className="grow"
          />
          <button type="button" className="btn-ghost btn-sm" disabled={buscando} onClick={() => void buscar()}>
            {buscando ? "…" : "Buscar"}
          </button>
        </div>
      </Field>

      {aviso && (
        <div className="text-xs" style={{ color: "var(--muted)" }}>
          {aviso}
        </div>
      )}

      {resultados.length > 0 && (
        <div className="flex flex-col gap-1">
          {resultados.map((c) => (
            <button
              key={`${c.source}:${c.sourceRef}`}
              type="button"
              className="btn-ghost btn-sm"
              style={{ justifyContent: "flex-start", textAlign: "left" }}
              onClick={() => {
                setElegido(c);
                setGramos(String(c.servingG ?? 100));
              }}
            >
              <span>
                {c.name}
                {c.brand ? ` · ${c.brand}` : ""} — {c.per100g.kcal} kcal/100 g
              </span>
            </button>
          ))}
          {/* ODbL: la atribución viaja con el dato, no en un pie de página. */}
          {resultados.some((c) => c.source === "off") && (
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              Datos de Open Food Facts (ODbL) y USDA FoodData Central.
            </div>
          )}
        </div>
      )}

      <form
        action={(fd) =>
          startTransition(async () => {
            const result = habitId ? await logMealFromRoutine(habitId, fd) : await logFoodEntry(localDate, fd);
            if (!result.ok) {
              setError(result.reason ?? "No se pudo registrar.");
              return;
            }
            close();
          })
        }
        className="flex flex-col gap-3"
        style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
      >
        <input type="hidden" name="meal" value={meal} />
        {/*
          Los macros del alimento elegido van ocultos y SOLO cuando hay uno.
          Si se pintaran siempre convivirían con los campos visibles de captura
          manual bajo el mismo `name`, y `FormData.get` se queda con el primero
          — que iría vacío. Da igual: el servidor los recalcula y los vuelve a
          validar, porque esto lo edita cualquiera desde el navegador.
        */}
        {elegido && (
          <>
            <input type="hidden" name="kcal100" value={elegido.per100g.kcal} />
            <input type="hidden" name="protein100" value={elegido.per100g.proteinG} />
            <input type="hidden" name="carbs100" value={elegido.per100g.carbsG} />
            <input type="hidden" name="fat100" value={elegido.per100g.fatG} />
          </>
        )}

        <Field label="Alimento">
          <input name="name" required defaultValue={elegido?.name ?? ""} key={elegido?.sourceRef ?? "manual"} />
        </Field>
        <Field label="Marca (opcional)">
          <input name="brand" defaultValue={elegido?.brand ?? ""} key={`b-${elegido?.sourceRef ?? "manual"}`} />
        </Field>

        <div className="flex gap-2">
          <Field label="Gramos" className="grow">
            <input name="grams" type="number" min="1" max="5000" step="1" required value={gramos} onChange={(e) => setGramos(e.target.value)} />
          </Field>
          {!elegido && (
            <Field label="kcal / 100 g" className="grow">
              <input name="kcal100" type="number" min="0" max="900" step="1" required />
            </Field>
          )}
        </div>

        {!elegido && (
          <div className="flex gap-2">
            <Field label="Prot. /100 g" className="grow">
              <input name="protein100" type="number" min="0" max="100" step="0.1" defaultValue="0" />
            </Field>
            <Field label="Carb. /100 g" className="grow">
              <input name="carbs100" type="number" min="0" max="100" step="0.1" defaultValue="0" />
            </Field>
            <Field label="Grasa /100 g" className="grow">
              <input name="fat100" type="number" min="0" max="100" step="0.1" defaultValue="0" />
            </Field>
          </div>
        )}

        {previo && (
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            {gramosNum} g → {previo.kcal} kcal · P {previo.proteinG} g · C {previo.carbsG} g · G {previo.fatG} g
          </div>
        )}

        {error && (
          <div className="text-xs" style={{ color: "var(--danger)" }}>
            {error}
          </div>
        )}

        <FormActions pending={pending} onCancel={close} saveLabel="Registrar" />
      </form>
    </div>
  );
}
