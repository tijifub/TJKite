const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "shared-data.json");
const PORT = Number(process.env.PORT || 8787);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store"
  });
  res.end(body);
}

// ---------- RWS proxy helpers ----------
const RWS_BASE = "waterwebservices.rijkswaterstaat.nl";

function httpsPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: RWS_BASE,
      path: urlPath,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    }, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error("Bad JSON")); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

const RWS_FALLBACK_STATIONS = [
  { Code: "BRWERSHVNGGET", Naam: "Brouwershavensegat", X: 3.886, Y: 51.748 },
  { Code: "BRUISEND",      Naam: "Bruinisse",           X: 4.097, Y: 51.657 },
  { Code: "ZIERIKZEE",     Naam: "Zierikzee",           X: 3.912, Y: 51.650 },
  { Code: "HOEKVHLD",      Naam: "Hoek van Holland",    X: 4.120, Y: 51.979 },
];

async function rwsObservations(station) {
  const start = new Date(); start.setHours(start.getHours() - 6, 0, 0, 0);
  const end   = new Date(); end.setDate(end.getDate() + 2); end.setHours(23, 59, 0, 0);
  const json = await httpsPost(
    "/ONLINEWAARNEMINGENSERVICES_DBO/OphalenWaarnemingen",
    {
      AquoPlusWaarnemingMetadata: {
        AquoMetadata: { Compartiment: { Code: "OW" }, Grootheid: { Code: "WATHTE" } }
      },
      Locatie: { X: station.X, Y: station.Y, Code: station.Code },
      Periode: { Begindatumtijd: start.toISOString(), Einddatumtijd: end.toISOString() }
    }
  );
  if (json.Succesvol === false) throw new Error(json.Foutmelding || "Succesvol=false");
  return (json.WaarnemingenLijst?.[0]?.MetingenLijst || [])
    .map(m => ({ ts: new Date(m.Tijdstip).getTime(), cm: m.Meetwaarde?.Waarde_Numeriek ?? null }))
    .filter(p => p.cm !== null && !isNaN(p.cm))
    .sort((a, b) => a.ts - b.ts);
}

async function rwsFetchTide(lat, lon) {
  let stations = [];
  try {
    const cat = await httpsPost("/METADATASERVICES_DBO/OphalenCatalogus/",
      { CatalogusFilter: { Grootheden: ["WATHTE"], Compartimenten: ["OW"] } });
    stations = (cat.LocatieLijst || [])
      .filter(l => l.X != null && l.Y != null)
      .sort((a, b) => ((a.X-lon)**2+(a.Y-lat)**2) - ((b.X-lon)**2+(b.Y-lat)**2))
      .slice(0, 5);
  } catch { /* fall through */ }

  const candidates = [...stations, ...RWS_FALLBACK_STATIONS];
  const errors = [];
  for (const station of candidates) {
    try {
      const points = await rwsObservations(station);
      if (points.length > 0) return { station, points };
      errors.push(`${station.Code}: no data`);
    } catch (e) {
      errors.push(`${station.Code}: ${e.message}`);
    }
  }
  throw new Error("No data from any station: " + errors.slice(-4).join(" | "));
}

// ---------- Open-Meteo tide fallback (FES2014 harmonic) ----------
// Used when RWS Waterwebservices is unavailable. Returns same shape as rwsFetchTide.
function httpsGetJson(host, urlPath) {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname: host, path: urlPath, method: "GET" }, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        try { resolve(JSON.parse(raw)); } catch { reject(new Error("Bad JSON")); }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function openMeteoFetchTide(lat, lon) {
  // Use timezone=GMT so the returned timestamps are unambiguous UTC.
  const path = `/v1/marine?latitude=${lat}&longitude=${lon}`
    + `&hourly=sea_level_height_msl&past_days=1&forecast_days=3&timezone=GMT`;
  const j = await httpsGetJson("marine-api.open-meteo.com", path);
  const times = j?.hourly?.time || [];
  const vals  = j?.hourly?.sea_level_height_msl || [];
  if (!times.length || !vals.length) throw new Error("Open-Meteo: no tide data");
  // With timezone=GMT, "YYYY-MM-DDTHH:mm" must be parsed as UTC. Append "Z".
  const points = times.map((t, i) => ({
    ts: new Date(t + "Z").getTime(),
    cm: vals[i] != null ? +(vals[i] * 100).toFixed(1) : null
  }))
    .filter(p => p.cm != null && !isNaN(p.cm) && !isNaN(p.ts))
    .sort((a, b) => a.ts - b.ts);
  if (!points.length) throw new Error("Open-Meteo: no usable points");
  return {
    station: { Code: "OPENMETEO", Naam: "Open-Meteo (FES2014, forecast)" },
    points
  };
}
// ---------- end RWS helpers ----------

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 10_000_000) {
        reject(new Error("Request too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");

    if (url.pathname === "/api/tide") {
      const lat = parseFloat(url.searchParams.get("lat") || "51.7334");
      const lon = parseFloat(url.searchParams.get("lon") || "3.9025");
      let rwsErr = null;
      try {
        const result = await rwsFetchTide(lat, lon);
        return send(res, 200, JSON.stringify(result), "application/json; charset=utf-8");
      } catch (e) {
        rwsErr = e.message;
        console.warn("RWS tide failed, falling back to Open-Meteo:", rwsErr);
      }
      try {
        const result = await openMeteoFetchTide(lat, lon);
        return send(res, 200, JSON.stringify(result), "application/json; charset=utf-8");
      } catch (e) {
        return send(res, 502, JSON.stringify({
          error: `RWS: ${rwsErr || "unavailable"} | Open-Meteo: ${e.message}`
        }), "application/json; charset=utf-8");
      }
    }

    if (url.pathname === "/api/state") {
      if (req.method === "GET") {
        if (!fs.existsSync(DATA_FILE)) return send(res, 200, "{}", "application/json; charset=utf-8");
        return send(res, 200, fs.readFileSync(DATA_FILE, "utf8"), "application/json; charset=utf-8");
      }
      if (req.method === "PUT") {
        const body = await readBody(req);
        const parsed = JSON.parse(body);
        if (!parsed || typeof parsed !== "object" || !parsed.settings || !Array.isArray(parsed.students) || !Array.isArray(parsed.lessons)) {
          return send(res, 400, "Invalid app state");
        }
        fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2));
        return send(res, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8");
      }
      return send(res, 405, "Method not allowed");
    }

    let filePath = url.pathname === "/" ? "/kitesurf-school.html" : decodeURIComponent(url.pathname);
    filePath = path.normalize(filePath).replace(/^([.][.][\\/])+/, "");
    const abs = path.join(ROOT, filePath);
    if (!abs.startsWith(ROOT) || !fs.existsSync(abs) || fs.statSync(abs).isDirectory()) {
      return send(res, 404, "Not found");
    }
    send(res, 200, fs.readFileSync(abs), MIME[path.extname(abs).toLowerCase()] || "application/octet-stream");
  } catch (err) {
    console.error(err);
    send(res, 500, err.message || "Server error");
  }
});

server.listen(PORT, () => {
  console.log("TJKite Manager running at http://localhost:" + PORT);
  console.log("Shared data file: " + DATA_FILE);
});
