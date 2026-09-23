/**
 * Prueba del detector de unidad de venta (TAB 3.2, 22/9/2026).
 *
 * Son dos listas y ninguna es decorativa:
 *
 * - DEBE_DETECTAR: casos donde el pack es real. Si uno falla, el bug del 21/9
 *   (pack de 3 contra unidad suelta) sigue vivo.
 * - DEBE_IGNORAR: especificaciones, medidas y dimensiones que se PARECEN a un
 *   pack. Estos importan mas que los otros: un falso positivo divide el costo
 *   del usuario por un numero inventado y produce un margen fantastico. Es
 *   preferible no corregir a corregir mal.
 *
 * Uso: npx tsx scripts/validar-unidad.mjs
 */

const { detectarUnidades, normalizarUnidadDeVenta } = await import("../lib/unidad.ts");

const DEBE_DETECTAR = [
  ["Pack x3 rollos de cable 100 m", 3],
  ["cable pack x3 rollos", 3],
  ["Auriculares bluetooth pack de 2", 2],
  ["Medias deportivas 6 unidades", 6],
  ["Tornillos autoperforantes x 50", 50],
  ["Combo 4 lamparas led", 4],
  ["Caja de 12 lapiceras", 12],
  ["Medias docena de vasos", 6], // typo frecuente de "media docena": 6, no 12
  ["Media docena de vasos", 6],
  ["Docena de empanadas", 12],
  ["Set de 3 sartenes", 3],
  ["Cepillos x 4 unidades", 4],
  ["3 pares de guantes de trabajo", 3],
  ["Blister 10 pilas AA", 10],
  ["Pack x 1.000 precintos", 1000 > 500 ? 1 : 1000], // arriba del cap: se ignora
];

const DEBE_IGNORAR = [
  ["Cama Clasica Antidesgarro 70x100", 1],
  ["Cable HDMI 2.1 x 1,5 m", 1],
  ["Tira led 5050 x 5 m", 1],
  ["Mancuernas ajustables 20kg", 1],
  ["Termo Stanley 473ml", 1],
  ["Memoria SD 128 gb", 1],
  ["Parlante bluetooth 20 w rms", 1],
  ["Bateria 5000 mah", 1],
  ["Silla gamer ergonomica", 1],
  ["Auriculares bluetooth", 1],
  ["Set de sabanas 2 plazas", 1], // "2 plazas" es medida, no cantidad vendida
  ["Cinta metrica 3 metros", 1],
  ["Par de medias", 1],
  ["Monitor 24 pulgadas", 1],
  ["Garantia 12 meses", 1],
];

let fallas = 0;

const correr = (titulo, casos) => {
  console.log(`\n${titulo}`);
  for (const [texto, esperado] of casos) {
    const got = detectarUnidades(texto);
    const ok = got === esperado;
    if (!ok) fallas++;
    console.log(`  ${ok ? "ok  " : "FALLA"}  ${String(got).padStart(4)}  (esperado ${String(esperado).padStart(4)})  ${texto}`);
  }
};

correr("DEBE DETECTAR", DEBE_DETECTAR);
correr("DEBE IGNORAR (falsos positivos)", DEBE_IGNORAR);

// ---- La propiedad que hace segura a la normalizacion -----------------------
// Si consulta y publicaciones declaran el MISMO pack, los dos lados se dividen
// por lo mismo y la relacion costo/precio no se mueve. Es la prueba de que esto
// no puede empeorar un caso que ya estaba bien.
console.log("\nSIMETRIA (mismo pack en los dos lados no mueve la relacion)");
{
  const listings = [
    { title: "Rollo cable 100 m pack x3", price: 150000 },
    { title: "Cable pack x3", price: 180000 },
  ];
  const r = normalizarUnidadDeVenta({ producto: "cable pack x3 rollos", costoLocal: 150000, listings });
  const antes = 150000 / 150000;
  const despues = r.costoUnitario / r.listings[0].price;
  const ok = Math.abs(antes - despues) < 1e-9;
  if (!ok) fallas++;
  console.log(`  ${ok ? "ok  " : "FALLA"}  costo/precio antes ${antes} -> despues ${despues}`);
}

console.log("\nEL CASO DEL 21/9 (pack de 3 contra rollo suelto)");
{
  const listings = [
    { title: "Rollo cable unipolar 100 m", price: 62980 },
    { title: "Cable 100 m", price: 58000 },
  ];
  const r = normalizarUnidadDeVenta({ producto: "cable pack x3 rollos 100 m", costoLocal: 150000, listings });
  const ok = r.costoUnitario === 50000 && r.unidad.aplicada && r.unidad.listings_ajustados === 0;
  if (!ok) fallas++;
  console.log(
    `  ${ok ? "ok  " : "FALLA"}  costo 150000 -> ${r.costoUnitario} por unidad, contra mediana 62980. El margen deja de ser -1375%.`
  );
}

console.log("\nNO-OP (sin packs devuelve el array original por identidad)");
{
  const listings = [{ title: "Auriculares bluetooth", price: 9000 }];
  const r = normalizarUnidadDeVenta({ producto: "auriculares bluetooth", costoLocal: 9000, listings });
  const ok = r.listings === listings && r.costoUnitario === 9000 && !r.unidad.aplicada;
  if (!ok) fallas++;
  console.log(`  ${ok ? "ok  " : "FALLA"}  identidad preservada: ${r.listings === listings}`);
}

console.log(fallas === 0 ? "\nTODO OK\n" : `\n${fallas} FALLAS\n`);
process.exit(fallas === 0 ? 0 : 1);
