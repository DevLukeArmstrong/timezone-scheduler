#!/bin/sh
# Entrypoint for the `backup` service: sleep until the next BACKUP_TIME, take
# one backup, repeat.
#
# Deliberately not cron. The postgres image ships no cron daemon, and adding
# one would mean installing packages at container start. A loop that recomputes
# the next run from the wall clock on every iteration also can't drift the way
# a fixed `sleep 86400` does, and it survives DST because `date` does the
# arithmetic.

set -eu

BACKUP_TIME=${BACKUP_TIME:-03:30}
SCRIPT_DIR=$(dirname "$0")

log() {
  echo "[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
}

# Matched strictly rather than just handed to `date`, which is lenient enough
# to accept "3pm" and "0330" and quietly schedule a typo at some hour nobody
# chose. A wrong BACKUP_TIME should stop the container, not move the backup.
case "$BACKUP_TIME" in
  [01][0-9]:[0-5][0-9] | 2[0-3]:[0-5][0-9]) ;;
  *)
    log "ERROR: BACKUP_TIME must be a 24-hour HH:MM time between 00:00 and 23:59, got '$BACKUP_TIME'"
    exit 1
    ;;
esac

log "backup service up: ${PGDATABASE:-?} on ${PGHOST:-?}, daily at $BACKUP_TIME $(date '+%Z'), keeping ${BACKUP_RETENTION_DAYS:-14} days (floor ${BACKUP_MIN_KEEP:-7})"

case "${BACKUP_ON_START:-false}" in
  true | 1 | yes)
    log "BACKUP_ON_START set — taking one now"
    "$SCRIPT_DIR/pg-backup.sh" || log "ERROR: startup backup failed"
    ;;
esac

while :; do
  now=$(date '+%s')
  next=$(date -d "today $BACKUP_TIME" '+%s')
  [ "$next" -gt "$now" ] || next=$(date -d "tomorrow $BACKUP_TIME" '+%s')

  log "next backup at $(date -d "@$next" '+%Y-%m-%d %H:%M %Z') (in $(( (next - now) / 60 )) min)"
  sleep "$((next - now))"

  # A failed backup must not take the scheduler down with it — log loudly and
  # stay up for tomorrow, which is all a transient blip reaching postgres-db
  # needs. Silence in these logs is the thing to be suspicious of.
  "$SCRIPT_DIR/pg-backup.sh" || log "ERROR: backup failed — next attempt at $BACKUP_TIME"
done
