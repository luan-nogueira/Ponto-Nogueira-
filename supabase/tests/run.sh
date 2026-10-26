#!/usr/bin/env bash
# Roda os testes do banco num Postgres local com PostGIS.
# Uso: PGURL=postgres://postgres@localhost:5432/postgres ./supabase/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PGURL=${PGURL:-postgres://postgres@localhost:5432/postgres}
DB=ponto_teste_$$
psql "$PGURL" -qc "create database $DB" >/dev/null
trap 'psql "$PGURL" -qc "drop database if exists $DB" >/dev/null' EXIT
URL=$(echo "$PGURL" | sed "s#/[^/]*\$#/$DB#")
run() { psql "$URL" -v ON_ERROR_STOP=1 -q -f "$1" >/dev/null; }
run tests/supabase_stub.sql
for f in migrations/*.sql; do run "$f"; done
psql "$URL" -v ON_ERROR_STOP=1 -qtA -o /dev/null -f tests/regras.test.sql 2>&1 | sed "s/^psql:[^ ]* NOTICE:  //"
echo "Todos os testes passaram"
