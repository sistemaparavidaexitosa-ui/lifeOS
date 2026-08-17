# Integración de Tree View — FASE 4

⚠️ **Nota de transparencia**: no tengo acceso al contenido exacto y actual de
`ViewToggle.tsx` ni de `execution/page.tsx` en esta sesión (el entorno se
reinició y no volviste a adjuntar el zip). En vez de reescribir estos 2
archivos a ciegas — arriesgando romper props, tipos o convenciones que
estableciste en las Fases 1-3 — te doy los cambios EXACTOS a aplicar
manualmente. Son pequeños y de bajo riesgo.

## 1) `ViewToggle.tsx`

Busca el array o union type que define las vistas soportadas. Según la
auditoría de Fase 1, hoy es algo como:

```ts
type ViewMode = "board" | "list" | "kanban";
```

Agrega `"tree"`:

```ts
type ViewMode = "board" | "list" | "kanban" | "tree";
```

Y en el array de botones/tabs (donde sea que se rendericen las opciones),
agrega una entrada más siguiendo el mismo patrón que las existentes, por
ejemplo:

```ts
{ value: "tree", label: "Árbol" }
```

Si `ViewToggle.tsx` usa un objeto de íconos por vista, agrega el ícono
correspondiente (puedes reutilizar cualquier ícono de árbol/carpeta ya
presente en `@/components/icons`, o usar el emoji 🌳 temporalmente si no
hay uno adecuado).

## 2) `execution/page.tsx`

Busca el bloque `{view === "kanban" && (...)}`  (o el condicional
equivalente que renderiza cada vista) y agrega, siguiendo el MISMO patrón
de props que ya usan `MondayBoard`/`KanbanBoard` (tasks, members,
onStatusChange, etc.):

```tsx
{view === "tree" && (
  <TreeView
    projectId={project.id}
    tasks={tasks as TreeNodeTask[]}
    groups={groups}
    onStatusChange={handleStatusChange}
    onReload={reloadTasks}
  />
)}
```

Donde:
- `tasks`: el mismo array que ya le pasas a `MondayBoard`/`KanbanBoard` (debe incluir `parent_task_id`, `group_id`, `status`, `title`, `id` — todos ya presentes desde la Fase 2).
- `groups`: nuevo — necesitas cargar `task_groups` del proyecto. Si `execution/page.tsx` es un Server Component que hace `supabase.from("tasks").select(...)`, agrega una query hermana:
  ```ts
  const { data: groups } = await supabase
    .from("task_groups")
    .select("id, name, color, position")
    .eq("project_id", project.id)
    .order("position");
  ```
  (Gracias al backfill idempotente de la migración 0019, todo proyecto ya tiene al menos el grupo "General" — nunca vendrá vacío.)
- `handleStatusChange`/`reloadTasks`: reutiliza los mismos callbacks que ya le pasas a `MondayBoard` — no crear nuevos.

## 3) Import necesario en `execution/page.tsx`

```ts
import TreeView, { type TreeGroup } from "./TreeView";
import type { TreeNodeTask } from "./TreeItemNode";
```

## Archivos de esta entrega (FASE 4) — resumen

| # | Archivo | Acción |
|---|---|---|
| 1 | `src/lib/domain/task-tree.ts` | **Nuevo** — lógica pura (childrenMap, guarda de ciclos, progreso) |
| 2 | `src/app/(app)/execution/tree-actions.ts` | **Nuevo** — Server Actions (reparentar, mover de grupo, CRUD de grupos) |
| 3 | `src/app/(app)/execution/TreeItemNode.tsx` | **Nuevo** — nodo recursivo con drag&drop |
| 4 | `src/app/(app)/execution/TreeView.tsx` | **Nuevo** — vista completa Group→Item→Subitem |
| 5 | `src/app/globals.css` | **Agrega al final** el contenido de `globals.css.append.fase4.txt` |
| 6 | `src/app/(app)/execution/ViewToggle.tsx` | **Edita manualmente** — 2 líneas, ver §1 arriba |
| 7 | `src/app/(app)/execution/page.tsx` | **Edita manualmente** — bloque condicional + query de `groups`, ver §2 arriba |

**No se toca** `MondayBoard.tsx`, `MondayRow.tsx`, `KanbanBoard.tsx`,
`TaskDetailPanel.tsx` — Tree View es 100% aditivo sobre el mismo modelo de
datos, sin duplicar ninguna query ni componente existente.

## Revisión de impacto

- **Cero tablas nuevas**: Tree View lee `tasks`/`task_groups` ya existentes desde la Fase 2.
- **Cero funciones RLS nuevas**: `tree-actions.ts` delega toda la autorización a las políticas ya definidas en la migración 0019 (`task_groups_write` vía `can_edit_project`).
- **Drag&drop nativo** (HTML5 `draggable`), sin agregar ninguna librería (`dnd-kit`, `react-beautiful-dnd`, etc.) al `package.json` — consistente con "no romper convenciones ni agregar dependencias innecesarias".
- Si en el futuro decides que `MondayBoard.tsx` también use `buildChildrenMap`/`isDescendant` de `task-tree.ts` en vez de su lógica inline, sería una limpieza de código muerto opcional para una fase posterior — no bloquea esta entrega.
