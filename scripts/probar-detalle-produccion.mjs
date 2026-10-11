/**
 * TAB 3.6 — prueba de humo del detalle con el codigo de PRODUCCION, sin
 * Inngest: filtro de palabras -> elegirParaDetalle -> startDetalleRun ->
 * polling -> getDetalleResults -> getRunCosto -> bloque C.
 *
 * Mide lo que el paso 0 no midio: el tiempo con maxConcurrency = 10 (el
 * timeout de produccion es 180 s) y que la union detalle/listado funcione sobre
 * un listado que no se uso para disenar.
 *
 * Costo: ~USD 0,25 (10 x item-detail). Lee un listado ya pagado.
 * Uso: npx tsx --env-file=.env.local scripts/probar-detalle-produccion.mjs <runIdListado> "<producto>"
 */

const { getApifyResults, elegirParaDetalle, startDetalleRun, checkApifyRun, getDetalleResults, getRunCosto } =
  await import("../lib/apify.ts");
const { filtrarRelevantes } = await import("../lib/relevancia.ts");
const { resumirVentas, textoVendidas, etiquetaTipo, deduplicar } = await import("../lib/ventas.ts");

const [runListado, producto] = process.argv.slice(2);
if (!runListado || !producto) throw new Error("uso: <runIdListado> \"<producto>\"");

const scrape = await getApifyResults(runListado, producto, "AR", 30);
const pre = filtrarRelevantes({ producto, listings: scrape.listings });
const elegidas = elegirParaDetalle(pre.listings, "AR");
console.log(`listado ${scrape.listings.length} -> tras filtro de palabras ${pre.listings.length} -> elegidas ${elegidas.length}`);
for (const e of elegidas) console.log(`  ${e.motivo.padEnd(10)} ${e.itemId.padEnd(14)} ${e.titulo.slice(0, 60)}`);

const t0 = Date.now();
const runId = await startDetalleRun(elegidas, "AR", 240);
let status = "READY";
while (["READY", "RUNNING", "TIMING-OUT", "ABORTING"].includes(status)) {
  await new Promise((r) => setTimeout(r, 5000));
  ({ status } = await checkApifyRun(runId));
}
const segundos = Math.round((Date.now() - t0) / 1000);
const ventas = await getDetalleResults(runId, elegidas);
await new Promise((r) => setTimeout(r, 10000));
const costo = await getRunCosto(runId);

console.log(`\nrun ${runId}: ${status} en ${segundos}s (timeout de produccion: 180s)`);
console.log(`costo: USD ${costo?.usd} eventos ${JSON.stringify(costo?.eventos)}`);
console.log(`detalle: ${ventas.estado}, ${ventas.productos.length}/${ventas.pedidas} paginas`);
for (const p of deduplicar(ventas.productos)) {
  console.log(`  ${textoVendidas(p.vendidas).padEnd(22)} ${p.tipo.padEnd(11)} (${etiquetaTipo(p.tipo)}) ${p.titulo.slice(0, 50)}`);
}
console.log("resumen:", JSON.stringify(resumirVentas(ventas.productos)));
