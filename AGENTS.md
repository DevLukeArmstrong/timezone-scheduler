<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Where this runs

Self-hosted on Proxmox. Nothing here is a secret — these are LAN addresses,
and `.env.example` and `docker-compose.yml` already name the database host.

| | |
|---|---|
| App VM | `time-scheduler`, **10.0.0.200**, user `luke`, repo at `~/timezone-scheduler` |
| Database | `postgres-db` LXC (CT 101), **10.0.0.195** — outside the compose stack |
| Gateway / DNS | 10.0.0.1 |

`ssh luke@10.0.0.200`, or the Proxmox console for that VM. It's a VM, not an
LXC — the NIC is `ens18` — so it's `qm`, not `pct`.

Public access is a Cloudflare Tunnel to a domain the owner controls, so
there is no inbound port forward. An earlier duckdns + Nginx Proxy Manager
setup is gone; don't reintroduce it.

## Deploying

Both steps need `--build`: `run` reuses the last image otherwise, so a
release that adds a migration reports "No pending migrations" against a
stale copy while the fresh app expects the new schema.

```bash
git pull
docker compose run --rm --build migrate
docker compose up -d --build app
docker compose up -d backup   # not a dependency of app; needs naming once
```

Deploy from `main`. Production once sat on a feature branch and a later
`git checkout main` would have silently reverted several fixes at once.

## Gotchas worth not rediscovering

- **The app container needs an explicit `dns:`.** Docker writes a
  container's `resolv.conf` once, at creation, and this host gets its
  nameserver from `dhcpcd` — a container created during boot, before DHCP
  has filled it in, keeps an empty resolver forever and fails every public
  hostname with `EAI_AGAIN`. Postgres still works throughout, because
  `POSTGRES_HOST` is an IP, so the app looks healthy while every Discord
  post and email silently fails.
- **Background notification jobs swallow their errors by design**, so
  outbound breakage shows up as "the bot went quiet", never as an error.
  The group Discord test button is the only path that surfaces one.

