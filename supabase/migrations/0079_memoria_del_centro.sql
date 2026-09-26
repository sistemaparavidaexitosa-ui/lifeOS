--
-- LA MEMORIA QUE ESCRIBE EL CENTRO SOLO (D-204).
--
-- Hasta aquí la memoria de IA solo entraba con un clic de la persona (D-089).
-- La persona decidió que el Centro aprenda solo, pero visible: sus deducciones
-- llevan su propio origen para que /intelligence/memory las marque y el
-- contexto del modelo las lea como «puede equivocarse», nunca como órdenes.
alter table public.memory_items drop constraint if exists memory_items_origin_check;
alter table public.memory_items add constraint memory_items_origin_check
  check (origin in ('user', 'ai', 'centro'));

comment on column public.memory_items.origin is
  'Quién redactó la memoria: `user` (la persona), `ai` (propuesta del chat que la persona confirmó, D-089) o `centro` (deducida por el Centro sin preguntar, caduca a los 90 días, D-204).';
