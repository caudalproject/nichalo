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

console.log("\nEL CASO DEL 24/9 (consulta por peso: el conteo de envases no es su unidad)");
{
  // Reproduce 52e064c2 con numeros reales: el mercado verdadero de la frambuesa
  // liofilizada de 20 g esta entre $11.700 y $12.959, y una caja de 27 sobres
  // a $3.775 se dividia por 27 y entraba a la muestra valiendo $139,81. Seis
  // de treinta asi alcanzaban para que p90/p10 diera 66 y la pagina dijera
  // "Los datos de este analisis no son confiables" sobre un scrape sano.
  const listings = [
    { title: "Fruta Frambuesa Liofilizada 20g Premium Pomona Foods Snack", price: 11700 },
    { title: "Frambuesa Liofilizada Fruta Deshidratada 20g", price: 11900 },
    { title: "Frambuesa Liofilizada Fruta Deshidratada 20 G", price: 12959 },
    { title: "Frambuesa Liofilizada Caja X 27 Sobres", price: 3775 },
  ];
  const r = normalizarUnidadDeVenta({
    producto: "Frambuesa liofilizada 20gr",
    costoLocal: 9000,
    listings,
  });
  const intacto = r.listings.every((l, i) => l.price === listings[i].price);
  const ok =
    intacto &&
    r.unidad.base_por_contenido === true &&
    r.unidad.listings_ajustados === 0 &&
    r.costoUnitario === 9000;
  if (!ok) fallas++;
  console.log(
    `  ${ok ? "ok  " : "FALLA"}  la caja de 27 sobres sigue valiendo ${r.listings[3].price} y no ${Math.round(3775 / 27)}`
  );

  // La contracara: sin peso en la consulta, el pack se sigue dividiendo. Es el
  // organizador de cables del golden set, que tiene que quedar como estaba.
  const s = normalizarUnidadDeVenta({
    producto: "organizador de cables escritorio",
    costoLocal: 2000,
    listings: [{ title: "Organizador De Cables Soporte Guardacables X4", price: 8000 }],
  });
  const ok2 = s.listings[0].price === 2000 && s.unidad.listings_ajustados === 1 && !s.unidad.base_por_contenido;
  if (!ok2) fallas++;
  console.log(`  ${ok2 ? "ok  " : "FALLA"}  sin peso en la consulta el pack x4 se sigue dividiendo: 8000 -> ${s.listings[0].price}`);

  // Y si la consulta declara conteo, el peso del titulo no la desactiva: es el
  // caso del 21/9, "pack de 3 rollos de cable de 100 m".
  const t = normalizarUnidadDeVenta({
    producto: "pack de 3 rollos de cable de 100 m",
    costoLocal: 150000,
    listings: [{ title: "Rollo cable 100 m", price: 62980 }],
  });
  const ok3 = t.costoUnitario === 50000 && !t.unidad.base_por_contenido;
  if (!ok3) fallas++;
  console.log(`  ${ok3 ? "ok  " : "FALLA"}  "100 m" en la consulta no desactiva un pack x3 declarado: costo -> ${t.costoUnitario}`);
}

console.log("\nNORMALIZACION POR CONTENIDO (el lote de 1 kg no se descarta: se convierte)");
{
  // Scrape real de "frambuesa liofilizada 20gr" medido el 24/9: la mediana
  // daba $42.703 sobre un mercado que de verdad esta en $11.700-$13.000,
  // porque adentro habia lotes por kilo de hasta $207.650.
  const r = normalizarUnidadDeVenta({
    producto: "Frambuesa liofilizada 20gr",
    costoLocal: 9000,
    listings: [
      { title: "Frambuesa Liofilizada 20g Premium", price: 11700 },
      { title: "Frambuesa Liofilizada Fruta Deshidratada 1 Kg", price: 200000 },
    ],
  });
  // 1 kg / 20 g = 50x  ->  $200.000 / 50 = $4.000 por cada 20 g
  const ok = r.listings[0].price === 11700 && r.listings[1].price === 4000;
  if (!ok) fallas++;
  console.log(`  ${ok ? "ok  " : "FALLA"}  el kilo a $200.000 entra valiendo ${r.listings[1].price} por 20 g, y el de 20 g no se toca`);

  // LA GUARDA QUE EVITA EL FALSO POSITIVO CARO: una mancuerna de 12,5 kg no es
  // 0,625 de una de 20 kg. Factor 1,6 < 3, no se toca.
  const m = normalizarUnidadDeVenta({
    producto: "Mancuernas ajustables 20kg",
    costoLocal: 50000,
    listings: [{ title: "Par De Mancuernas Hexagonal Engomadas 12.5 Kg", price: 80000 }],
  });
  const ok2 = m.listings[0].price === 80000 && m.unidad.listings_ajustados === 0;
  if (!ok2) fallas++;
  console.log(`  ${ok2 ? "ok  " : "FALLA"}  la mancuerna de 12,5 kg sigue valiendo ${m.listings[0].price}: es otra variante, no otro formato`);

  // Mismo contenido declarado de los dos lados: factor 1, no-op.
  const t = normalizarUnidadDeVenta({
    producto: "Termo Stanley 473ml",
    costoLocal: 30000,
    listings: [{ title: "Botella Termica Stanley 473 Ml", price: 70000 }],
  });
  const ok3 = t.listings[0].price === 70000;
  if (!ok3) fallas++;
  console.log(`  ${ok3 ? "ok  " : "FALLA"}  473 ml contra 473 ml no mueve nada: ${t.listings[0].price}`);

  // Dimensiones distintas no se cruzan: gramos contra mililitros no comparan.
  const d = normalizarUnidadDeVenta({
    producto: "Proteina en polvo 500 g",
    costoLocal: 10000,
    listings: [{ title: "Shaker Proteina 600 Ml", price: 12000 }],
  });
  const ok4 = d.listings[0].price === 12000;
  if (!ok4) fallas++;
  console.log(`  ${ok4 ? "ok  " : "FALLA"}  masa contra volumen no se cruzan: ${d.listings[0].price}`);
}

console.log(fallas === 0 ? "\nTODO OK\n" : `\n${fallas} FALLAS\n`);
process.exit(fallas === 0 ? 0 : 1);
