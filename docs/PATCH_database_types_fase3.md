# Parche para `src/types/database.types.ts` — FASE 3

Agrega este bloque dentro de `public.Tables`, junto a `task_history` (orden alfabético, no importa exactamente dónde):

```ts
task_files: {
  Row: {
    id: string
    task_id: string
    file_name: string
    storage_path: string
    size_bytes: number
    content_type: string
    uploaded_by: string
    created_at: string
  }
  Insert: {
    id?: string
    task_id: string
    file_name: string
    storage_path: string
    size_bytes?: number
    content_type?: string
    uploaded_by: string
    created_at?: string
  }
  Update: {
    id?: string
    task_id?: string
    file_name?: string
    storage_path?: string
    size_bytes?: number
    content_type?: string
    uploaded_by?: string
    created_at?: string
  }
  Relationships: [
    {
      foreignKeyName: "task_files_task_id_fkey"
      columns: ["task_id"]
      isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    },
  ]
}
```

No se requiere ningún otro cambio: `tasks.description` ya existía desde la Fase 2 (migración 0019), y el bucket `task-files` de Storage no necesita tipos TS adicionales (se usa vía `supabase.storage.from("task-files")`, sin tipado estricto de filas).

## Archivos de esta entrega (FASE 3)

| # | Archivo | Acción |
|---|---|---|
| 1 | `supabase/migrations/0020_task_files.sql` | **Nuevo** — cópialo tal cual |
| 2 | `supabase/tests/0005_rls_task_files.sql` | **Nuevo** — cópialo tal cual |
| 3 | `src/app/(app)/execution/task-detail-actions.ts` | **Reemplaza** el archivo completo |
| 4 | `src/app/(app)/execution/task-files-actions.ts` | **Nuevo** |
| 5 | `src/app/(app)/execution/TaskDescriptionField.tsx` | **Nuevo** |
| 6 | `src/app/(app)/execution/TaskFilesPanel.tsx` | **Nuevo** |
| 7 | `src/app/(app)/execution/TaskDetailPanel.tsx` | **Reemplaza** el archivo completo |
| 8 | `src/app/(app)/execution/MondayRow.tsx` | **Reemplaza** el archivo completo |
| 9 | `src/app/globals.css` | **Agrega al final** el contenido de `globals.css.append.txt` |
| 10 | `src/types/database.types.ts` | Agrega el bloque `task_files` de arriba |

**Ningún otro archivo se toca.** `KanbanBoard.tsx`, `TaskTable.tsx` y `execution/page.tsx` (vista Lista) siguen usando `TaskDetailPanel` exactamente igual que antes (modo no controlado) — automáticamente heredan el comportamiento de Drawer lateral sin ningún cambio de código, porque el cambio vive dentro de `TaskDetailPanel.tsx`.
