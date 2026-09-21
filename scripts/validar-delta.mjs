/**
 * Validacion del delta (TAB 5, 21/9/2026).
 *
 * Toma un fixture real del golden set del TAB 3 y fabrica una "segunda semana"
 * con cambios CONOCIDOS. Si el delta no los detecta exactamente, la funcion
 * esta mal. Es la contraparte de scripts/validar-score.mjs: alla se probaba que
 * el mismo mercado da el mismo numero, aca que un mercado distinto da el
 * cambio correcto.
 *
 * Uso: npx tsx --env-file=.env.local scripts/validar-delta.mjs
 */
import { readFileSync } from "node:fs";

const { calcularPrecioStats } = await import("../lib/confianza.ts");
const { calcularMetricas } = await import("../lib/score.ts");
const { calcularDelta } = await import("../lib/delta.ts");

const RUTA = "scripts/fixtures/termo-stanley-473ml.json";
const base = JSON.parse(readFileSync(RUTA, "utf8"));

function medir(listings, fetched_at) {
  const precios = listings.map((l) => l.price).filter((p) => p !== null && p > 0);
  const cv = listings.filter((l) => (l.soldQuantity ?? 0) > 0).length;
  const c = calcularPrecioStats(precios, cv);
  const metricas = calcularMetricas(listings, c.stats);
  return {
    fetched_at,
    n_listings: listings.length,
    precio_stats: c.stats,
    metricas,
    vendedores: Array.from(new Set(listings.map((l) => (l.seller ?? "").trim()).filter(Boolean))),
    score: 75,
    formula: "score-v1-2026-09-20",
  };
}

const semana1 = medir(base.listings, "2026-09-14T00:00:00Z");

// Cambios fabricados: precios -12%, entran 3 vendedores nuevos, sale 1.
const mutados = base.listings.map((l) => ({ ...l, price: l.price ? Math.round(l.price * 0.88) : l.price }));
const sinUno = mutados.filter((l) => l.seller !== base.listings[0].seller);
const conNuevos = [
  ...sinUno,
  { ...mutados[0], seller: "VENDEDOR NUEVO 1", url: "https://x/1" },
  { ...mutados[1], seller: "VENDEDOR NUEVO 2", url: "https://x/2" },
  { ...mutados[2], seller: "VENDEDOR NUEVO 3", url: "https://x/3" },
];
const semana2 = medir(conNuevos, "2026-09-21T00:00:00Z");

const d = calcularDelta(semana1, semana2);

console.log(`\nVentana: ${d.dias} días`);
console.log(`TITULAR: ${d.titular}\n`);
console.log("Vendedores:");
console.log(`  nuevos: ${d.vendedores.nuevos.length} → ${d.vendedores.nuevos.join(", ")}`);
console.log(`  salieron: ${d.vendedores.salieron.length} → ${d.vendedores.salieron.join(", ")}`);
console.log(`  material: ${d.vendedores.material}\n`);
console.log("Cambios:");
for (const c of d.cambios) {
  const v = c.sin_dato
    ? "SIN DATO"
    : `${c.antes} → ${c.ahora}` + (c.delta_pct !== null ? ` (${(c.delta_pct * 100).toFixed(1)}%)` : "");
  console.log(`  ${c.material ? "★" : " "} ${c.etiqueta.padEnd(42)} ${v}`);
}
console.log(`\nScore comparable: ${d.score.comparable}  delta: ${d.score.delta}`);

// --- Chequeo 2: formula distinta => score NO comparable -------------------
const otraFormula = calcularDelta(semana1, { ...semana2, formula: "score-v2", score: 40 });
console.log(`\n[formula distinta] comparable=${otraFormula.score.comparable} delta=${otraFormula.score.delta}`);
console.log(`  motivo: ${otraFormula.score.motivo}`);

// --- Chequeo 3: mismo scrape dos veces => sin cambios ---------------------
const igual = calcularDelta(semana1, medir(base.listings, "2026-09-21T00:00:00Z"));
console.log(`\n[mismo mercado] materiales=${igual.hay_cambios_materiales} → "${igual.titular}"`);
