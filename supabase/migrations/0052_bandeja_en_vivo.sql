-- 0052_bandeja_en_vivo.sql
--
-- QUE LA CAMPANA SE ENTERE SIN RECARGAR.
--
-- La bandeja (0049) se lee en cada render del layout, así que el contador se
-- actualiza al navegar. Con la app abierta y quieta —que es exactamente lo que
-- pasa mientras trabajas— no se entera de nada: alguien te menciona, el
-- teléfono suena, y la pestaña que tienes delante sigue diciendo cero.
--
-- POR QUÉ ESTA TABLA SÍ Y `tasks` NO
-- La 0039 dejó escrito el criterio: cada tabla publicada es tráfico que sale
-- del servidor en CADA escritura, y publicar `tasks` haría que cualquier
-- movimiento del tablero se emitiera a todo el mundo. `notifications` es el
-- caso contrario y por eso entra: sus filas son de UNA persona, se escriben
-- pocas veces al día, y Realtime aplica la RLS del suscriptor — nadie recibe
-- el evento de la bandeja de otro.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
