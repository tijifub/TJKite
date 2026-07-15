#!/usr/bin/env node
// Migrates tjkiteKey / tjkiteImportKey format in the production Cloudflare KV.
// Old format: "email:x@y"          (no dates)
// New format: "email:x@y|arr|dep"  (includes arrival + departure)
//
// Usage:
//   node migrate-prod-kv.js <password>
//
// <password> is your TJKite admin password (same one you type in the browser).

const PASSWORD = process.argv[2];
const URL      = "https://tjkite.pages.dev/api/state";

if (!PASSWORD) {
  console.error("Usage: node migrate-prod-kv.js <admin-password>");
  process.exit(1);
}

const headers = {
  "Authorization": "Basic " + Buffer.from("admin:" + PASSWORD).toString("base64"),
  "Content-Type":  "application/json",
};

async function main() {
  // 1. Fetch current prod state
  console.log("Fetching prod state...");
  const res = await fetch(URL, { headers });
  if (!res.ok) throw new Error(`GET failed: ${res.status} ${await res.text()}`);
  const state = await res.json();

  console.log(`  ${state.students?.length ?? 0} students, ${state.lessons?.length ?? 0} lessons`);

  // 2. Migrate students
  let stuMigrated = 0, lesMigrated = 0;
  const keyMap = {}; // old_key -> new_key

  for (const s of state.students ?? []) {
    const old = s.tjkiteKey ?? "";
    const arr = s.arrival ?? "";
    const dep = s.departure ?? "";
    if (old.startsWith("email:") && !old.includes("|") && arr && dep) {
      const newKey = `${old}|${arr}|${dep}`;
      keyMap[old] = newKey;
      s.tjkiteKey = newKey;
      stuMigrated++;
    }
  }

  // 3. Migrate lesson tjkiteImportKeys
  // Old: email:x@y|COURSE|N  →  New: email:x@y|arr|dep|COURSE|N
  for (const l of state.lessons ?? []) {
    const ik = l.tjkiteImportKey ?? "";
    const m  = ik.match(/^(email:[^|]+)\|([^|]+)\|(\d+)$/);
    if (m) {
      const [, emailPart, course, n] = m;
      if (keyMap[emailPart]) {
        l.tjkiteImportKey = `${keyMap[emailPart]}|${course}|${n}`;
        lesMigrated++;
      }
    }
  }

  console.log(`  Migrated ${stuMigrated} student keys, ${lesMigrated} lesson import keys`);

  if (stuMigrated === 0 && lesMigrated === 0) {
    console.log("Nothing to migrate — prod data is already up to date.");
    return;
  }

  // 4. PUT migrated state back
  console.log("Writing migrated state back to prod...");
  const put = await fetch(URL, {
    method:  "PUT",
    headers,
    body:    JSON.stringify(state),
  });
  if (!put.ok) throw new Error(`PUT failed: ${put.status} ${await put.text()}`);
  console.log("Done! Prod KV updated.");
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
