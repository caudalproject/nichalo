/**
 * Validacion del filtro de relevancia (23/9/2026).
 *
 * Corre `filtrarRelevantes` sobre los 10 fixtures reales del golden set y para
 * cada uno imprime que se descarto, cuanto se movieron los percentiles y si el
 * nivel de confianza cambio.
 *
 * QUE HAY QUE MIRAR, en este orden:
 *
 * 1. LA COLUMNA "descartados". Cada titulo que aparece ahi tiene que ser
 *    obviamente otra cosa. Si aparece una publicacion legitima, el filtro tiene
 *    un falso positivo y hay que ajustar RUIDO o COBERTURA_MINIMA — no dejarlo
 *    pasar porque "el promedio mejoro".
 *
 * 2. EL RATIO p90/p10. Es la medida de si la limpieza sirvio. Tiene que bajar
 *    en los scrapes mezclados y quedarse igual en los limpios.
 *
 * 3. LOS "no aplicado". Son los casos donde el filtro se auto-desactivo. No son
 *    un fallo: son la guarda funcionando. Pero si TODOS los fixtures caen ahi,
 *    el filtro no sirve para nada y hay que revisarlo.
 *
 * Uso:
 *   npx tsx scripts/validar-relevancia.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const { filtrarRelevantes } = await import("../lib/relevancia.ts");
const { calcularPrecioStats } = await import("../lib/confianza.ts");

const DIR = join(process.cwd(), "scripts", "fixtures");

let totalDescartados = 0;
let conFiltro = 0;
let desactivados = 0;

for (const archivo of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const fixture = JSON.parse(readFileSync(join(DIR, archivo), "utf8"));
  const producto = fixture.query;
  const listings = fixture.listings ?? [];

  const antes = precios(listings);
  const r = filtrarRelevantes({ producto, searchKeyword: null, listings });
  const despues = precios(r.listings);

  const statsAntes = calcularPrecioStats(antes, conVentas(listings));
  const statsDespues = calcularPrecioStats(despues, conVentas(r.listings), undefined, {
    n_descartados: r.n_descartados,
    aplicado: r.aplicado,
    muestra_descartada: r.muestra_descartada,
    n_evaluados: listings.length,
  });

  console.log(`\n━━━ ${producto} (${listings.length} publicaciones)`);

  if (!r.aplicado) {
    desactivados++;
    console.log(
      `  filtro NO aplicado${
        r.n_descartados > 0
          ? ` (se abstuvo: habria descartado ${r.n_descartados} de ${listings.length})`
          : " (nada que descartar)"
      }`
    );
  } else {
    conFiltro++;
    totalDescartados += r.n_descartados;
    console.log(`  descartadas: ${r.n_descartados} → quedan ${r.listings.length}`);
    for (const t of r.muestra_descartada) console.log(`    ✗ ${t}`);
  }

  const ra = statsAntes?.confianza.ratio_p90_p10 ?? 0;
  const rd = statsDespues?.confianza.ratio_p90_p10 ?? 0;
  const na = statsAntes?.confianza.nivel ?? "?";
  const nd = statsDespues?.confianza.nivel ?? "?";
  const flecha = rd < ra ? "↓" : rd > ra ? "↑" : "=";
  console.log(`  ratio p90/p10: ${ra} → ${rd} ${flecha}   confianza: ${na} → ${nd}`);
  console.log(
    `  mediana: ${fmt(statsAntes?.stats.precio_mediano)} → ${fmt(statsDespues?.stats.precio_mediano)}`
  );
  if (statsDespues?.confianza.motivos.length) {
    console.log(`  motivos: ${statsDespues.confianza.motivos.join(", ")}`);
  }
}

console.log(
  `\n━━━ Total: ${conFiltro}/${conFiltro + desactivados} fixtures filtrados, ${totalDescartados} publicaciones descartadas.`
);

function precios(ls) {
  return ls.map((l) => l.price).filter((p) => typeof p === "number" && p > 0);
}
function conVentas(ls) {
  return ls.filter((l) => (l.soldQuantity ?? 0) > 0).length;
}
function fmt(n) {
  return n == null ? "-" : `$${n.toLocaleString("es-AR")}`;
}
