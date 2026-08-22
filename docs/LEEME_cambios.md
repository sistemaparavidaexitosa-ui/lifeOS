# Cambios en `src/app/(app)/execution` — lista exacta de archivos

Ruta destino de todo: `src/app/(app)/execution/`

## 1) Archivos NUEVOS (copiar tal cual)
| Archivo | Qué hace |
|---|---|
| `ProjectMenu.tsx` | Menú de tres puntitos (⋯) por proyecto: Editar proyecto · Bitácora · Base de conocimiento, en un Drawer lateral bajo demanda. |
| `EditProjectForm.tsx` | Formulario de "Editar proyecto" que usa la nueva Server Action `updateProject`. |

## 2) Archivos a REEMPLAZAR completos
| Archivo | Qué cambió |
|---|---|
| `MondayRow.tsx` | **Punto 1**: botón de eliminar (🗑) por fila, en tareas raíz y subtareas, con confirmación. Nueva prop `onDelete`. |
| `MondayBoard.tsx` | **Punto 1**: `handleDeleteTask` (borra la tarea + sus descendientes del estado local y llama a `deleteTask`). Pasa `onDelete` a cada fila. |
| `page.tsx` | **Punto 2**: mete `ProjectMenu` en el encabezado y quita la exhibición fija de Logbook/Knowledge al final. **Punto 3**: elimina `NewTaskForm`; el Tablero se renderiza siempre (incluso con 0 tareas) para poder crear la primera tarea inline. |

## 3) Archivo a MODIFICAR (solo agregar 2 funciones)
| Archivo | Qué agregar |
|---|---|
| `actions.ts` | Pega al final las funciones `deleteTask` y `updateProject` que están en `actions_ADD.ts.md`. |

## 4) Archivo que queda SIN USO (opcional borrar)
- `NewTaskForm.tsx` — ya no se importa en ningún lado. Puedes eliminarlo o dejarlo; no afecta el build.

---

## Notas de por qué así
- **Borrado en cascada de subtareas**: `tasks.parent_task_id` ya tiene `ON DELETE CASCADE`
  (migración `0018_execution_monday_upgrade.sql`). `deleteTask` solo borra la fila raíz y la
  base de datos elimina las subtareas; en el cliente `handleDeleteTask` replica ese efecto para
  no recargar. **No se necesita ninguna migración nueva.**
- **RLS**: `deleteTask`/`updateProject` no requieren cambios de políticas — `tasks_write` y
  `projects_update_edit` (vía `can_edit_project`) ya cubren el borrado/edición.
- **Punto 3 sin formulario**: la fila "+ Agregar tarea" (`QuickAddRow`, ya existente) vive dentro
  de cada grupo del Tablero. Como la migración `0019` garantiza al menos el grupo "General" por
  proyecto, un proyecto nuevo (0 tareas) ya muestra esa fila para capturar la primera tarea.

## Verificación local sugerida
```bash
pnpm typecheck   # tsc --noEmit
pnpm lint
pnpm build
```
No hay `db reset` ni migraciones nuevas en esta entrega.

---

# Rediseño del flujo de proyectos (Execution OS) — monday.com / ClickUp

Entrega enfocada en **cómo se trabajan los proyectos**: flujo (navegación),
lógica (qué se puede hacer y con qué reglas) y visualización.

## 1) Flujo
- `/execution` deja de ser una **lista-acordeón** y pasa a un **workspace de 2
  paneles**: navegador de tableros a la izquierda (búsqueda, filtro En
  curso/Todos, avance y vencidas por tablero) y área de trabajo a la derecha.
  En móvil el navegador se pliega en "▸ Tableros".
- Sin tablero seleccionado se muestra el **portafolio** (`ProjectsOverview`):
  activos, tareas abiertas, vencidas y avance promedio + tarjetas por proyecto.
- **Cambiar de vista ya no navega**: Tablero / Kanban / Tabla / Timeline
  comparten estado, filtros y selección (`BoardShell`). La URL (`?view=`) se
  mantiene sincronizada para poder compartir el enlace.

## 2) Lógica
- **Orden manual** de tareas (migración `0021_execution_board_order.sql`,
  columna `tasks.position`): arrastrar una fila la reordena; soltarla sobre el
  **centro** de otra la convierte en **subtarea** (con guarda anti-ciclos);
  soltarla sobre un grupo la mueve de grupo.
- **Filtros compartidos**: texto, estado, prioridad, personas, fechas
  (vencidas / hoy / próximos 7 días / sin fecha) y "solo trabajo vivo". El
  filtro conserva la jerarquía: si coincide una subtarea, se muestran sus
  padres como contexto.
- **Acciones masivas** sobre la selección: cambiar estado, mover de grupo y
  eliminar. El cambio masivo de estado **valida cada transición** con la misma
  máquina de estados del servidor (FR-EXE-003/004/005, BR-014) y reporta las
  tareas rechazadas en vez de forzarlas.
- **Prioridad y urgencia inline** (`PriorityMenu`), que alimentan la matriz
  Eisenhower sin salir del tablero.
- **Grupos**: colapsables (preferencia guardada por proyecto en
  `localStorage`), con color editable, reordenables, con progreso y
  distribución de estados.
- Se eliminó `updateTaskStatusFromTree`, que escribía `status` sin validar la
  transición: hoy **todo** cambio de estado pasa por `setTaskStatus`.

## 3) Visualización
- Filas con casilla de selección, asa de arrastre, indicadores de destino
  (línea azul arriba/abajo = insertar, borde = anidar), avance de subtareas,
  chip de fechas en rojo cuando la tarea está vencida y chip "Urgente".
- **Kanban** con color por estado, límite WIP, grupo, prioridad, responsables
  y vencimiento.
- **Tabla**: rejilla plana ordenable con edición inline (reemplaza la vista
  "Lista", que apilaba un Drawer por tarea, y la antigua `TaskTable`).
- **Timeline**: Gantt ligero con barras por tarea, línea de HOY, escala
  semanal y bandeja de tareas sin fechas.

## 4) Archivos
| Nuevos | |
|---|---|
| `src/lib/domain/board.ts` + `tests/domain/board.test.ts` | Filtros, orden, estadísticas, timeline y guardas de jerarquía (puro y testeado) |
| `execution/board-types.ts` | Modelo único de tarea de tablero y contrato `BoardApi` |
| `execution/board-actions.ts` | Reordenar, mover de grupo, color/orden de grupos, prioridad y acciones masivas |
| `execution/BoardShell.tsx` | Estado del tablero (dueño único) |
| `execution/BoardToolbar.tsx`, `BulkActionBar.tsx`, `GroupHeader.tsx`, `PriorityMenu.tsx` | Barra de vistas/filtros, acciones masivas, encabezado de grupo, prioridad |
| `execution/ProjectSidebar.tsx`, `ProjectsOverview.tsx`, `BoardHeader.tsx` | Navegador de tableros, portafolio y encabezado del tablero |
| `execution/TableView.tsx`, `TimelineView.tsx` | Vistas Tabla y Timeline |
| `supabase/migrations/0021_execution_board_order.sql` | `tasks.position` + backfill idempotente por `created_at` |

| Eliminados | Motivo |
|---|---|
| `TreeView.tsx`, `TreeItemNode.tsx` | La jerarquía Group → Item → Subitem y el reparentado por arrastre ya viven en el Tablero |
| `ProjectRow.tsx` | Sustituido por `ProjectSidebar` |
| `TaskTable.tsx`, `NewTaskForm.tsx` | Ya eran código muerto; su función la cubre `TableView` / `QuickAddRow` |
| `ViewToggle.tsx` | Las vistas son pestañas dentro de `BoardToolbar` (sin navegación) |

## 5) Verificación
```bash
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build
supabase db reset   # aplica 0021_execution_board_order.sql
```
> Si `0021` aún no está aplicada, el tablero sigue funcionando con el orden
> histórico por `created_at` y muestra un aviso: el arrastre queda desactivado
> hasta correr la migración.

---

# Fix: la app usaba el reloj del servidor, no el del usuario

**Síntoma reportado:** `/home` saludaba "Buenas noches" a la 1 de la tarde en
México.

**Causa real (más amplia que el saludo):** `todayLocal()` calculaba el día con
la zona horaria del proceso. En Vercel el servidor corre en UTC, así que entre
las 18:00 y la medianoche hora de México todo el backend ya estaba en el día
siguiente. Eso afectaba:

| Dónde | Qué pasaba mal |
|---|---|
| `/habits` | Un hábito marcado a las 8 pm se registraba con la fecha de mañana (y rompía la racha) |
| `/planning` | El plan diario se leía/guardaba con `local_date` de mañana |
| `/time` | "Asignar a hoy" mandaba la tarea al día siguiente |
| `/reports`, `/money`, `/money/budget` | Los rangos del periodo se corrían un día |
| `/execution` | El conteo de vencidas de la barra lateral (servidor) podía contradecir los chips del tablero (navegador) |
| `/home` | Saludo y fecha de corte equivocados |

**Solución:** `profiles.timezone` (existe desde la migración 0002 y no se usaba
para calcular) ahora manda. La lógica pura está en
`src/lib/domain/datetime.ts` con 8 pruebas en `tests/domain/datetime.test.ts`,
incluida la regresión exacta del bug reportado. Cada vista y Server Action
obtiene la zona con `getUserTimeZone()` (`src/lib/data/profile.ts`), y el
tablero recibe el "hoy" ya calculado desde el servidor para que todas las
vistas coincidan.

Además, la zona horaria se valida al guardarla en Configuración/onboarding: un
valor que `Intl` no reconozca se rechaza con mensaje, y si alguno ya estuviera
guardado, la app cae a `America/Mexico_City` en vez de tronar.

**No requiere migración ni cambios en la base.**
