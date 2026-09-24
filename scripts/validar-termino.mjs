/**
 * Validacion del anclaje del termino de busqueda (24/9/2026).
 *
 * Cada caso declara con que se DEBERIA scrapear. El que importa es el
 * primero: es el analisis 47535fd3, donde la foto metio "soplador" y mando el
 * scrape a la categoria de sopladores de jardin.
 *
 * Uso: npx tsx scripts/validar-termino.mjs
 */

const { resolverTerminoBusqueda } = await import("../lib/termino.ts");

const CASOS = [
  {
    nombre: "24/9 — la foto mete un sustantivo de otra categoria",
    producto: "Aspiradora inalámbrica mini de alta potencia para hogar y automóvil",
    terminoModelo: "mini aspiradora soplador portátil",
    espera: { origen: "modelo_rechazado_sustantivo_nuevo", termino: "aspiradora inalambrica mini" },
  },
  {
    nombre: "usuario vago — la foto SI puede precisar",
    producto: "aspiradora",
    terminoModelo: "aspiradora de mano inalámbrica",
    espera: { origen: "modelo", termino: "aspiradora de mano inalámbrica" },
  },
  {
    nombre: "usuario especifico + foto que solo agrega modificadores",
    producto: "cepillo de dientes electrico recargable sonico",
    terminoModelo: "cepillo dientes electrico inalambrico",
    espera: { origen: "modelo", termino: "cepillo dientes electrico inalambrico" },
  },
  {
    nombre: "la foto se leyo mal — no conserva el nucleo",
    producto: "termo stanley 473ml",
    terminoModelo: "botella plastica deportiva",
    espera: { origen: "modelo_rechazado_sin_nucleo", termino: "termo stanley 473ml" },
  },
  {
    nombre: "sin foto utilizable — recorte del texto del usuario",
    producto: "Silla gamer ergonomica reclinable con apoyapies giratoria negra",
    terminoModelo: null,
    espera: { origen: "usuario_recortado", termino: "silla gamer ergonomica reclinable apoyapies" },
  },
  {
    nombre: "consulta corta — se deja intacta",
    producto: "mini lavadora portatil",
    terminoModelo: null,
    espera: { origen: "usuario_recortado", termino: "mini lavadora portatil" },
  },
];

let fallos = 0;
for (const c of CASOS) {
  const r = resolverTerminoBusqueda({ producto: c.producto, terminoModelo: c.terminoModelo });
  const okOrigen = r.origen === c.espera.origen;
  const okTermino = r.termino === c.espera.termino;
  const ok = okOrigen && okTermino;
  if (!ok) fallos++;
  console.log(`\n${ok ? "✓" : "✗"} ${c.nombre}`);
  console.log(`    tipeado : ${JSON.stringify(c.producto)}`);
  console.log(`    foto    : ${JSON.stringify(c.terminoModelo)}`);
  console.log(`    se busca: ${JSON.stringify(r.termino)}  [${r.origen}${r.palabra_intrusa ? ` · intrusa="${r.palabra_intrusa}"` : ""}]`);
  if (!ok) console.log(`    ESPERADO: ${JSON.stringify(c.espera.termino)}  [${c.espera.origen}]`);
}

console.log(`\n━━━ ${CASOS.length - fallos}/${CASOS.length} casos OK`);
process.exit(fallos > 0 ? 1 : 0);
