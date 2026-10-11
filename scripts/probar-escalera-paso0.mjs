/**
 * TAB 3.6 — paso 0 (a). Investigacion, no produccion. NO usa lib/apify.ts.
 *
 * Simula la forma EXACTA que tendria produccion: toma 3 listados reales ya
 * retenidos por Apify (modo listado, costo ya pagado), elige 10 publicaciones
 * por analisis con el criterio default (5 mas baratas + 5 primeras por
 * relevancia, sin repetir) y pide el detalle de esas 10 via startUrls.
 *
 * Mide: escalera real de soldQuantity, % catalogo (catalogProductId), % ofertas
 * MLAU, productos distintos tras deduplicar por catalogProductId, tiempo real
 * de un run de 10 y eventos cobrados.
 *
 * Forma de URL: los listados traen 3 tipos de permalink (click1 de publicidad,
 * /p/ catalogo, /up/ oferta). El actor documenta que reconoce como detalle las
 * URLs articulo.*. Para probar las dos opciones:
 *   - analisis 1 y 3: articulo.mercadolibre.com.ar/MLA-<itemId>-_JM para todas
 *   - analisis 2:     permalink tal cual para /p/ y /up/, articulo solo para click1
 *
 * Costo: item-detail USD 0.025 x 30 = ~USD 0.75 (+ arranques, centavos).
 * Tope duro por run: maxTotalChargeUsd = 0.30.
 *
 * Uso:
 *   node --env-file=.env.local scripts/probar-escalera-paso0.mjs --dry   (gratis: muestra las URLs)
 *   node --env-file=.env.local scripts/probar-escalera-paso0.mjs         (gasta ~USD 0.75)
 */

import { mkdirSync, writeFileSync } from "node:fs";

const ACTOR_ID = "piotrv1001~mercado-libre-listings-scraper";
const DRY = process.argv.includes("--dry");
const N_BARATAS = 5;
const N_RELEVANCIA = 5;

// Listados reales retenidos (modo listado, 30 c/u), 3 categorias distintas.
// Los datasets de Apify sin nombre expiran (~7 dias en plan FREE): los del
// primer borrador (calleras/JBL Tune/silla) ya no existen. Reemplazados el 11/10
// por runs reales de produccion del 6/10-8/10. Mezcla deliberada:
//   hogar generico (4/10 catalogo), electronica con mas catalogo (6/10, peor caso
//   para la deduplicacion) y deporte (4/10).
const ANALISIS = [
  { query: "escurridor vajilla 2 niveles con drenaje", dataset: "73GaNcijg9gFki0Ia", urls: "articulo" },
  { query: "Jbl Go4 Generico", dataset: "kSgbXVh79a9lnVsuk", urls: "permalink" },
  { query: "Tabla de pilates plegable bandas elásticas", dataset: "0puQr3bwGCA0mWZEN", urls: "articulo" },
];

const token = process.env.APIFY_API_KEY;
if (!token) throw new Error("APIFY_API_KEY no configurada");
const api = (path) => `https://api.apify.com/v2${path}${path.includes("?") ? "&" : "?"}token=${token}`;
const getJson = async (path) => {
  const r = await fetch(api(path));
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r.json();
};

function articulo(itemId) {
  const m = /^MLA(\d+)$/.exec(itemId ?? "");
  return m ? `https://articulo.mercadolibre.com.ar/MLA-${m[1]}-_JM` : null;
}

function tipoPermalink(pl = "") {
  if (pl.includes("click1.")) return "click1";
  if (pl.includes("/p/")) return "p";
  if (pl.includes("/up/")) return "up";
  if (pl.includes("articulo.")) return "articulo";
  return "otro";
}

function elegir(items) {
  const conPrecio = items.filter((x) => typeof x.price === "number" && x.price > 0);
  const baratas = [...conPrecio].sort((a, b) => a.price - b.price).slice(0, N_BARATAS);
  const elegidas = [...baratas];
  for (const it of items) {
    if (elegidas.length >= N_BARATAS + N_RELEVANCIA) break;
    if (!elegidas.includes(it)) elegidas.push(it);
  }
  return elegidas.map((it) => ({
    it,
    motivo: baratas.includes(it) ? "barata" : "relevancia",
    posicion: items.indexOf(it) + 1,
  }));
}

function urlPara(it, modo) {
  const tipo = tipoPermalink(it.permalink);
  if (modo === "permalink" && (tipo === "p" || tipo === "up")) return it.permalink.split("#")[0];
  return articulo(it.itemId);
}

// 1. Seleccion (gratis)
const plan = [];
for (const a of ANALISIS) {
  const items = await getJson(`/datasets/${a.dataset}/items?limit=30`);
  const sel = elegir(items).map((s) => ({ ...s, url: urlPara(s.it, a.urls), tipo: tipoPermalink(s.it.permalink) }));
  plan.push({ ...a, totalListado: items.length, sel });
  console.log(`\n[${a.query}] listado ${items.length} → ${sel.length} elegidas (urls: ${a.urls})`);
  for (const s of sel) {
    console.log(`  #${String(s.posicion).padStart(2)} ${s.motivo.padEnd(10)} ${s.tipo.padEnd(6)} cat=${String(s.it.catalogProductId).padEnd(12)} $${String(s.it.price).padStart(8)}  ${s.url}`);
  }
}
const totalUrls = plan.reduce((n, p) => n + p.sel.filter((s) => s.url).length, 0);
console.log(`\nTotal: ${totalUrls} URLs de detalle → ~USD ${(totalUrls * 0.025).toFixed(2)}`);
if (DRY) process.exit(0);

// 2. Tres runs en paralelo, uno por analisis (como produccion: 1 run de 10)
const resultados = await Promise.all(plan.map(async (p) => {
  const input = {
    siteId: "MLA",
    startUrls: p.sel.filter((s) => s.url).map((s) => ({ url: s.url })),
    includeProductDetail: true,
    maxItems: p.sel.length,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
  };
  const t0 = Date.now();
  const start = await fetch(api(`/acts/${ACTOR_ID}/runs?timeout=420&maxTotalChargeUsd=0.30`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!start.ok) throw new Error(`start ${start.status}: ${await start.text()}`);
  let run = (await start.json()).data;
  while (["READY", "RUNNING", "TIMING-OUT", "ABORTING"].includes(run.status)) {
    await new Promise((r) => setTimeout(r, 5000));
    run = (await getJson(`/actor-runs/${run.id}`)).data;
  }
  const segundos = Math.round((Date.now() - t0) / 1000);
  await new Promise((r) => setTimeout(r, 10000)); // usageTotalUsd tarda en asentarse
  run = (await getJson(`/actor-runs/${run.id}`)).data;
  const items = await getJson(`/datasets/${run.defaultDatasetId}/items`);
  console.log(`\n[${p.query}] run ${run.id}: ${run.status} en ${segundos}s, USD ${run.usageTotalUsd}, eventos ${JSON.stringify(run.chargedEventCounts)}`);
  return { ...p, runId: run.id, status: run.status, segundos, usageTotalUsd: run.usageTotalUsd, chargedEventCounts: run.chargedEventCounts, items };
}));

// 3. Analisis
const todos = resultados.flatMap((r) => r.items);
const valores = {};
for (const it of todos) valores[String(it.soldQuantity)] = (valores[String(it.soldQuantity)] ?? 0) + 1;
console.log("\n== Escalera observada (soldQuantity → cuantas) ==");
for (const [v, n] of Object.entries(valores).sort((a, b) => Number(a[0]) - Number(b[0]))) console.log(`  ${v.padStart(7)}  ${n}`);

console.log("\n== Por analisis ==");
const resumen = resultados.map((r) => {
  const n = r.items.length;
  const cat = r.items.filter((x) => x.catalogProductId).length;
  const mlau = r.items.filter((x) => String(x.id).startsWith("MLAU")).length;
  const conSold = r.items.filter((x) => x.soldQuantity != null).length;
  const conReviews = r.items.filter((x) => x.reviewCount != null).length;
  const distintos = new Set(r.items.map((x) => x.catalogProductId ?? `item:${x.itemId ?? x.id}`)).size;
  const fila = { query: r.query, urls: r.urls, pedidas: r.sel.filter((s) => s.url).length, devueltas: n, catalogo: cat, mlau, conSold, conReviews, distintosTrasDedup: distintos, segundos: r.segundos, usd: r.usageTotalUsd };
  console.log(`  ${r.query.slice(0, 38).padEnd(38)} pedidas ${fila.pedidas} devueltas ${n} | catalogo ${cat} | MLAU ${mlau} | sold ${conSold}/${n} | reviews ${conReviews}/${n} | distintos ${distintos} | ${r.segundos}s | USD ${r.usageTotalUsd}`);
  for (const x of r.items) console.log(`      ${String(x.soldQuantity).padStart(6)}  rev ${String(x.reviewCount).padStart(6)}  ${String(x.id).padEnd(15)} cat=${String(x.catalogProductId).padEnd(12)} ${String(x.title).slice(0, 50)}`);
  return fila;
});

mkdirSync("scripts/investigacion", { recursive: true });
const out = "scripts/investigacion/paso0-escalera-tab-3.6.json";
writeFileSync(out, JSON.stringify({ medidoEl: new Date().toISOString(), valores, resumen, resultados: resultados.map((r) => ({ ...r, sel: r.sel.map((s) => ({ motivo: s.motivo, posicion: s.posicion, tipo: s.tipo, url: s.url, itemId: s.it.itemId, catalogProductId: s.it.catalogProductId, price: s.it.price })) })) }, null, 2));
console.log("\nGuardado en", out);
