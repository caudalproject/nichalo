/**
 * Prueba la segunda pasada (verificacion semantica) sobre los fixtures reales.
 *
 * Gasta llamadas a Gemini de verdad, por eso no corre solo: hay que pasarle los
 * fixtures a probar.
 *
 *   npx tsx --env-file=.env.local scripts/validar-pertenencia.mjs auriculares-bluetooth organizador-de-cables-escritorio
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const { filtrarRelevantes, aplicarPertenencia } = await import("../lib/relevancia.ts");
const { verificarPertenencia } = await import("../lib/gemini.ts");
const { calcularPrecioStats } = await import("../lib/confianza.ts");

/** Fichas de prueba: lo que devolveria la lectura de la foto. */
const FICHAS = {
  "auriculares-bluetooth":
    "Auriculares inalámbricos bluetooth de uso personal, formato in-ear o vincha, gama de consumo masivo, de cualquier marca.",
  "organizador-de-cables-escritorio":
    "Organizador de cables para escritorio hogareño: clips, soportes adhesivos o canaletas plásticas para agrupar cables sueltos.",
  "mini-lavadora-portatil":
    "Mini lavadora portátil de uso hogareño para prendas pequeñas, compacta, eléctrica o USB, de bajo costo.",
};

const pedidos = process.argv.slice(2);
if (pedidos.length === 0) {
  console.error("Pasá al menos un fixture (sin .json).");
  process.exit(1);
}

for (const nombre of pedidos) {
  const f = JSON.parse(
    readFileSync(join(process.cwd(), "scripts", "fixtures", `${nombre}.json`), "utf8")
  );
  const listings = f.listings ?? [];
  const r1 = filtrarRelevantes({ producto: f.query, searchKeyword: null, listings });

  const marcados = await verificarPertenencia({
    producto: f.query,
    // En produccion la ficha sale de la foto (obligatoria). Aca se simula con
    // una descripcion del producto para probar el caso real, no el degradado.
    ficha: FICHAS[nombre] ?? null,
    titulos: r1.listings.map((l) => l.title ?? ""),
  });
  const r2 = aplicarPertenencia({
    listings: r1.listings,
    descartar: marcados,
    nOriginal: listings.length,
    descartadosPrevios: r1.n_descartados,
  });

  const st = (ls, rel) =>
    calcularPrecioStats(
      ls.map((l) => l.price).filter((p) => typeof p === "number" && p > 0),
      ls.filter((l) => (l.soldQuantity ?? 0) > 0).length,
      undefined,
      rel ? { ...rel, n_evaluados: listings.length } : undefined
    );

  const antes = st(listings, null);
  const final = st(r2.listings, r2);

  console.log(`\n━━━ ${f.query}`);
  console.log(`  palabras: -${r1.n_descartados}   semántica: -${marcados.length} (marcó ${marcados.length})`);
  console.log(`  quedan ${r2.listings.length} de ${listings.length}${r2.aplicado ? "" : "  [guardas: se abstuvo]"}`);
  for (const i of marcados.slice(0, 6)) console.log(`    ✗ ${r1.listings[i]?.title}`);
  console.log(`  ratio p90/p10: ${antes?.confianza.ratio_p90_p10} → ${final?.confianza.ratio_p90_p10}`);
  console.log(`  confianza: ${antes?.confianza.nivel} → ${final?.confianza.nivel}`);
  console.log(`  mediana: $${antes?.stats.precio_mediano?.toLocaleString("es-AR")} → $${final?.stats.precio_mediano?.toLocaleString("es-AR")}`);
}
