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
STAGE=$(mktemp -d /tmp/brivia-sql.XXXX); cp -r "$SQL"/*.sql "$STAGE"/; mkdir "$STAGE/tests"; cp "$HERE"/*.sql "$STAGE/tests/"; # KNOWN CONFLICT: schema.sql/blocking.sql declare text columns with an FK to profiles(id uuid), which
# PostgreSQL rejects. Staged copies (never the repo files) drop just that FK; see Ruling P2.
sed -i -E 's/(text not null) references public\.profiles\(id\) on delete cascade/\1/' "$STAGE"/schema.sql "$STAGE"/blocking.sql
chmod -R a+rX "$STAGE"
trap 'cleanup; rm -rf "$STAGE"' EXIT

run() { echo "== $1"; "${PSQL[@]}" -d $DB -f "$STAGE/$1"; }
run tests/supabase-stub.sql
# Fixed migration order. storage statements load against the stub, so nothing is skipped.
for f in schema.sql auth-hardening.sql blocking.sql gender-phone-fields.sql add-cover-support.sql connection-removal.sql; do run "$f"; done
if [ -f "$SQL/p0-privacy-consent.sql" ]; then run p0-privacy-consent.sql; else echo "== (p0-privacy-consent.sql missing)"; fi
for t in "$STAGE"/tests/*.test.sql; do run "tests/$(basename "$t")"; done
echo "ALL PASSED"
