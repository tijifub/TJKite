// Quick RWS tide API test — run with: node ~/Documents/Claude/Projects/Kite/test-tide.js
const https = require("https");

function httpsPost(urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: "waterwebservices.rijkswaterstaat.nl",
      path: urlPath,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
    }, res => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => {
        console.log(`  HTTP ${res.statusCode}`);
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, raw: raw.slice(0, 300) }); }
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  const start = new Date(); start.setHours(start.getHours() - 6, 0, 0, 0);
  const end   = new Date(); end.setDate(end.getDate() + 1); end.setHours(23, 59, 0, 0);

  // Test 1: catalog — what stations does RWS expose?
  console.log("=== Test 1: Catalog ===");
  const cat = await httpsPost("/METADATASERVICES_DBO/OphalenCatalogus/",
    { CatalogusFilter: { Grootheden: ["WATHTE"], Compartimenten: ["OW"] } });
  if (cat.body?.LocatieLijst) {
    // Find closest stations to Brouwersdam (lon=3.9, lat=51.73)
    const sorted = cat.body.LocatieLijst
      .filter(l => l.X != null && l.Y != null)
      .sort((a,b) => ((a.X-3.9)**2+(a.Y-51.73)**2) - ((b.X-3.9)**2+(b.Y-51.73)**2))
      .slice(0, 5);
    console.log("Nearest stations:");
    sorted.forEach(s => console.log(`  ${s.Code} — ${s.Naam}  (${s.X}, ${s.Y})`));

    // Test 2: observations for the nearest station
    console.log("\n=== Test 2: Observations (nearest station, no Code in Locatie) ===");
    const nearest = sorted[0];
    const obs = await httpsPost("/ONLINEWAARNEMINGENSERVICES_DBO/OphalenWaarnemingen", {
      AquoPlusWaarnemingMetadata: {
        AquoMetadata: { Compartiment: { Code: "OW" }, Grootheid: { Code: "WATHTE" } }
      },
      Locatie: { X: nearest.X, Y: nearest.Y },
      Periode: { Begindatumtijd: start.toISOString(), Einddatumtijd: end.toISOString() }
    });
    if (obs.body?.WaarnemingenLijst) {
      const pts = (obs.body.WaarnemingenLijst[0]?.MetingenLijst || []).filter(m => m.Meetwaarde?.Waarde_Numeriek != null);
      console.log(`Got ${pts.length} points for ${nearest.Code}`);
      if (pts.length) {
        console.log("Latest:", pts[pts.length-1].Tijdstip, "→", pts[pts.length-1].Meetwaarde.Waarde_Numeriek, "cm NAP");
      }
    } else {
      console.log("Response:", JSON.stringify(obs).slice(0, 400));
    }

    // Test 3: with Code included
    console.log("\n=== Test 3: Observations (with Code in Locatie) ===");
    const obs2 = await httpsPost("/ONLINEWAARNEMINGENSERVICES_DBO/OphalenWaarnemingen", {
      AquoPlusWaarnemingMetadata: {
        AquoMetadata: { Compartiment: { Code: "OW" }, Grootheid: { Code: "WATHTE" } }
      },
      Locatie: { X: nearest.X, Y: nearest.Y, Code: nearest.Code },
      Periode: { Begindatumtijd: start.toISOString(), Einddatumtijd: end.toISOString() }
    });
    if (obs2.body?.WaarnemingenLijst) {
      const pts = (obs2.body.WaarnemingenLijst[0]?.MetingenLijst || []).filter(m => m.Meetwaarde?.Waarde_Numeriek != null);
      console.log(`Got ${pts.length} points for ${nearest.Code} (with Code)`);
    } else {
      console.log("Response:", JSON.stringify(obs2).slice(0, 400));
    }
  } else {
    console.log("Catalog response:", JSON.stringify(cat).slice(0, 500));
  }
}

main().catch(console.error);
