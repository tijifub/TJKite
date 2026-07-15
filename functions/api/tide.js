// Tide proxy: tries Rijkswaterstaat first, falls back to Open-Meteo (FES2014).
// Mirrors the original server.js /api/tide behavior.

const RWS_BASE = "https://waterwebservices.rijkswaterstaat.nl";

const RWS_FALLBACK_STATIONS = [
  { Code: "BRWERSHVNGGET", Naam: "Brouwershavensegat", X: 3.886, Y: 51.748 },
  { Code: "BRUISEND",      Naam: "Bruinisse",           X: 4.097, Y: 51.657 },
  { Code: "ZIERIKZEE",     Naam: "Zierikzee",           X: 3.912, Y: 51.650 },
  { Code: "HOEKVHLD",      Naam: "Hoek van Holland",    X: 4.120, Y: 51.979 }
];

async function rwsPost(path, body) {
  const r = await fetch(RWS_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function rwsObservations(station) {
  const start = new Date(); start.setHours(start.getHours() - 6, 0, 0, 0);
  const end   = new Date(); end.setDate(end.getDate() + 2); end.setHours(23, 59, 0, 0);

  const json = await rwsPost(
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
    const cat = await rwsPost("/METADATASERVICES_DBO/OphalenCatalogus/", {
      CatalogusFilter: { Grootheden: ["WATHTE"], Compartimenten: ["OW"] }
    });
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

async function openMeteoFetchTide(lat, lon) {
  const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}`
    + `&hourly=sea_level_height_msl&past_days=1&forecast_days=3&timezone=GMT`;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const times = j?.hourly?.time || [];
  const vals  = j?.hourly?.sea_level_height_msl || [];
  if (!times.length || !vals.length) throw new Error("Open-Meteo: no tide data");

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

export const onRequestGet = async ({ request }) => {
  const url = new URL(request.url);
  const lat = parseFloat(url.searchParams.get("lat") || "51.7334");
  const lon = parseFloat(url.searchParams.get("lon") || "3.9025");

  let rwsErr = null;
  try {
    const result = await rwsFetchTide(lat, lon);
    return Response.json(result);
  } catch (e) {
    rwsErr = e.message;
  }
  try {
    const result = await openMeteoFetchTide(lat, lon);
    return Response.json(result);
  } catch (e) {
    return new Response(
      JSON.stringify({ error: `RWS: ${rwsErr || "unavailable"} | Open-Meteo: ${e.message}` }),
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }
};
