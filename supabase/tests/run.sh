#!/usr/bin/env bash
# Local verification harness (Ruling P1). Never touches a remote Supabase project.
# Starts a throwaway PostgreSQL 16 cluster under /tmp, loads stub + migrations + tests, then shuts it down.
# Usage: bash supabase/tests/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; SQL="$(dirname "$HERE")"
BIN=/usr/lib/postgresql/16/bin; PORT=${PGTEST_PORT:-54329}; DATA=/tmp/brivia-pgtest-data; DB=brivia_test
as_pg() { if [ "$(id -u)" = 0 ]; then runuser -u postgres -- "$@"; else "$@"; fi; }
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(as_pg "$BIN/psql" -h /tmp -p "$PORT" -X -q -v ON_ERROR_STOP=1)

cleanup() { as_pg "$BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$DATA"; }
trap cleanup EXIT
cleanup
as_pg "$BIN/initdb" -D "$DATA" -A trust >/dev/null
as_pg "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp -c listen_addresses=''" -w -l "$DATA/log" start >/dev/null
"${PSQL[@]}" -d postgres -c "create database $DB"

# Files are copied to /tmp so the postgres OS user can read them.
STAGE=$(mktemp -d /tmp/brivia-sql.XXXX); trap 'cleanup; rm -rf "$STAGE"' EXIT
mkdir "$STAGE/migrations" "$STAGE/tests" "$STAGE/seed"
cp "$SQL"/migrations/*.sql "$STAGE/migrations/"; cp "$HERE"/*.sql "$STAGE/tests/"
cp "$SQL"/seed/*.sql "$STAGE/seed/"
chmod -R a+rX "$STAGE"

run() { echo "== $1"; "${PSQL[@]}" -d $DB -f "$STAGE/$1"; }

# 1) The baseline alone must be secure by default: stub + 0001 only, then the baseline test.
"${PSQL[@]}" -d postgres -c "create database ${DB}_0001"
( DB=${DB}_0001; echo "## database $DB (0001 only)"
  run tests/supabase-stub.sql; run migrations/0001_baseline.sql; run tests/baseline.test.sql )

# 2) Full chain.
echo "## database $DB (all migrations)"
run tests/supabase-stub.sql
# Migrations in lexical order, applied twice: the second pass proves every file is idempotent.
for pass in 1 2; do
  for m in "$STAGE"/migrations/*.sql; do run "migrations/$(basename "$m")"; done
done
for t in "$STAGE"/tests/*.test.sql; do
  [ "$(basename "$t")" = seed.test.sql ] && continue   # needs the seed: runs in its own database below
  run "tests/$(basename "$t")"
done

# 3) Seed + purge (Task 7): own database so the other suites never see test members. The seed runs as the
#    owner (here postgres, session_user = current_user), exactly like the SQL editor; it is run twice (idempotent).
"${PSQL[@]}" -d postgres -c "create database ${DB}_seed"
( DB=${DB}_seed; echo "## database $DB (seed and purge)"
  run tests/supabase-stub.sql
  for m in "$STAGE"/migrations/*.sql; do run "migrations/$(basename "$m")"; done
  run seed/purge-test-members.sql   # safe when nothing is seeded
  run seed/test-members.sql; run seed/test-members.sql
  "${PSQL[@]}" -d $DB -v phase=seeded -f "$STAGE/tests/seed.test.sql"
  "${PSQL[@]}" -d $DB -v phase=extras -f "$STAGE/tests/seed.test.sql"
  run seed/purge-test-members.sql; run seed/purge-test-members.sql
  "${PSQL[@]}" -d $DB -v phase=purged -f "$STAGE/tests/seed.test.sql" )
echo "ALL PASSED"
