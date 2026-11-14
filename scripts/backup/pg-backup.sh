#!/bin/sh
# One backup: dump, verify, publish, prune. Safe to run at any time.
#
# Runs inside the `backup` service from docker-compose.yml. Connection details
# come from the standard libpq variables that service sets — PGHOST, PGUSER,
# PGPASSWORD, PGDATABASE — so this takes no arguments and holds no credentials.
#
# By hand, without waiting for the schedule:
#   docker compose run --rm backup /scripts/pg-backup.sh

set -eu

BACKUP_DIR=${BACKUP_DIR:-/backups}
RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}
MIN_KEEP=${BACKUP_MIN_KEEP:-7}
PREFIX=${PGDATABASE:-timezone_scheduler_db}

# A dump contains every row in the database, password hashes included. Keep it
# readable only by the user that wrote it.
umask 077

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

mkdir -p "$BACKUP_DIR" || die "cannot create $BACKUP_DIR"

stamp=$(date -u '+%Y%m%dT%H%M%SZ')
target="$BACKUP_DIR/$PREFIX-$stamp.dump"
partial="$target.partial"

# Written as .partial until it is known good, and removed on any exit that
# isn't a success: an interrupted dump must never be left sitting in the
# directory looking like a file you could restore from.
trap 'rm -f "$partial"' EXIT INT TERM

log "dumping $PREFIX from ${PGHOST:-?}"
pg_dump --format=custom --compress=6 --file="$partial" \
  || die "pg_dump failed — existing backups left untouched"

# Read the archive's table of contents back out. This catches a dump that was
# written but is truncated or corrupt, which otherwise only comes to light on
# the day you actually need it.
pg_restore --list "$partial" >/dev/null \
  || die "dump did not verify — discarding it"

mv "$partial" "$target"
trap - EXIT INT TERM
log "wrote $(basename "$target") ($(du -h "$target" | cut -f1))"

# Pruning runs only after a dump has succeeded and verified, so a stretch of
# failed runs can never age the good backups out from under you. The floor is
# the same idea: never drop below MIN_KEEP files however old they all are.
total=$(find "$BACKUP_DIR" -maxdepth 1 -type f -name "$PREFIX-*.dump" | wc -l | tr -d ' ')
deletable=$((total - MIN_KEEP))

if [ "$deletable" -le 0 ]; then
  log "done: $total backup(s), all kept (floor is $MIN_KEEP)"
  exit 0
fi

# -mmin, not -mtime: exact minutes rather than rounding to whole days.
expired=$(mktemp)
trap 'rm -f "$expired"' EXIT INT TERM
find "$BACKUP_DIR" -maxdepth 1 -type f -name "$PREFIX-*.dump" \
  -mmin "+$((RETENTION_DAYS * 1440))" | sort > "$expired"

# Names are zero-padded UTC timestamps, so sort order is age order: oldest go
# first, and the loop stops as soon as deleting more would breach the floor.
pruned=0
while read -r old; do
  [ "$deletable" -gt 0 ] || break
  rm -f "$old" && log "pruned $(basename "$old")"
  deletable=$((deletable - 1))
  pruned=$((pruned + 1))
done < "$expired"

log "done: $((total - pruned)) backup(s) in $BACKUP_DIR, $pruned pruned"
