/**
 * TAB 3.6 — paso 0 (b). Investigacion, no produccion. NO usa lib/apify.ts.
 *
 * Corre dos actores de detalle mas baratos sobre las MISMAS 10 URLs que el
 * paso 0 (a) mando a piotrv1001 (analisis "escurridor") y compara el vendido
 * publicacion por publicacion contra lo que devolvio piotrv1001.
 *
 *   saswave~mercadolibre-product-scraper  ~USD 0.001/item (plan FREE)
 *   gio21~mercadolivre-product-detail     ~USD 0.015/item (plan FREE)
 *
 * Requiere haber corrido antes scripts/probar-escalera-paso0.mjs (lee su JSON).
 * Costo: ~USD 0.16. Tope duro por run: maxTotalChargeUsd.
 *
 * Uso: node --env-file=.env.local scripts/probar-actores-alternativos-paso0.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";

const token = process.env.APIFY_API_KEY;
if (!token) throw new Error("APIFY_API_KEY no configurada");
const api = (path) => `https://api.apify.com/v2${path}${path.includes("?") ? "&" : "?"}token=${token}`;
const getJson = async (path) => {
  const r = await fetch(api(path));
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r.json();
};

const paso0 = JSON.parse(readFileSync("scripts/investigacion/paso0-escalera-tab-3.6.json", "utf8"));
const base = paso0.resultados[0]; // escurridor
const urls = base.sel.map((s) => s.url).filter(Boolean);
const piotrPorItem = new Map(base.items.map((i) => [i.itemId, i]));

// saswave fallo con URLs articulo.* (200 + requeue x5 = pagina anti-bot): se
// le pasan los permalinks finales /p/ y /up/ que resolvio piotrv1001, que es el
// formato de su README. gio21 exige maxTotalChargeUsd >= 0.25 por run.
const permalinks = base.items.map((i) => i.permalink).filter(Boolean);
const ACTORES = [
  { id: "saswave~mercadolibre-product-scraper", input: { urls: permalinks }, tope: 0.05 },
  { id: "gio21~mercadolivre-product-detail", input: { productUrls: urls, maxRetries: 2 }, tope: 0.25 },
];

const resultados = await Promise.all(ACTORES.map(async (a) => {
  const t0 = Date.now();
  const start = await fetch(api(`/acts/${a.id}/runs?timeout=420&maxTotalChargeUsd=${a.tope}`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(a.input),
  });
  if (!start.ok) return { actor: a.id, error: `start ${start.status}: ${await start.text()}` };
  let run = (await start.json()).data;
  while (["READY", "RUNNING", "TIMING-OUT", "ABORTING"].includes(run.status)) {
    await new Promise((r) => setTimeout(r, 5000));
    run = (await getJson(`/actor-runs/${run.id}`)).data;
  }
  const segundos = Math.round((Date.now() - t0) / 1000);
  await new Promise((r) => setTimeout(r, 10000));
  run = (await getJson(`/actor-runs/${run.id}`)).data;
  const items = await getJson(`/datasets/${run.defaultDatasetId}/items`);
  console.log(`\n[${a.id}] run ${run.id}: ${run.status} en ${segundos}s, USD ${run.usageTotalUsd}, eventos ${JSON.stringify(run.chargedEventCounts)}, items ${items.length}`);
  if (items[0]) console.log("  campos:", Object.keys(items[0]).join(","));
  return { actor: a.id, runId: run.id, status: run.status, segundos, usageTotalUsd: run.usageTotalUsd, chargedEventCounts: run.chargedEventCounts, items };
}));

// Comparacion: buscar en cada item cualquier señal de vendidos
const vendidoDe = (x) => {
  if (x.soldQuantity != null) return `sold=${x.soldQuantity}`;
  const s = JSON.stringify(x);
  const m = /[+]?\s?[\d.,]+\s?(mil)?\s?vendid[oa]s/i.exec(s);
  return m ? `texto="${m[0]}"` : "—";
};
const numItem = (x) => {
  const s = JSON.stringify(x);
  const out = new Set();
  for (const m of s.matchAll(/MLA-?(\d{6,})/g)) out.add(`MLA${m[1]}`);
  return out;
};

console.log("\n== Vendidos por publicacion (piotrv1001 vs alternativos) ==");
for (const s of base.sel) {
  const p = piotrPorItem.get(s.itemId);
  const fila = [`${s.itemId.padEnd(14)} piotr ${String(p?.soldQuantity).padStart(5)}`];
  for (const r of resultados) {
    if (!r.items) { fila.push(`${r.actor.split("~")[0]}: ERROR`); continue; }
    const m = r.items.find((x) => numItem(x).has(s.itemId) || (p && numItem(x).has(p.id)));
    fila.push(`${r.actor.split("~")[0]}: ${m ? vendidoDe(m) : "NO VINO"}`);
  }
  console.log("  " + fila.join(" | "));
}

const out = "scripts/investigacion/paso0-alternativos-tab-3.6.json";
writeFileSync(out, JSON.stringify({ medidoEl: new Date().toISOString(), urls, resultados }, null, 2));
console.log("\nGuardado en", out);
