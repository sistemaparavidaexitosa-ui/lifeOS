-- 0027_intelligence_phase2.sql
-- Intelligence OS · Fase 2: bandeja, memoria, deduplicación y opt-in por
-- dominio (§5.2, §4.2 y §6 del spec del módulo).
--
-- Numeración: el spec pedía `0023` para la huella, pero ese número y los
-- siguientes ya se ocuparon mientras el motor esperaba. Es la tercera
-- renumeración del plan original; el orden de aplicación es lo que importa.

-- 1) Deduplicación (§5.2) ----------------------------------------------------
-- Con disparo bajo demanda el usuario puede analizar tres veces seguidas. Sin
-- huella, cada análisis vuelve a escribir las mismas recomendaciones y la
-- bandeja se convierte en un eco.
--
-- La huella es `type` + los factId citados, ordenados y hasheados: la calcula
-- la app (src/lib/domain/insights/fingerprint.ts) para poder probarla sin base
-- de datos.
alter table public.recommendations
  add column if not exists fingerprint text;

comment on column public.recommendations.fingerprint is
  'Fase 2 (§5.2): hash de type + los factId citados, ordenados. Identifica la MISMA recomendación entre análisis para refrescarla en vez de duplicarla.';

-- El índice es PARCIAL a propósito: solo las vivas (Presented) y las
-- silenciadas (Suppressed) bloquean un duplicado. Una descartada o aceptada ya
-- cumplió su ciclo y no debe impedir que el motor vuelva a plantear el tema
-- más adelante, cuando las cifras hayan cambiado.
create unique index if not exists recommendations_user_fingerprint_live
  on public.recommendations (user_id, fingerprint)
  where fingerprint is not null and status in ('Presented', 'Suppressed');

-- 2) Opt-in por dominio (§4.2) -----------------------------------------------
-- "Money apagado por defecto": el arreglo por defecto está VACÍO, así que
-- ningún dominio sale hacia el proveedor del modelo hasta que el usuario lo
-- encienda en /settings. Un arreglo y no siete banderas para que agregar un
-- dominio nuevo no sea otra migración.
alter table public.profiles
  add column if not exists ai_domains text[] not null default '{}';

comment on column public.profiles.ai_domains is
  'Fase 2 (§4.2): dominios cuyos hechos el usuario autoriza a enviar al modelo. Vacío = ninguno, que es el default deliberado. Se aplica en src/lib/insights/context.ts.';

-- 3) Integridad de la memoria (§6) -------------------------------------------
-- `origin` ya existía con default 'user' pero sin restricción. La memoria de
-- origen `ai` solo puede nacer de una recomendación aceptada; que la columna
-- admita cualquier cadena deja la puerta abierta a inventar orígenes.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'memory_items_origin_check'
  ) then
    alter table public.memory_items
      add constraint memory_items_origin_check check (origin in ('user', 'ai'));
  end if;
end $$;

-- Sin cambios de RLS/GRANT: las columnas nuevas heredan las políticas y grants
-- ya existentes de public.recommendations y public.profiles (0008 y 0002).
-- Mismo criterio que 0017 y 0026.
