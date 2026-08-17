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
