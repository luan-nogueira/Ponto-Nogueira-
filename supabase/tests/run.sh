#!/usr/bin/env bash
# Roda os testes do banco num Postgres local com PostGIS. Cada arquivo *.test.sql
# roda num banco novo, com as migrações aplicadas.
# Uso: PGURL=postgres://postgres@localhost:5432/postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PGURL=${PGURL:-postgres://postgres@localhost:5432/postgres}
DB=ponto_teste_$$
trap 'psql "$PGURL" -qc "drop database if exists $DB" >/dev/null' EXIT
URL=$(echo "$PGURL" | sed "s#/[^/]*\$#/$DB#")
run() { psql "$URL" -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null; }
for t in tests/*.test.sql; do
  psql "$PGURL" -qc "drop database if exists $DB" >/dev/null
  psql "$PGURL" -qc "create database $DB" >/dev/null
  run tests/supabase_stub.sql
  for f in migrations/*.sql; do run "$f"; done
  psql "$URL" -v ON_ERROR_STOP=1 -qtA -o /dev/null -f "$t" 2>&1 | sed "s/^psql:[^ ]* NOTICE:  //"
done
echo "Todos os testes passaram"
