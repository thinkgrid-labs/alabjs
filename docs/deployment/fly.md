---
title: Fly.io
description: Deploy AlabJS globally on Fly.io with persistent volumes and close-to-user routing.
---

[Fly.io](https://fly.io) runs your AlabJS app in Docker containers placed close to your users across 30+ regions. It's a good fit for apps that need persistent volumes, private networking, or close control over the deployment region.

## Prerequisites

Install the Fly CLI:

```bash
curl -L https://fly.io/install.sh | sh
fly auth login
```

## Launch

From your project root:

```bash
fly launch
```

Fly detects Node.js and generates a `Dockerfile` and `fly.toml` automatically. Accept the defaults or customise the region and machine size.

## fly.toml

A minimal config for AlabJS:

```toml
app = "my-alabjs-app"
primary_region = "sin"   # Singapore — change to your closest region

[build]

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  memory = "512mb"
  cpu_kind = "shared"
  cpus = 1
```

`auto_stop_machines = true` shuts down idle machines to save cost. `auto_start_machines = true` starts them again on the next request (cold start ~500 ms on Fly).

## Environment variables

Set secrets with the Fly CLI — they are encrypted and injected at runtime:

```bash
fly secrets set NODE_ENV=production
fly secrets set PUBLIC_URL=https://my-alabjs-app.fly.dev
fly secrets set DATABASE_URL=postgres://...
fly secrets set ALAB_REVALIDATE_SECRET=your-secret
```

## Deploy

```bash
fly deploy
```

Fly builds the Docker image remotely and rolls it out to all regions. Subsequent deploys use layer caching and are typically faster.

## Custom domain

```bash
fly certs create yourdomain.com
```

Fly provisions a TLS certificate automatically via Let's Encrypt. Add the CNAME or A record shown in the output to your DNS provider.

## Persistent volumes

AlabJS is stateless by default. If you need persistent storage (e.g. for SQLite), attach a Fly volume:

```bash
fly volumes create data --region sin --size 1
```

```toml
# fly.toml
[mounts]
  source = "data"
  destination = "/data"
```

## Multi-region

Fly supports deploying to multiple regions simultaneously. Add regions and scale replicas:

```bash
fly regions add nrt lax      # add Tokyo and Los Angeles
fly scale count 3            # run 3 machines total
```

AlabJS routes users to the nearest machine automatically via Fly's Anycast network.
