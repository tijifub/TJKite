#!/usr/bin/env node
// Cloudflare Pages / Wrangler does not follow symlinks (confirmed upstream bug:
// https://github.com/cloudflare/workers-sdk/issues/3094), so cloudflare/public/
// can't just symlink back to the root source files the way local tooling might
// expect. This script copies the real files in instead. Run automatically before
// `wrangler pages dev` and `wrangler pages deploy` (see package.json).
//
// Root files stay the single source of truth — always edit those, never the
// copies under cloudflare/public/.
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "cloudflare", "public");

const files = [
  ["kitesurf-school.html", "index.html"],
  ["students-data.js", "students-data.js"],
  ["voucher-bg.jpg", "voucher-bg.jpg"],
];

fs.mkdirSync(PUBLIC, { recursive: true });
for (const [src, dest] of files) {
  fs.copyFileSync(path.join(ROOT, src), path.join(PUBLIC, dest));
  console.log(`synced ${src} -> cloudflare/public/${dest}`);
}
