# `src/types/database.types.ts` — tablas del Personal Development OS (0024)

## Por qué existe este documento

`src/types/database.types.ts` se **genera** (`pnpm gen:types`), nunca se edita a
mano. La generación necesita `supabase` + Docker corriendo contra la base
enlazada, y el entorno donde se implementó la Fase 1 no tenía Docker — el mismo
caso que ya documentaron `docs/PATCH_database_types_fase3.md` y
`docs/CHECKS.md`.

Para que `pnpm typecheck` pudiera correr, las cinco tablas de la migración
`0024_personal_development.sql` se añadieron **a mano** al archivo, en la forma
exacta que produce el generador y en orden alfabético dentro de
`public.Tables`, para que el diff al regenerar sea vacío o mínimo:

- `key_results` (antes de `knowledge_items`)
- `personal_goals` (antes de `profiles`)
- `routine_runs`, `routine_steps`, `routines` (antes de `savings_goals`)

## Qué tienes que hacer

En cuanto tengas Docker y el proyecto enlazado:

```bash
supabase db reset      # aplica 0024
supabase test db       # corre 0007_rls_development.sql
pnpm gen:types         # sobrescribe database.types.ts con la verdad de la base
pnpm typecheck
```

Si `pnpm gen:types` produce un diff en estas cinco tablas, **gana el generado**:
significa que el parche a mano se desvió de la migración. El job `db` de
`.github/workflows/ci.yml` ya corre `supabase db reset` + `supabase test db` en
cada push, así que la migración y sus pruebas RLS sí están verificadas en CI —
lo único que no está verificado contra una base real es este archivo de tipos.

## Detalles de traducción SQL → TypeScript usados

| SQL | TypeScript |
| --- | --- |
| `numeric(20,6)` (`target`, `manual_current`) | `number` |
| `uuid[]` (`completed_step_ids`) | `string[]` |
| `date` (`horizon`, `local_date`) | `string` |
| `timestamptz` (`created_at`, `achieved_at`, …) | `string` |
| FK a `auth.users` | sin entrada en `Relationships` (el generador omite el esquema `auth`) |
| `source_id uuid` **sin FK** | `string \| null`, sin entrada en `Relationships` — es deliberado, apunta a cuatro tablas distintas |
