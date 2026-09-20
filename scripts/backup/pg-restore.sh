#!/bin/sh
# Restore the database from one of the files in the backup directory.
#
# DESTRUCTIVE. This drops and recreates every object in the dump, so the
# current contents of the database are replaced by whatever was in it when
# that dump was taken. Everything written since is gone.
#
#   docker compose run --rm backup /scripts/pg-restore.sh             # list
#   docker compose run --rm backup /scripts/pg-restore.sh <file>      # restore
#   docker compose run --rm backup /scripts/pg-restore.sh <file> --yes
#
# Stop the app first so nothing writes mid-restore (and so it isn't holding
# locks on the tables being dropped):
#   docker compose stop app
#   docker compose run --rm backup /scripts/pg-restore.sh <file>
#   docker compose up -d app

set -eu

BACKUP_DIR=${BACKUP_DIR:-/backups}
PREFIX=${PGDATABASE:-timezone_scheduler_db}

list_backups() {
  find "$BACKUP_DIR" -maxdepth 1 -type f -name "$PREFIX-*.dump" 2>/dev/null | sort -r
}

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <dump-file> [--yes]"
  echo
  if [ -z "$(list_backups)" ]; then
    echo "No backups in $BACKUP_DIR yet."
    echo "Take one with: docker compose run --rm backup /scripts/pg-backup.sh"
  else
    echo "Backups in $BACKUP_DIR, newest first:"
    list_backups | while read -r f; do
      printf '  %-6s  %s\n' "$(du -h "$f" | cut -f1)" "$(basename "$f")"
    done
  fi
  exit 0
fi

file=$1
assume_yes=false
[ "${2:-}" = "--yes" ] && assume_yes=true

# Accept either a bare filename or a path, so the names printed above can be
# pasted back in as-is.
case "$file" in
  */*) ;;
  *) file="$BACKUP_DIR/$file" ;;
esac

[ -f "$file" ] || {
  echo "No such backup: $file" >&2
  exit 1
}

# Check the archive is readable before touching the database — better to find
# out here than half way through a --clean restore.
pg_restore --list "$file" >/dev/null 2>&1 || {
  echo "ERROR: $(basename "$file") is not a readable pg_dump archive." >&2
  exit 1
}

if [ "$assume_yes" != true ]; then
  cat >&2 <<EOF

  Restoring  $(basename "$file")
  into       ${PGDATABASE:-?}
  on         ${PGHOST:-?}

  This replaces the current contents of that database with the contents of the
  dump. Anything written since it was taken is lost, and the only undo is
  another file in $BACKUP_DIR.

EOF
  printf 'Type the database name (%s) to continue: ' "${PGDATABASE:-?}" >&2
  read -r answer
  [ "$answer" = "${PGDATABASE:-}" ] || {
    echo "Aborted — nothing was changed." >&2
    exit 1
  }
fi

# --single-transaction so a restore that fails part way rolls back and leaves
# the database as it was, rather than half-dropped. --clean --if-exists so an
# object that isn't there yet isn't an error on the way in. --no-owner
# --no-privileges so everything lands owned by the connecting role, whatever
# the roles were on the server the dump came from.
pg_restore \
  --dbname="$PGDATABASE" \
  --clean --if-exists \
  --no-owner --no-privileges \
  --single-transaction --exit-on-error \
  "$file"

echo "Restored $PGDATABASE from $(basename "$file")."
echo "Start the app again: docker compose up -d app"
