/**
 * Validacion de entrada — TAB 3.3 (1/10/2026). Casos reales de public.analyses.
 *
 * Uso: npx tsx scripts/validar-entrada.mjs
 * Sale con codigo 1 si algun caso no da lo esperado.
 */
const {
  costoImplausiblementeBajo,
  sugerirCostoEnMiles,
  parsearMontoAR,
  normalizarProducto,
  COSTO_MINIMO_PLAUSIBLE,
} = await import("../lib/entrada.ts");

let fallos = 0;
const check = (ok, msg) => {
  if (!ok) fallos++;
  console.log(`   ${ok ? "OK " : "FALLA"} ${msg}`);
};

console.log(`== COSTO (umbral: < $${COSTO_MINIMO_PLAUSIBLE} pide confirmacion)\n`);
const COSTOS = [
  { costo: 85, nota: "JBL Tune 520BT — re-corrido con 85000 dio 11 SATURADO", pide: true },
  { costo: 31, nota: "Remera Minutemen", pide: true },
  { costo: 15, nota: "Calleras CrossFit", pide: true },
  { costo: 3500, nota: "piso legitimo observado (aspiradora mini)", pide: false },
  { costo: 85000, nota: "el JBL bien cargado", pide: false },
];
for (const c of COSTOS) {
  const pide = costoImplausiblementeBajo(c.costo);
  console.log(`$${c.costo} (${c.nota})`);
  console.log(`   pide confirmacion: ${pide}${pide ? ` -> "Quisiste decir $${sugerirCostoEnMiles(c.costo).toLocaleString("es-AR")} o USD ${c.costo}?"` : ""}`);
  check(pide === c.pide, `esperado: ${c.pide}`);
}

console.log("\n== PARSEO (causa probable: parseFloat('85.000') === 85)\n");
for (const [txt, esp] of [["85.000", 85000], ["31.000", 31000], ["15.000", 15000], ["14.900", 14900], ["1.250.000", 1250000], ["14.900,50", 14900.5], ["14,5", 14.5], ["85", 85], ["$ 85.000", 85000]]) {
  const got = parsearMontoAR(txt);
  console.log(`"${txt}" -> ${got}   (parseFloat viejo: ${parseFloat(txt.replace(",", "."))})`);
  check(got === esp, `esperado ${esp}`);
}

console.log("\n== PRODUCTO (link de ML)\n");
const URLS = [
  { u: "https://www.mercadolibre.com.ar/cartera-bolso-set-x-4-piezas-premium-importado-mujer-moda/up/MLAU229542010", tipo: "link_ml", titulo: "cartera bolso set x 4 piezas premium importado mujer moda" },
  { u: "https://www.mercadolibre.com.ar/silla-sillon-gerencial-ejecutiva-de-escritorio-oficina-reclinable-giratoria-con-apoya-pi", tipo: "link_ml", titulo: "silla sillon gerencial ejecutiva de escritorio oficina reclinable giratoria con apoya pi".slice(0, 120) },
  { u: "https://www.mercadolibre.com.ar/horno-y-freidora-de-aire-af950-liliana-117l-plateado/p/MLA45120270#polycard_client=searc", tipo: "link_ml", titulo: "horno y freidora de aire af950 liliana 117l plateado" },
  { u: "https://www.mercadolibre.com.ar/pastillas-limpia-lavarropas-limpieza-profunda-rico-olor-24u/p/MLA2084600658?pdp_filters=", tipo: "link_ml", titulo: "pastillas limpia lavarropas limpieza profunda rico olor 24u" },
  { u: "https://articulo.mercadolibre.com.ar/MLA-1234567890-silla-gamer-ergonomica-_JM?quantity=1", tipo: "link_ml", titulo: "silla gamer ergonomica" },
  { u: "https://www.mercadolibre.com.ar/p/MLA45120270", tipo: "link_sin_titulo" },
  { u: "https://www.mercadolibre.com.ar/", tipo: "link_sin_titulo" },
  { u: "https://www.google.com/search?q=cartera", tipo: "link_sin_titulo" },
  { u: "cartera de cuero", tipo: "texto", titulo: "cartera de cuero" },
];
for (const c of URLS) {
  const r = normalizarProducto(c.u);
  console.log(`${c.u.slice(0, 80)}${c.u.length > 80 ? "…" : ""}`);
  console.log(`   -> ${r.tipo}${r.producto ? ` "${r.producto}"` : ""}`);
  check(r.tipo === c.tipo, `tipo esperado: ${c.tipo}`);
  if (c.titulo) check(r.producto === c.titulo, `titulo esperado: "${c.titulo}"`);
  check(!r.producto || !/https?|mercadolibre/i.test(r.producto), "la URL no llega a la busqueda");
}

console.log(fallos ? `\n${fallos} FALLA(S)` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
