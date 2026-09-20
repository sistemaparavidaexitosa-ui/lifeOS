-- 0071_centro_lienzo.sql
--
-- EL CENTRO HABLA Y ESCUCHA (D-168).
--
-- Dos añadidos pequeños que cierran dos huecos que el usuario notó al usar el
-- centro agéntico (D-167): que no le contaba cómo iba, y que no había dónde
-- escribirle.
--
-- LA LISTA DE TIPOS ES ACUMULATIVA. Se copia entera y se le añade uno. Copiarla
-- de una migración antigua borra los que se añadieron después: pasó en 0070,
-- donde `arista` (de 0062) desapareció y el pgTAP de otra feature se puso rojo.
-- La lista de hoy, completa, es la de abajo.
alter table public.coach_proposals drop constraint if exists coach_proposals_tipo_check;
alter table public.coach_proposals add constraint coach_proposals_tipo_check
  check (tipo in ('tarea', 'bloque', 'rutina', 'estructura', 'meta', 'arista', 'foco', 'nota'));

comment on column public.coach_proposals.tipo is
  'Qué propone. `foco` (D-167) no crea nada: lleva a una pantalla. `nota` (D-168) es lo que se escribe en la barra del centro y acaba en un cuaderno; su payload lleva notebookId y cuerpo. El resto crean lo que dicen, siempre a través de la Server Action real (D-153).';

-- El «cómo voy» que el centro enseña bajo el saludo. Viaja en la MISMA llamada
-- que ya produce las sugerencias —un campo más en la respuesta—, así que no
-- cuesta ni una petición extra; se guarda aquí para que el resto de aperturas
-- de la franja lo lean gratis.
alter table public.centro_runs
  add column if not exists resumen text not null default '';

comment on column public.centro_runs.resumen is
  'Dos o tres frases sobre cómo va el día, escritas en la misma llamada que las sugerencias (D-168). Vacío = no hay nada que contar, y entonces el centro no pinta el bloque.';
