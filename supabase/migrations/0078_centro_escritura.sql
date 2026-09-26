-- 0078_centro_escritura.sql
--
-- EL CENTRO PROPONE CAMBIOS EN CUALQUIER TABLA DEL REGISTRO (D-203).
--
-- Un cambio que el modelo propone se guarda aquí como `tipo = 'cambio'` antes
-- de enseñarse, igual que las recomendaciones del Centro (D-194): la tarjeta
-- solo lleva el id, y `confirmarCambio` relee el payload, lo vuelve a validar
-- contra el registro y lo escribe por la server action de la sección.
--
-- LA LISTA DE TIPOS ES ACUMULATIVA (ver 0071). Esta es la de 0071 + 'cambio'.
alter table public.coach_proposals drop constraint if exists coach_proposals_tipo_check;
alter table public.coach_proposals add constraint coach_proposals_tipo_check
  check (tipo in ('tarea', 'bloque', 'rutina', 'estructura', 'meta', 'arista', 'foco', 'nota', 'cambio'));

comment on column public.coach_proposals.tipo is
  'Qué propone. `foco` (D-167) no crea nada: lleva a una pantalla. `nota` (D-168) acaba en un cuaderno. `cambio` (D-203) es crear/editar/borrar una fila de una tabla del registro de escritura del Centro; su payload lleva {operacion, tabla, id, campos, antes}. Todos se aplican por la Server Action real.';
