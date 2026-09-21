/**
 * NOTA 20/9 (TAB 3): este script quedo desactualizado. `analizarConGemini`
 * ahora exige el argumento `score` ya calculado por lib/score.ts. Se deja como
 * registro de la medicion del 13/9; si hace falta volver a correrlo, hay que
 * agregarle la llamada a calcularScore como hace scripts/validar-score.mjs.
 *
 * Mide si "Analisis avanzado Pro" cambia el OUTPUT o solo el input.
 *
 * Corre Apify UNA vez y le pasa EL MISMO scrape a Gemini dos veces: una sin
 * datos_pro y otra con. Asi la unica variable es el bloque Pro del prompt.
 * Dos corridas completas costarian ~0,42 USD y el scrape podria diferir entre
 * ambas, contaminando el diff.
 *
 * Uso: npx tsx --env-file=.env.local scripts/experimento-datos-pro.mjs
 */

const { startApifyRun, checkApifyRun, getApifyResults } = await import("../lib/apify.ts");
const { analizarConGemini } = await import("../lib/gemini.ts");
const { calcularPrecioStats } = await import("../lib/confianza.ts");

const PRODUCTO = "auriculares bluetooth deportivos";
const PAIS = "AR";
const COSTO_USD = 6;
const TASA = 1515;

console.log("Scrapeando una sola vez…");
const runId = await startApifyRun(PRODUCTO, PAIS, "free");
let status = "RUNNING";
while (status === "RUNNING" || status === "READY") {
  await new Promise(r => setTimeout(r, 5000));
  ({ status } = await checkApifyRun(runId));
  process.stdout.write(".");
}
console.log("\nrun:", status);
const scrape = await getApifyResults(runId, PRODUCTO, PAIS, 50);
console.log("listings:", scrape.totalListings);

const precios = scrape.listings.map(l => l.price).filter(p => p != null && p > 0);
const conVentas = scrape.listings.filter(l => (l.soldQuantity ?? 0) > 0).length;
const calc = calcularPrecioStats(precios, conVentas, COSTO_USD * TASA);

const base = {
  producto: PRODUCTO, pais: PAIS, costoEstimadoUsd: COSTO_USD, scrape,
  currency: { code: "ARS", symbol: "$", name: "Peso argentino" },
  exchangeRate: TASA, perfilVendedor: "principiante",
  precioStats: calc?.stats, confianza: calc?.confianza,
};

console.log("\n--- Gemini SIN datos_pro ---");
const sin = await analizarConGemini(base);

console.log("--- Gemini CON datos_pro ---");
const con = await analizarConGemini({
  ...base,
  datosPro: {
    origen_producto: "importado de China",
    presupuesto_inicial: 1500,
    tiene_variantes: "si",
    detalle_variantes: "negro, blanco y azul",
    canal_distribucion: "solo Mercado Libre",
  },
});

const campos = ["score","veredicto","resumen","recomendacion","tendencia","estacionalidad","titulo_sugerido_publicacion"];
console.log("\n===== DIFF =====");
for (const k of campos) {
  const a = JSON.stringify(sin[k]), b = JSON.stringify(con[k]);
  console.log(`\n### ${k} ${a === b ? "[IDENTICO]" : "[DIFIERE]"}`);
  if (a !== b) { console.log("  SIN:", String(sin[k]).slice(0, 400)); console.log("  CON:", String(con[k]).slice(0, 400)); }
}
for (const k of ["diferenciadores_oportunidad","riesgos"]) {
  console.log(`\n### ${k}`);
  console.log("  SIN:", JSON.stringify(sin[k]));
  console.log("  CON:", JSON.stringify(con[k]));
}
console.log("\n### analisis_costo_proveedor");
console.log("  SIN:", JSON.stringify(sin.analisis_costo_proveedor));
console.log("  CON:", JSON.stringify(con.analisis_costo_proveedor));
console.log("\n### claves del JSON");
const kSin = Object.keys(sin).sort(), kCon = Object.keys(con).sort();
console.log("  identicas:", JSON.stringify(kSin) === JSON.stringify(kCon));
console.log("  solo en CON:", kCon.filter(k => !kSin.includes(k)));
