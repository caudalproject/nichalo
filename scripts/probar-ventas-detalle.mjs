/**
 * TAB 3.5 — investigacion, no produccion.
 *
 * Pregunta: ¿el actor que ya usamos (piotrv1001~mercado-libre-listings-scraper)
 * trae `soldQuantity` si se le prende `includeProductDetail`? Y si lo trae,
 * ¿es un numero exacto o el escalon que muestra ML en la pagina ("+1000
 * vendidos")?
 *
 * Contexto medido el 1/10: en modo listado (lo que corre produccion) vinieron
 * 810/810 publicaciones con soldQuantity null en los 27 runs retenidos por
 * Apify. El README del actor documenta soldQuantity solo en modo item.
 *
 * NO usa lib/apify.ts a proposito: no se toca codigo de produccion. Llama a la
 * API de Apify directo con el mismo input que produccion + includeProductDetail.
 *
 * Costo: evento `item-detail` = USD 0.025 c/u. Con MAX_ITEMS = 5 → ~USD 0.13.
 * Antes de subir MAX_ITEMS, avisar el costo (30 → ~USD 0.75).
 *
 * Uso: node --env-file=.env.local scripts/probar-ventas-detalle.mjs ["query"]
 * Salida: scripts/investigacion/ventas-detalle-<slug>.json (dataset crudo + resumen)
 */

import { mkdirSync, writeFileSync } from "node:fs";

const ACTOR_ID = "piotrv1001~mercado-libre-listings-scraper";
const QUERY = process.argv[2] ?? "termo stanley 473ml";
const MAX_ITEMS = 5;

const token = process.env.APIFY_API_KEY;
if (!token) throw new Error("APIFY_API_KEY no configurada");
const api = (path) => `https://api.apify.com/v2${path}${path.includes("?") ? "&" : "?"}token=${token}`;

const input = {
  siteId: "MLA",
  searchQueries: [QUERY],
  maxItems: MAX_ITEMS,
  maxPagesPerQuery: 1,
  includeProductDetail: true,
  proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
};

console.log(`Run en modo detalle: "${QUERY}", ${MAX_ITEMS} items (~USD ${(MAX_ITEMS * 0.025).toFixed(3)})`);
const t0 = Date.now();
const start = await fetch(api(`/acts/${ACTOR_ID}/runs`), {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(input),
});
if (!start.ok) throw new Error(`start ${start.status}: ${await start.text()}`);
let run = (await start.json()).data;

while (["READY", "RUNNING"].includes(run.status)) {
  await new Promise((r) => setTimeout(r, 5000));
  run = (await (await fetch(api(`/actor-runs/${run.id}`))).json()).data;
  process.stdout.write(".");
}
const segundos = Math.round((Date.now() - t0) / 1000);
// usageTotalUsd tarda unos segundos en asentarse despues de SUCCEEDED: la
// primera corrida (1/10) leyo 0.075 y el cobro real fue 0.125. Se relee.
await new Promise((r) => setTimeout(r, 10000));
run = (await (await fetch(api(`/actor-runs/${run.id}`))).json()).data;
console.log(`\nrun ${run.id}: ${run.status} en ${segundos}s, costo USD ${run.usageTotalUsd}`);

const items = await (await fetch(api(`/datasets/${run.defaultDatasetId}/items`))).json();

// Que campos traen valor
const campos = {};
for (const it of items) {
  for (const [k, v] of Object.entries(it)) {
    campos[k] ??= 0;
    const vacio = v == null || v === "" || (Array.isArray(v) && !v.length) ||
      (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);
    if (!vacio) campos[k]++;
  }
}
console.log("\nCampos con valor (de", items.length, "):");
for (const [k, n] of Object.entries(campos).sort()) console.log(`  ${k.padEnd(20)} ${n}`);

// soldQuantity: ¿exacto o escalon?
const ESCALONES = new Set([1, 5, 25, 50, 100, 150, 200, 250, 500, 1000, 5000, 10000, 50000, 100000]);
console.log("\nsoldQuantity por publicacion:");
for (const it of items) {
  const sq = it.soldQuantity;
  const marca = sq == null ? "null" : ESCALONES.has(sq) ? "← coincide con escalon de ML" : "← NO es escalon";
  console.log(`  ${String(sq).padStart(7)}  ${marca}  ${String(it.title).slice(0, 60)}`);
}

const slug = QUERY.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
mkdirSync("scripts/investigacion", { recursive: true });
const out = `scripts/investigacion/ventas-detalle-${slug}.json`;
writeFileSync(out, JSON.stringify({
  query: QUERY, input: { ...input, proxyConfiguration: "RESIDENTIAL" },
  runId: run.id, status: run.status, segundos, usageTotalUsd: run.usageTotalUsd,
  medidoEl: new Date().toISOString(), campos, items,
}, null, 2));
console.log("\nGuardado en", out);
