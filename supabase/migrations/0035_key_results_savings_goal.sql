-- 0035_key_results_savings_goal.sql
--
-- QUE UN AHORRO TAMBIÉN PUEDA SOSTENER UNA META PERSONAL.
--
-- `key_results` es el único sitio donde los módulos se tocan de verdad: un
-- resultado clave declara de qué fuente sale su número y el dominio lo calcula,
-- en vez de que el usuario teclee un progreso que se desactualiza. Desde 0024
-- conoce cuatro fuentes: hábito, proyecto, libro y meta financiera.
--
-- Y ahí se quedó Ahorros fuera, sin ninguna razón de diseño: `savings_goals` es
-- una tabla hermana de `financial_goals` —mismo `current_amount`, mismo
-- `target`— y una meta personal del tipo "juntar el fondo de emergencia" no se
-- podía medir contra el ahorro que existe precisamente para eso. El usuario
-- tenía que elegir entre una fuente equivocada o capturarlo a mano, que es lo
-- que este módulo existe para evitar.
--
-- Se amplía el `check`, no se crea nada: `source_id` sigue siendo un uuid SIN
-- FK a propósito (apunta ya a cinco tablas), y si la fuente desaparece la capa
-- de dominio marca el resultado como `stale` en vez de mostrar 0% como dato
-- real. La misma decisión de 0024, ahora con un destino más.

alter table public.key_results
  drop constraint if exists key_results_source_kind_check;

alter table public.key_results
  add constraint key_results_source_kind_check
  check (source_kind in ('habit', 'project', 'book', 'financial_goal', 'savings_goal', 'manual'));

comment on column public.key_results.source_kind is
  'Cinco fuentes automáticas (habit/project/book/financial_goal/savings_goal) y una manual. Ampliar esta lista exige tocar SourceSnapshot en domain/development/goals.ts: un valor que la base acepte y el dominio no sepa leer deja el resultado clave en 0% para siempre.';
