/**
 * Impacto de la normalizacion de unidad de venta sobre el golden set
 * (TAB 3.2, 22/9/2026).
 *
 * `scripts/validar-score.mjs` prueba que la FORMULA es reproducible. Esto prueba
 * otra cosa, que es la que el TAB 3.2 tenia que demostrar: cuanto se mueve el
 * score real cuando la normalizacion entra en el pipeline.
 *
 * Resultado al 22/9: **8 de 10 productos quedan bit a bit iguales** — los que no
 * tienen un solo pack en el scrape. Los 2 que se mueven tienen packs reales, y
 * los dos se mueven PARA ABAJO:
 *
 *   organizador-de-cables-escritorio  60 -> 44   (6 de 30 publicaciones son x4/x6)
 *   mancuernas-ajustables-20kg        37 -> 34   (1 de 30 dice "2 Unidad")
 *
 * Eso es el hallazgo que el caso del cable escondia. El bug no solo hacia
 * parecer SATURADO algo viable (pack caro contra unidad barata); tambien hacia
 * parecer VIABLE algo que no lo es (unidad barata contra pack caro). El segundo
 * error es el caro: le dice a alguien que compre.
 *
 * Uso: npx tsx scripts/validar-unidad-golden.mjs
 */

import { readFileSync, readdirSync } from "node:fs";
const { calcularPrecioStats } = await import("../lib/confianza.ts");
const { calcularScore } = await import("../lib/score.ts");
const { normalizarUnidadDeVenta, detectarUnidades } = await import("../lib/unidad.ts");

const DIR = "scripts/fixtures";
const COSTOS = {
  "auriculares-bluetooth": 9000, "airpods-pro-apple": 250000,
  "silla-gamer-ergonomica": 180000, "termo-stanley-473ml": 35000,
  "organizador-de-cables-escritorio": 2500, "lampara-de-sal-del-himalaya": 8000,
  "cepillo-de-dientes-electrico": 25000, "mancuernas-ajustables-20kg": 70000,
  "camiseta-deportiva-dry-fit": 9000, "mini-lavadora-portatil": 48000,
};

let cambiaron = 0;
for (const f of readdirSync(DIR).filter(x => x.endsWith(".json"))) {
  const slug = f.replace(".json", "");
  const fx = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));
  const listings = fx.listings ?? fx.scrape?.listings ?? [];
  const producto = fx.query ?? fx.q ?? slug.replace(/-/g, " ");
  const costo = COSTOS[slug] ?? 10000;

  const run = (ls, c) => {
    const precios = ls.map(l => l.price).filter(p => p !== null && p > 0);
    const cv = ls.filter(l => (l.soldQuantity ?? 0) > 0).length;
    const st = calcularPrecioStats(precios, cv, c);
    if (!st) return null;
    return calcularScore({ producto, pais: "AR", perfil: "principiante", costoLocal: c, listings: ls, stats: st.stats, confianza: st.confianza });
  };

  const antes = run(listings, costo);
  const n = normalizarUnidadDeVenta({ producto, costoLocal: costo, listings });
  const desp = run(n.listings, n.costoUnitario ?? costo);
  const packs = listings.filter(l => detectarUnidades(l.title) > 1);
  const igual = antes?.score === desp?.score;
  if (!igual) cambiaron++;
  console.log(`${igual ? "=" : "≠"} ${slug.padEnd(34)} ${antes?.score} -> ${desp?.score}  | consulta x${n.unidad.multiplicador_consulta} | listings pack: ${n.unidad.listings_ajustados}/${n.unidad.listings_evaluados}`);
  for (const p of packs.slice(0, 3)) console.log(`     pack detectado x${detectarUnidades(p.title)}: ${p.title.slice(0, 78)}`);
}
console.log(`\n${cambiaron} de 10 productos cambian de score.`);
