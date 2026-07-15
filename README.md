# TJKite Admin

Kite school manager. Runs locally as a tiny Node server, deploys to Cloudflare Pages.

## Single source of truth

The HTML, students-data.js and voucher-bg.jpg live at the project root. `cloudflare/public/` contains symlinks pointing back at them, so editing once updates both surfaces.

```
.
├── kitesurf-school.html       ← edit here (single source)
├── students-data.js
├── voucher-bg.jpg
├── server.js              ← local dev server (unchanged)
├── shared-data.json       ← local state (gitignored)
├── package.json
├── cloudflare/
│   ├── public/                ← symlinks → root files
│   ├── functions/
│   │   ├── _middleware.js     ← Basic Auth gate
│   │   └── api/
│   │       ├── state.js       ← KV-backed
│   │       └── tide.js        ← RWS + Open-Meteo
│   ├── wrangler.toml
│   ├── .dev.vars.example
│   └── README.md              ← deploy details
└── .github/workflows/deploy.yml
```

## Local development

Two ways to run, pick whichever feels closer to prod:

```sh
# Plain Node (no auth, file-based state) — same as before:
npm run dev
# → http://localhost:8787

# Cloudflare runtime locally (Basic Auth, KV-backed state):
cp cloudflare/.dev.vars.example cloudflare/.dev.vars   # set TJKITE_PASSWORD
npm run dev:cf
```

## CI/CD

Pick one of these:

### Option A — Cloudflare's git integration (simplest, recommended)

1. Push this project to GitHub.
2. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git.
3. Pick the repo. Build settings:
   - **Root directory:** `cloudflare`
   - **Build command:** *(leave empty)*
   - **Build output directory:** `public`
4. Add the `TJKITE_PASSWORD` secret under Settings → Environment variables (production scope).
5. Run `npm run kv:create` once locally and paste both ids into `cloudflare/wrangler.toml`. Commit.
6. Every push to `main` deploys automatically. No GitHub secrets, no workflow file needed.

### Option B — GitHub Actions (more control)

The repo ships with `.github/workflows/deploy.yml`. To use it:

1. Create a Cloudflare API token: https://dash.cloudflare.com/profile/api-tokens → "Edit Cloudflare Workers" template (covers Pages too).
2. Find your account id: any Cloudflare dashboard page, right sidebar.
3. In GitHub repo → Settings → Secrets and variables → Actions, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
4. Run `npm run kv:create` once locally, paste ids into `cloudflare/wrangler.toml`, commit.
5. Run `npm run secret:set` once to set `TJKITE_PASSWORD` in Cloudflare (production).
6. Push to `main` → workflow deploys.

Pick A if you don't need extra steps (tests, lint, multiple environments) — it's literally zero config beyond pointing Cloudflare at the repo. Use B if you want the deploy in your own pipeline.

## First-time deploy (manual)

If you'd rather skip CI for the first run:

```sh
npm i
npx wrangler login
npm run kv:create        # paste the two ids into cloudflare/wrangler.toml
npm run secret:set       # set TJKITE_PASSWORD on Cloudflare
npm run deploy
```

See `cloudflare/README.md` for details (KV migration, free-tier limits, debug tips).

## Auth model

- **Local Node server**: no auth (same as before).
- **Cloudflare**: HTTP Basic Auth on every route. Username is ignored, password must match the `TJKITE_PASSWORD` secret. Browser caches credentials per session.

## Migrating local state to production

```sh
cd cloudflare
wrangler kv key put --binding=TJKITE_KV tjkite-state "$(cat ../shared-data.json)" --remote
```
