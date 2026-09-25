/**
 * Normalizacion de unidad de venta (TAB 3.2, 22/9/2026).
 *
 * POR QUE EXISTE
 *
 * Hasta la v1.1 el analisis comparaba el costo que ingresaba el usuario contra
 * los precios del scrape **sin mirar cuantas unidades habia adentro de cada
 * cosa**. Caso real del 21/9: costo de un **pack de 3 rollos de cable de 100 m
 * ($150.000)** contra un scrape de **rollos sueltos** (mediana $62.980). Margen
 * -1375%, veredicto SATURADO. El producto podia ser perfectamente viable: se
 * comparo 3 manzanas contra 1 manzana.
 *
 * El TAB 3.1 tapo la mitad del sintoma (el techo de 20 ahora exige perder
 * tambien a la mediana). Esto arregla la otra mitad, que es la causa: la
 * entrada, no la formula. Por eso vive en su propio modulo y corre **antes** de
 * `calcularPrecioStats`, no adentro de `lib/score.ts`.
 *
 * LA REGLA QUE LO MANTIENE HONESTO
 *
 * Solo se normaliza con un **multiplicador entero explicito**. "Pack x3" ->  3.
 * "Set de sabanas" -> 1, porque no dice cuantas. Inventar el numero seria el
 * mismo defecto que ya tenemos con `tendencia`, donde el prompt obliga al modelo
 * a inferir algo util aunque no haya dato. Un numero equivocado dicho con
 * seguridad es peor que no decirlo.
 *
 * LA PROPIEDAD QUE LO HACE SEGURO
 *
 * Se aplica **a los dos lados**: al costo del usuario y al precio de cada
 * publicacion. Si la consulta es un pack x3 y el titulo scrapeado tambien dice
 * x3, los dos se dividen por 3 y el resultado no se mueve. Solo corrige cuando
 * los lados difieren, que es exactamente el bug. Y si no hay multiplicador en
 * ningun lado, todo queda identico: score-neutral, verificable contra el golden
 * set de `scripts/validar-score.mjs`.
 */

import type { MLListing } from "./apify";

/** Arriba de esto no es un pack de retail, es ruido de un titulo mal parseado. */
const MAX_MULTIPLICADOR = 500;

/**
 * Unidades de medida que NO son cantidad de productos. Un numero seguido de
 * cualquiera de estas es una especificacion, no un pack: "tira led 5 m",
 * "mancuernas 20 kg", "termo 473 ml". Sin esta lista, medio catalogo de
 * Mercado Libre se leeria como pack.
 */
const MEDIDAS =
  "m|mt|mts|metro|metros|cm|mm|km|kg|g|gr|grs|gramo|gramos|mg|l|lt|lts|litro|litros|ml|cc|v|w|kw|hz|mah|ah|gb|tb|mb|rpm|psi|bar|pulg|pulgada|pulgadas|k|mp|mpx|px|hp|nm|c|°c|f|°f|años|ano|anos|meses|dias|usd|ars|hs|h|min|seg";

/**
 * Medidas de CONTENIDO — masa y volumen. Subconjunto de `MEDIDAS`, separado
 * porque responde una pregunta distinta (fix del 24/9, caso 52e064c2).
 *
 * El resto de `MEDIDAS` describe una caracteristica del articulo: "monitor 24
 * pulgadas", "bateria 5000 mah", "cable 100 m". Masa y volumen no: cuando un
 * producto dice "20gr", eso ES lo que se vende. La unidad de venta viene fijada
 * por el contenido, no por la cantidad de envases.
 *
 * La distincion importa por lo que se explica en `normalizarUnidadDeVenta`.
 */
const MEDIDAS_DE_CONTENIDO =
  "kg|kilo|kilos|kilogramo|kilogramos|g|gr|grs|gramo|gramos|mg|l|lt|lts|litro|litros|ml|cc";

const RE_CONTENIDO = new RegExp(
  `\\b\\d+(?:[.,]\\d+)?\\s*(?:${MEDIDAS_DE_CONTENIDO})\\b`,
  "i"
);

/**
 * `true` si el texto fija su unidad de venta por peso o volumen: "frambuesa
 * liofilizada 20gr", "aceite de coco 500 ml", "proteina 1 kg".
 */
export function declaraContenido(texto: string | null | undefined): boolean {
  if (!texto) return false;
  return RE_CONTENIDO.test(texto.toLowerCase());
}

/**
 * Sustantivos que SI cuentan unidades de producto. Deliberadamente corta: cada
 * palabra que se agregue aca es una oportunidad de falso positivo, y un falso
 * positivo divide el costo del usuario por un numero inventado.
 *
 * "par" en singular queda AFUERA a proposito — un par de medias se vende y se
 * cotiza como UNA unidad, no como dos. "pares" en plural si entra: "3 pares"
 * son inequivocamente tres articulos.
 */
const CONTABLES =
  "u|uds|uni|unid|unidad|unidades|pz|pza|pzas|pieza|piezas|rollo|rollos|tira|tiras|par(?:es)|bolsa|bolsas|sobre|sobres|sachet|sachets|capsula|capsulas|comprimido|comprimidos|hoja|hojas|placa|placas|barra|barras";

/**
 * Envases que anuncian un pack y suelen venir con el numero adelante o atras:
 * "pack de 6", "combo x4", "caja 12 unidades".
 */
const ENVASES = "pack|combo|kit|set|caja|cajas|bulto|bultos|blister|display|juego|multipack";

/**
 * Extrae el multiplicador de unidades de un texto libre — el producto que tipeo
 * el usuario o el titulo de una publicacion de Mercado Libre.
 *
 * Devuelve **1** cuando no hay un numero explicito, que es el caso mayoritario y
 * el unico comportamiento seguro: 1 deja todo el pipeline exactamente como
 * estaba.
 *
 * Cuando hay mas de una coincidencia se queda con **la mas grande**. Los titulos
 * de ML encadenan cosas ("Pack x2 Rollos Cable 3 Tiras"), y quedarse con la
 * primera dependeria del orden en que el vendedor escribio el titulo, que no es
 * una senal de nada.
 */
export function detectarUnidades(texto: string | null | undefined): number {
  if (!texto) return 1;

  const t = texto
    .toLowerCase()
    // Separadores de miles: "x 1.000" es un pack de mil, no de uno.
    .replace(/(\d)[. ](\d{3})\b/g, "$1$2");

  const candidatos: number[] = [];

  // Guarda comun a todos los patrones: el numero no puede ser un decimal
  // ("x 2,5 m") ni estar seguido de una unidad de medida ("x 100 m").
  const noEsMedida = `(?![.,]\\d)(?!\\s*(?:${MEDIDAS})\\b)`;

  const patrones: RegExp[] = [
    // "x3", "x 12", "pack x6"  — el \b delante evita "70x100" y "5050x2".
    new RegExp(`\\bx\\s?(\\d{1,3})\\b${noEsMedida}`, "g"),
    // "pack de 6", "combo 4", "caja de 12"
    new RegExp(`\\b(?:${ENVASES})\\s*(?:de\\s+|por\\s+)?(\\d{1,3})\\b${noEsMedida}`, "g"),
    // "6 unidades", "3 rollos", "12 piezas"
    new RegExp(`\\b(\\d{1,3})\\s*(?:${CONTABLES})\\b`, "g"),
  ];

  // `exec` en bucle y no `matchAll`: el target de TS del proyecto es anterior a
  // ES2015 y el iterador de matchAll no compila sin --downlevelIteration.
  for (const re of patrones) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const n = Number.parseInt(m[1], 10);
      if (Number.isFinite(n) && n >= 2 && n <= MAX_MULTIPLICADOR) candidatos.push(n);
      // Guarda anti-loop infinito si algun patron llegara a matchear vacio.
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }

  // "docena" y "media docena" no llevan digito, pero el numero es inequivoco.
  // El plural "medias docena" es un error de tipeo frecuente y sigue queriendo
  // decir 6: sin esta rama devolvia 12, que es el doble y del lado peligroso.
  if (/\bmedias?\s+docenas?\b/.test(t)) candidatos.push(6);
  else if (/\bdocenas?\b/.test(t)) candidatos.push(12);

  if (candidatos.length === 0) return 1;
  return Math.max(...candidatos);
}

/** Lo que la normalizacion deja escrito para el score, la UI y el informe. */
export interface UnidadDeVenta {
  /** Unidades que contiene lo que el usuario cotizo. 1 = suelto o no detectado. */
  multiplicador_consulta: number;
  /** Publicaciones cuyo titulo declaraba mas de una unidad. */
  listings_ajustados: number;
  /** Total de publicaciones con precio que se miraron. */
  listings_evaluados: number;
  /**
   * `true` si algo se movio. `false` significa que este modulo fue un no-op y
   * los numeros son bit a bit los de antes.
   */
  aplicada: boolean;
  /**
   * `true` si se OMITIO dividir publicaciones por pack porque la consulta fija
   * su unidad por contenido (peso/volumen). Opcional: los analisis anteriores
   * al 24/9 no lo traen. Ver `normalizarUnidadDeVenta`.
   */
  base_por_contenido?: boolean;
}

export interface NormalizacionUnidad {
  /** Costo por unidad individual. `undefined` si no habia costo. */
  costoUnitario: number | undefined;
  /** Los mismos listings, con `price` llevado a precio por unidad. */
  listings: MLListing[];
  unidad: UnidadDeVenta;
}

/**
 * Lleva costo y precios a una base comun de **una unidad**.
 *
 * Es deliberadamente puro y sin efectos: devuelve copias. Los callers
 * (`lib/inngest-functions.ts` y `lib/seguimiento.ts`) le pasan lo que ya tenian
 * y siguen su camino con los valores normalizados, de modo que el score no se
 * entera de que esto existe — recibe un costo y unos precios coherentes entre
 * si, que es todo lo que siempre necesito.
 */
export function normalizarUnidadDeVenta(args: {
  producto: string;
  costoLocal: number | undefined;
  listings: MLListing[];
}): NormalizacionUnidad {
  const { producto, listings } = args;

  const multiplicadorConsulta = detectarUnidades(producto);

  // LA PROPIEDAD DE SEGURIDAD NO SE CUMPLIA SOLA (fix del 24/9).
  //
  // La cabecera de este modulo dice que es seguro porque "se aplica a los dos
  // lados". Eso es cierto SOLO cuando la consulta declara un conteo. Cuando
  // `multiplicadorConsulta` es 1 el costo no se toca y las publicaciones si:
  // la division queda de un lado solo, y eso no normaliza nada — parte la
  // muestra en dos escalas de precio que despues se promedian juntas.
  //
  // Caso real 52e064c2 (24/9, usuario real): "Frambuesa liofilizada 20gr".
  // 6 de 30 publicaciones decian un conteo en el titulo y se dividieron por el
  // ("x 27 sobres" -> precio/27 = $139,81); las otras 24 quedaron enteras. El
  // mercado verdadero es angosto y coherente — las tres publicaciones
  // comparables valen $11.700, $11.900 y $12.959 — pero el scrape ya tenia
  // precios de $139 al lado de precios de $193.400. p90/p10 = 66,1 contra un
  // umbral de 8, asi que `lib/confianza.ts` levantaba `dispersion_precios`,
  // bajaba la confianza a "baja" y la pagina mostraba "Los datos de este
  // analisis no son confiables" sobre un scrape que estaba sano. Los outliers
  // que denunciaba el cartel los habiamos fabricado nosotros.
  //
  // POR QUE NO ES COMPARABLE, aunque suene a que deberia serlo. Dividir una
  // caja de 27 sobres por 27 da el precio POR SOBRE. El usuario no vende
  // sobres: vende 20 gramos. Un sobre pesa lo que quiera el fabricante. Las
  // dos cifras no comparten base, y ninguna cantidad de aritmetica arregla
  // eso — es una division entre cosas distintas.
  //
  // Por eso el desempate es si la consulta fija su unidad por CONTENIDO. Si
  // dice "20gr", el conteo de envases no es su unidad y no se toca nada. Si no
  // lo dice ("organizador de cables escritorio"), la unidad natural es el
  // articulo y el comportamiento es el de siempre: el pack x4 se divide por 4.
  //
  // Y si la consulta SI declara conteo (`multiplicadorConsulta > 1`), esto no
  // se activa: ahi la division si va a los dos lados y es el caso del 21/9
  // ("pack de 3 rollos de cable de 100 m"), que se sigue corrigiendo igual
  // aunque el titulo tenga un "100 m" adentro.
  const basePorContenido = multiplicadorConsulta === 1 && declaraContenido(producto);

  let ajustados = 0;
  let evaluados = 0;

  const normalizados = listings.map(l => {
    if (l.price === null || !(l.price > 0)) return l;
    evaluados++;
    if (basePorContenido) return l;
    const n = detectarUnidades(l.title);
    if (n <= 1) return l;
    ajustados++;
    return { ...l, price: l.price / n };
  });

  const aplicada = multiplicadorConsulta > 1 || ajustados > 0;

  return {
    costoUnitario:
      args.costoLocal !== undefined && multiplicadorConsulta > 1
        ? args.costoLocal / multiplicadorConsulta
        : args.costoLocal,
    // Cuando no se movio nada devolvemos el array original, no la copia: hace
    // explicito en el codigo que el camino sin packs es un no-op.
    listings: aplicada ? normalizados : listings,
    unidad: {
      multiplicador_consulta: multiplicadorConsulta,
      listings_ajustados: ajustados,
      listings_evaluados: evaluados,
      aplicada,
      base_por_contenido: basePorContenido,
    },
  };
}
