#!/usr/bin/env bash
# Comprueba que el backfill de 0045 coloca los datos legados donde toca.
#
# No puede ser una prueba pgTAP normal: `supabase test db` corre sobre el
# esquema YA migrado, donde habits.frequency y routine_steps no existen y los
# datos de partida son imposibles de crear. Así que el script aparta la
# migración, reconstruye la base en su estado anterior, siembra el fixture,
# aplica 0045 a mano y comprueba el resultado.
#
# CUIDADO: hace `supabase db reset`. Borra la base LOCAL.
set -euo pipefail

MIG="supabase/migrations/0045_habitos_dentro_de_rutinas.sql"
SEED="supabase/seed.sql"
TMP="$(mktemp -d)"

# En esta máquina `psql` NO está instalado en el host, pero sí dentro del
# contenedor de la base local. Se usa el que haya, y si no hay ninguno se dice
# por qué en vez de fallar con "command not found".
CONTENEDOR="$(docker ps --filter 'name=supabase_db_' --format '{{.Names}}' | head -1)"
if command -v psql >/dev/null 2>&1; then
  correr() { psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f "$1"; }
elif [ -n "$CONTENEDOR" ]; then
  # `-f -` no hace falta: psql lee de stdin, y ON_ERROR_STOP propaga el fallo
  # como código de salida distinto de cero, que es lo que `set -e` necesita.
  correr() { docker exec -i "$CONTENEDOR" psql -U postgres -v ON_ERROR_STOP=1 < "$1"; }
else
  echo "No encuentro psql ni el contenedor de la base local. ¿Corriste 'supabase start'?" >&2
  exit 1
fi

restaurar() {
  [ -f "$TMP/0045.sql" ] && mv "$TMP/0045.sql" "$MIG"
  [ -f "$TMP/seed.sql" ] && mv "$TMP/seed.sql" "$SEED"
  rmdir "$TMP" 2>/dev/null || true
}
trap restaurar EXIT

# La semilla también se aparta: está escrita para el esquema nuevo y no tiene
# nada que aportar a esta comprobación.
mv "$MIG" "$TMP/0045.sql"
mv "$SEED" "$TMP/seed.sql"

echo "→ Reconstruyendo la base en el estado anterior a 0045…"
supabase db reset

echo "→ Sembrando datos con la forma vieja…"
correr scripts/backfill/0045_fixture.sql

echo "→ Aplicando 0045…"
correr "$TMP/0045.sql"

echo "→ Comprobando…"
correr scripts/backfill/0045_asserts.sql

echo "✓ Backfill verificado."
