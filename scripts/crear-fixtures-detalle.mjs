/**
 * TAB 3.6 — arma los fixtures del golden set CON datos de detalle (ventas
 * acumuladas), a partir de los runs reales del paso 0 del 11/10. No paga nada:
 * lee datasets que ya estan en Apify (expiran a los ~7 dias en plan FREE, por
 * eso el resultado se congela en scripts/fixtures/).
 *
 * Usa el MISMO codigo de produccion (`getApifyResults`, `getDetalleResults`)
 * para que el fixture tenga exactamente la forma que ve `calcularScore`.
 *
 * Uso: npx tsx --env-file=.env.local scripts/crear-fixtures-detalle.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";

const { getApifyResults, getDetalleResults, urlDetalle } = await import("../lib/apify.ts");

const token = process.env.APIFY_API_KEY;
const paso0 = JSON.parse(readFileSync("scripts/investigacion/paso0-escalera-tab-3.6.json", "utf8"));

const SLUG = {
  "escurridor vajilla 2 niveles con drenaje": "escurridor-vajilla-2-niveles-detalle",
  "Jbl Go4 Generico": "jbl-go4-generico-detalle",
  "Tabla de pilates plegable bandas elásticas": "tabla-de-pilates-plegable-detalle",
};

// Run de listado de cada dataset (para pasar por getApifyResults tal cual).
const runs = (await (await fetch(`https://api.apify.com/v2/actor-runs?desc=1&limit=100&token=${token}`)).json()).data.items;

for (const r of paso0.resultados) {
  const runListado = runs.find((x) => x.defaultDatasetId === r.dataset);
  if (!runListado) throw new Error(`no encuentro el run de listado del dataset ${r.dataset}`);
  const scrape = await getApifyResults(runListado.id, r.query, "AR", 30);

  // Las mismas 10 que se pidieron en el paso 0, con la forma de produccion.
  const elegidas = r.sel.map((s) => ({
    itemId: s.itemId,
    catalogProductId: s.catalogProductId ?? null,
    url: urlDetalle(s.itemId, "AR"),
    titulo: scrape.listings.find((l) => l.itemId === s.itemId)?.title ?? "",
    motivo: s.motivo,
  }));
  const ventas = await getDetalleResults(r.runId, elegidas);

  const out = `scripts/fixtures/${SLUG[r.query]}.json`;
  writeFileSync(
    out,
    JSON.stringify({ ...scrape, ventas, origen: { listadoRunId: runListado.id, detalleRunId: r.runId, tab: "3.6 paso 0" } }, null, 2)
  );
  const conDato = ventas.productos.filter((p) => p.vendidas != null).length;
  console.log(`${out}: ${scrape.listings.length} listings, ${ventas.productos.length} detalles (${conDato} con ventas)`);
}
