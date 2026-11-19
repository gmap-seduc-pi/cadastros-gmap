#!/usr/bin/env bash
# Recria um banco local, aplica as migrações e roda os testes.
# Uso: PGHOST=/tmp/pg PGPORT=5499 PGUSER=postgres ./supabase/testes/rodar_testes.sh
set -euo pipefail
cd "$(dirname "$0")/.."
psql -q -c "drop database if exists cadastros_teste" -c "create database cadastros_teste"
for f in testes/00_simular_supabase.sql migrations/*.sql; do
  psql -q -d cadastros_teste -v ON_ERROR_STOP=1 -f "$f" > /dev/null 2> >(grep -v NOTICE >&2)
done
psql -q -d cadastros_teste -v ON_ERROR_STOP=1 -f testes/01_testar_regras.sql 2>&1 | grep -v '^$'
