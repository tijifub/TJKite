# TJKite Admin — Cloudflare Pages deploy

Free hosting for the kite school manager on Cloudflare Pages + Functions + KV.

## Layout

- `public/` — static assets (the HTML, students-data.js, voucher-bg.jpg). Cloudflare Pages serves this directly.
- `functions/_middleware.js` — HTTP Basic Auth gate over the whole site.
- `functions/api/state.js` — `GET/PUT /api/state`, persists JSON in KV.
- `functions/api/tide.js` — `GET /api/tide`, proxies Rijkswaterstaat with Open-Meteo fallback.
- `wrangler.toml` — Pages + KV binding config.
- `.dev.vars.example` — template for local secrets (copy to `.dev.vars`, never commit).

## One-time setup

1. **Install Wrangler** (Cloudflare CLI):
   ```sh
   npm i -g wrangler
   wrangler login
   ```

2. **Create the KV namespaces** (production + preview):
   ```sh
   wrangler kv namespace create TJKITE_KV
   wrangler kv namespace create TJKITE_KV --preview
   ```
   Wrangler prints two ids. Paste them into `wrangler.toml` (`id` and `preview_id`).

3. **Local development** — copy the secrets template and pick a password:
   ```sh
   cp .dev.vars.example .dev.vars
   # edit .dev.vars
   wrangler pages dev
   ```
   Open the printed URL. Browser will prompt for username/password — username is ignored, password must match `TJKITE_PASSWORD`.

## Deploy

```sh
wrangler pages deploy
```

First deploy will create the project. Set the production password as a secret:

```sh
wrangler pages secret put TJKITE_PASSWORD
# paste a strong password when prompted
```

Subsequent deploys: just `wrangler pages deploy`.

## How it differs from the local Node server

| | Local (`server.js`) | Cloudflare |
| --- | --- | --- |
| Server | Node `http.createServer` | Pages Functions (Workers) |
| State storage | `shared-data.json` on disk | KV under key `tjkite-state` |
| Tide proxy | `https.request` | `fetch()` |
| Auth | none | HTTP Basic, password from `TJKITE_PASSWORD` secret |

The HTML is byte-identical except for the filename (`kitesurf-school.html` → `index.html` so `/` resolves cleanly).

## Migrating existing data

To seed KV with your current `shared-data.json`:

```sh
wrangler kv key put --binding=TJKITE_KV tjkite-state "$(cat ../shared-data.json)" --remote
```

(or use the Cloudflare dashboard: Workers & Pages → KV → TJKITE_KV → "Add entry", key `tjkite-state`, paste the JSON as value).

## Free-tier limits (Cloudflare, May 2026)

- Pages: 500 builds/month, unlimited bandwidth.
- Workers / Functions: 100k requests/day.
- KV: 100k reads/day, 1k writes/day, 1 GB storage.

Saving state on every edit can burn through the 1k writes/day quota fast — if it becomes an issue, debounce saves in the HTML (e.g. coalesce within 5–10 seconds) or move to D1.
