This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Database backups

Production data lives in the `postgres-db` LXC, which is outside the compose
stack, so the `backup` service in `docker-compose.yml` is a Postgres client
container that dumps it over the network once a day.

```bash
docker compose up -d backup        # start the nightly schedule
docker compose logs -f backup      # it logs every run, and every failure
```

Dumps land in `./backups` (git-ignored, mode 0600 — they contain password
hashes) as `timezone_scheduler_db-<UTC timestamp>.dump`, in `pg_dump`'s custom
format. Each one is verified by reading its table of contents back before it's
published under its final name, so a truncated dump never sits in the
directory pretending to be restorable.

Old dumps are pruned after each **successful** run, and never below a floor of
`BACKUP_MIN_KEEP` files — a stretch of failed backups can't age out the good
ones. Schedule, retention and destination are all configurable; see the
**Database backups** section of `.env.example`.

On demand:

```bash
docker compose run --rm backup /scripts/pg-backup.sh     # back up now
docker compose run --rm backup /scripts/pg-restore.sh    # list what you have
```

### Restoring

Restoring **replaces** the current database with the contents of the dump, so
stop the app first — both to keep it from writing mid-restore and to free the
locks it holds on the tables being dropped:

```bash
docker compose stop app
docker compose run --rm backup /scripts/pg-restore.sh timezone_scheduler_db-20260101T033000Z.dump
docker compose up -d app
```

It asks you to type the database name before doing anything (`--yes` skips the
prompt for scripted use), and runs in a single transaction — if the restore
fails part way, the database is left exactly as it was.

A backup you have never restored is a guess. Try one into a scratch database
before you need it for real.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
