/**
 * El score, calculado en codigo. TAB 3 del plan de tabs (20/9/2026).
 *
 * POR QUE EXISTE ESTE ARCHIVO
 *
 * El experimento controlado del 13/9 corrio el mismo scrape de 100
 * publicaciones contra el `buildPrompt` de produccion varias veces seguidas.
 * "auriculares bluetooth", mismas 100 publicaciones, mismo minuto: 40, 55, 30,
 * 50. Con 30 publicaciones: 20, 40, 40, 65. **45 puntos de diferencia con el
 * input identico**, y el veredicto cambiando entre SATURADO y MARGINAL.
 *
 * La causa no es la temperatura. Es que el prompt le pedia al modelo *derivar*
 * un numero de reglas escritas en prosa ("si hay 11-20 vendedores restale 10
 * puntos") en vez de calcularlo. Eso es aritmetica, y la aritmetica no se le
 * pide a un modelo de lenguaje. Hasta el 16/9 el cache lo tapaba; el fix de la
 * clave de cache (`f3d0be9`) bajo el hit rate y dejo el problema a la vista.
 *
 * Aca el score no toca el LLM en ningun punto. Mismo scrape + mismo costo +
 * mismo perfil => exactamente el mismo numero, siempre. A Gemini le queda la
 * prosa: resumen, recomendacion, riesgos, tendencia. Nunca el numero.
 *
 * TRES DECISIONES DE DISENO, a proposito:
 *
 * 1. NINGUNA METRICA ES UN CONTEO ABSOLUTO. Las viejas "REGLAS DE SCORE"
 *    penalizaban por cantidad de vendedores (11-20: -10, +30: maximo 50). Pero
 *    desde el 16/9 los tres tiers scrapean 30 publicaciones, asi que ese numero
 *    esta topeado en 30 por construccion: no puede tener señal. Peor: en los 36
 *    analisis historicos Gemini nunca conto vendedores, devolvia la cantidad de
 *    publicaciones (30/30, 52/52, 60/60). Era ruido con nombre de metrica. Todo
 *    lo que se mide aca es *estructura dentro de la muestra* — proporciones y
 *    ratios — que es invariante al tamaño de la muestra.
 *
 * 2. UN BLOQUE SIN DATOS NO SUMA CERO: SALE DEL DENOMINADOR. Apify casi nunca
 *    devuelve `soldQuantity` (en los dos analisis con estadisticas guardadas es
 *    0 de 30). Si "demanda probada" valiera 0 por falta de dato, el sistema
 *    deflacionaria a todos por algo que no es culpa del producto. Se
 *    renormaliza sobre los bloques con datos y se reporta cuales se usaron. La
 *    falta de dato ya se castiga en el lugar correcto: `confianza.ts` degrada a
 *    "media" por `sin_datos_de_venta`, y eso capea el score a 75.
 *
 * 3. EL PERFIL NO RESTA PUNTOS INVENTADOS. Antes habia una escala ad-hoc
 *    (-10/-20/maximo 50 para principiante). Ahora entra por dos lugares que ya
 *    existian y son reales: el percentil al que puede entrar (p10/p25/p65), que
 *    define el margen; y cuanto le pesa la competencia. Un experto y un
 *    principiante miran el mismo mercado y sacan numeros distintos sin que haya
 *    una sola regla arbitraria en el medio.
 *
 * Se apoya en `lib/confianza.ts` (percentiles, recorte, dispersion, cap por
 * nivel) y en `lib/comisiones.ts`. No duplica nada de los dos.
 */

import type { MLListing } from "./apify";
import { ETIQUETA_MOTIVO, type Confianza, type PrecioStats } from "./confianza";
import { calcularComision, type ComisionCalculada, type PaisML } from "./comisiones";

export type IdComponente =
  | "margen"
  | "fragmentacion"
  | "atrincheramiento"
  | "demanda"
  | "techo_diferenciacion";

export interface ComponenteScore {
  id: IdComponente;
  nombre: string;
  puntos: number;
  maximo: number;
  /** El numero crudo del que salen los puntos. Es lo que la UI muestra. */
  metrica: string;
  /** Una linea de por que ese numero significa lo que significa. */
  lectura: string;
}

export interface ComponenteOmitido {
  id: IdComponente;
  nombre: string;
  motivo: string;
}

export interface MetricasScrape {
  n_listings: number;
  n_con_precio: number;
  /** Publicaciones que traen nombre de vendedor. Medido el 20/9: 62% del total. */
  n_con_vendedor: number;
  vendedores_unicos: number;
  /** vendedores_unicos / n_con_vendedor. Nunca sobre n_listings: ver nota abajo. */
  ratio_vendedores: number | null;
  reviews_mediana_baratos: number | null;
  listings_con_ventas: number;
  pct_con_ventas: number | null;
  mediana_unidades_vendidas: number | null;
  pct_envio_gratis: number;
  spread_p90_p50: number | null;
}

export interface ScoreCalculado {
  score: number;
  veredicto: "VIABLE" | "SATURADO" | "MARGINAL";
  componentes: ComponenteScore[];
  omitidos: ComponenteOmitido[];
  puntos_obtenidos: number;
  puntos_posibles: number;
  /** Antes de pisos y techos. Sirve para auditar por que un score quedo donde quedo. */
  score_bruto: number;
  techo_aplicado: number | null;
  motivo_techo: string | null;
  precio_sugerido: number;
  margen_neto_pct: number;
  comision: ComisionCalculada;
  metricas: MetricasScrape;
  /** Version de la formula. Sube cuando cambian pesos o cortes: sin esto, el
   *  seguimiento del TAB 5 compararia scores de formulas distintas. */
  formula: string;
}

export const FORMULA_VERSION = "score-v1-2026-09-20";

/** Percentil de entrada segun perfil. Ya era la regla del prompt, sin cambios. */
const PERCENTIL_POR_PERFIL: Record<string, keyof Pick<PrecioStats, "p10" | "p25" | "p65">> = {
  principiante: "p10",
  intermedio: "p25",
  experto: "p65",
};

/**
 * Cuanto de los puntos de competencia se lleva cada perfil. La linea base es
 * el intermedio (1,0). El principiante se lleva menos: el mismo mercado es
 * objetivamente mas duro para el que no tiene reputacion ni volumen.
 *
 * Calibrado el 20/9 contra casos sinteticos. La primera version era
 * 1,0/1,15/1,3 — premiaba al experto en vez de castigar al principiante, y
 * movia el score final 3 puntos entre perfiles sobre el mismo mercado. Una
 * perilla que no mueve nada es peor que no tenerla: no se puede explicar.
 */
const PESO_COMPETENCIA: Record<string, number> = {
  principiante: 0.75,
  intermedio: 1.0,
  experto: 1.2,
};

const MAX_MARGEN = 40;
const MAX_FRAGMENTACION = 15;
const MAX_ATRINCHERAMIENTO = 10;
const MAX_DEMANDA = 20;
const MAX_TECHO = 15;

/**
 * Interpolacion lineal por tramos sobre puntos (x, y) ordenados por x.
 * Fuera de rango devuelve el extremo — nunca extrapola.
 */
function rampa(x: number, puntos: Array<[number, number]>): number {
  if (puntos.length === 0) return 0;
  if (x <= puntos[0][0]) return puntos[0][1];
  const ultimo = puntos[puntos.length - 1];
  if (x >= ultimo[0]) return ultimo[1];
  for (let i = 0; i < puntos.length - 1; i++) {
    const [x0, y0] = puntos[i];
    const [x1, y1] = puntos[i + 1];
    if (x >= x0 && x <= x1) {
      if (x1 === x0) return y1;
      return y0 + ((x - x0) * (y1 - y0)) / (x1 - x0);
    }
  }
  return ultimo[1];
}

/**
 * Separador de miles segun el pais. Estos strings terminan guardados dentro de
 * `score_detalle` en resultado_json y se muestran tal cual en la pagina, asi
 * que se formatean aca y no en la UI: cada analisis queda con el numero escrito
 * como corresponde a su pais, para siempre.
 */
function formatearNumero(n: number, pais: PaisML): string {
  const locale = pais === "MX" ? "es-MX" : pais === "CO" ? "es-CO" : "es-AR";
  return Math.round(n).toLocaleString(locale);
}

function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 === 1 ? o[m] : Math.round((o[m - 1] + o[m]) / 2);
}

/**
 * Orden canonico de los listings. El dataset de Apify no garantiza un orden
 * estable entre lecturas, y "las 5 mas baratas" tiene que ser el mismo conjunto
 * en las dos corridas o el score se mueve por una razon que no es el mercado.
 * Desempata por url, que es unica.
 */
function ordenCanonico(listings: MLListing[]): MLListing[] {
  return [...listings].sort((a, b) => {
    const pa = a.price ?? Number.POSITIVE_INFINITY;
    const pb = b.price ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return (a.url ?? "").localeCompare(b.url ?? "");
  });
}

export function calcularMetricas(listings: MLListing[], stats: PrecioStats): MetricasScrape {
  const ordenados = ordenCanonico(listings);
  const conPrecio = ordenados.filter((l) => typeof l.price === "number" && (l.price ?? 0) > 0);

  const conVendedor = ordenados.filter((l) => (l.seller ?? "").trim().length > 0);
  const vendedores = new Set(conVendedor.map((l) => (l.seller as string).trim().toLowerCase()));

  // Las 5 mas baratas CON precio: contra esas compite el que entra por abajo.
  const baratas = conPrecio.slice(0, 5);
  // OJO: `> 0`, no `>= 0`. lib/apify.ts mapea con toNum(), y toNum(null)
  // devuelve 0 porque Number(null) === 0 — un nulo se convierte en un cero
  // indistinguible de un cero real. Medido el 20/9 sobre 300 publicaciones:
  // reviewCount, ratingAverage, soldQuantity y freeShipping vienen null en el
  // 100% de los casos (el endpoint de busqueda del actor no los trae; harian
  // falta las paginas de detalle). Tomar esos ceros como dato le regalaba
  // 10/10 puntos de "atrincheramiento" a todo el mundo.
  const reviewsBaratas = baratas
    .map((l) => l.reviewsCount)
    .filter((r): r is number => typeof r === "number" && r > 0);

  const conVentas = ordenados.filter((l) => (l.soldQuantity ?? 0) > 0);
  const unidades = conVentas.map((l) => l.soldQuantity as number);

  const envioGratis = ordenados.filter((l) => l.isFreeShipping === true).length;

  return {
    n_listings: ordenados.length,
    n_con_precio: conPrecio.length,
    n_con_vendedor: conVendedor.length,
    vendedores_unicos: vendedores.size,
    // El denominador son las publicaciones que TRAEN vendedor, no todas.
    // Medido el 20/9 sobre el golden set: con el denominador equivocado el
    // ratio se aplastaba en 0,23-0,40 (rango 0,17) y el bloque daba 15/15 en
    // los 10 productos — una constante disfrazada de metrica. Sobre las que si
    // traen vendedor va de 0,35 a 0,88 (rango 0,53) y discrimina de verdad.
    ratio_vendedores:
      conVendedor.length > 0 ? vendedores.size / conVendedor.length : null,
    reviews_mediana_baratos: mediana(reviewsBaratas),
    listings_con_ventas: conVentas.length,
    pct_con_ventas: conPrecio.length > 0 ? conVentas.length / conPrecio.length : null,
    mediana_unidades_vendidas: mediana(unidades),
    pct_envio_gratis: ordenados.length > 0 ? envioGratis / ordenados.length : 0,
    spread_p90_p50: stats.p50 > 0 ? stats.p90 / stats.p50 : null,
  };
}

export function calcularScore(args: {
  producto: string;
  pais: PaisML;
  perfil: string;
  /** Costo por unidad en la MISMA moneda que los precios del scrape. */
  costoLocal: number;
  listings: MLListing[];
  stats: PrecioStats;
  confianza: Confianza | null;
}): ScoreCalculado {
  const { producto, pais, costoLocal, stats, listings, confianza } = args;
  const perfil = PERCENTIL_POR_PERFIL[args.perfil] ? args.perfil : "principiante";
  const metricas = calcularMetricas(listings, stats);

  const precioSugerido = stats[PERCENTIL_POR_PERFIL[perfil]] ?? stats.p10;
  const comision = calcularComision({ pais, perfil, producto, precio: precioSugerido });
  const margenNeto =
    precioSugerido > 0 ? (precioSugerido - comision.monto_total - costoLocal) / precioSugerido : -1;
  const margenPct = Math.round(margenNeto * 1000) / 10;

  const componentes: ComponenteScore[] = [];
  const omitidos: ComponenteOmitido[] = [];

  // ---- A. Margen neto (40) --------------------------------------------------
  // Lo que de verdad decide una compra. 25% es el umbral que la UI ya usa para
  // VIABLE, y cae en 27/40: alcanza para pasar pero no regala el veredicto.
  if (precioSugerido > 0) {
    const puntos = rampa(margenPct, [
      [0, 0],
      [10, 10],
      [20, 22],
      [30, 32],
      [40, MAX_MARGEN],
    ]);
    componentes.push({
      id: "margen",
      nombre: "Margen neto",
      puntos,
      maximo: MAX_MARGEN,
      metrica: `${margenPct}% sobre un precio de entrada de ${formatearNumero(
        precioSugerido,
        pais
      )}`,
      lectura:
        margenPct <= 0
          ? "A ese precio se vende a perdida una vez descontada la comision."
          : `Despues de la comision de Mercado Libre (${comision.porcentaje}% + ${comision.cargo_fijo} fijo) y del costo.`,
    });
  } else {
    omitidos.push({
      id: "margen",
      nombre: "Margen neto",
      motivo: "no se pudo establecer un precio de entrada",
    });
  }

  // ---- B1. Fragmentacion (15) ----------------------------------------------
  // Si 27 de 30 publicaciones son de vendedores distintos, es una categoria
  // generica que revende cualquiera: el precio es lo unico que te diferencia.
  // Pocos vendedores con muchas publicaciones es un mercado mas dificil de
  // romper, pero con margenes que alguien esta defendiendo.
  const r = metricas.ratio_vendedores;
  if (r != null && metricas.n_con_vendedor >= 8) {
    const puntos = rampa(r, [
      [0.4, MAX_FRAGMENTACION],
      [0.9, 3],
    ]);
    componentes.push({
      id: "fragmentacion",
      nombre: "Fragmentación",
      puntos,
      maximo: MAX_FRAGMENTACION,
      metrica: `${metricas.vendedores_unicos} vendedores distintos en ${metricas.n_con_vendedor} publicaciones identificables`,
      lectura:
        r >= 0.8
          ? "Casi cada publicación es de un vendedor distinto: categoría genérica, se compite por precio."
          : r <= 0.5
            ? "Pocos vendedores concentran las publicaciones: hay posiciones defendidas y margen que proteger."
            : "Mezcla de vendedores establecidos y ocasionales.",
    });
  } else {
    omitidos.push({
      id: "fragmentacion",
      nombre: "Fragmentación",
      motivo:
        metricas.n_con_vendedor < 8
          ? `solo ${metricas.n_con_vendedor} publicaciones identifican al vendedor, no alcanza para medir la estructura del mercado`
          : "el scrape no trajo el nombre del vendedor",
    });
  }

  // ---- B2. Atrincheramiento (10) -------------------------------------------
  // No competis contra "el mercado", competis contra los que ocupan el precio
  // al que vos podes entrar. Si los mas baratos no tienen reputacion
  // construida, hay lugar. Escala logaritmica: la diferencia entre 10 y 50
  // reviews importa mucho mas que entre 400 y 440.
  const rev = metricas.reviews_mediana_baratos;
  if (rev != null) {
    const puntos = rampa(Math.log10(Math.max(1, rev)), [
      [Math.log10(20), MAX_ATRINCHERAMIENTO],
      [Math.log10(500), 0],
    ]);
    componentes.push({
      id: "atrincheramiento",
      nombre: "Atrincheramiento de los más baratos",
      puntos,
      maximo: MAX_ATRINCHERAMIENTO,
      metrica: `${rev} reseñas (mediana de las 5 publicaciones más baratas)`,
      lectura:
        rev >= 300
          ? "Los que están al precio de entrada ya tienen reputación construida: entrar por precio no alcanza."
          : "Los que están al precio de entrada todavía no tienen reputación sólida.",
    });
  } else {
    omitidos.push({
      id: "atrincheramiento",
      nombre: "Atrincheramiento de los más baratos",
      motivo: "ninguna de las publicaciones más baratas expone cantidad de reseñas",
    });
  }

  // ---- C. Demanda probada (20) ---------------------------------------------
  // Solo con evidencia real. Mercado Libre expone soldQuantity de forma
  // irregular; inferir demanda cuando no hay dato es exactamente lo que hacia
  // el modelo y lo que estamos sacando.
  const pct = metricas.pct_con_ventas;
  if (metricas.listings_con_ventas >= 3 && pct != null) {
    const porDensidad = 12 * Math.min(1, pct / 0.6);
    const porVolumen = 8 * Math.min(1, (metricas.mediana_unidades_vendidas ?? 0) / 50);
    componentes.push({
      id: "demanda",
      nombre: "Demanda probada",
      puntos: porDensidad + porVolumen,
      maximo: MAX_DEMANDA,
      metrica: `${metricas.listings_con_ventas} de ${metricas.n_con_precio} publicaciones con ventas registradas, mediana ${metricas.mediana_unidades_vendidas ?? 0} unidades`,
      lectura: "Ventas efectivamente registradas en las publicaciones, no una estimación.",
    });
  } else {
    omitidos.push({
      id: "demanda",
      nombre: "Demanda probada",
      motivo:
        "menos de 3 publicaciones exponen unidades vendidas — Mercado Libre no siempre publica el dato",
    });
  }

  // ---- D. Techo de diferenciacion (15) -------------------------------------
  // Cuanto aire hay por encima de la mediana. Si existe un segmento premium
  // real se puede subir por producto en vez de bajar por precio. Un mercado
  // plano obliga a competir solo por precio, que es la peor pelea para el que
  // entra. El envio gratis universal es costo logistico que ya esta adentro de
  // todos los precios: sube el piso para cualquiera que entre.
  const spread = metricas.spread_p90_p50;
  if (spread != null) {
    const base = rampa(spread, [
      [1.2, 3],
      [2.2, MAX_TECHO],
    ]);
    // DORMANTE hoy: freeShipping viene null (=> false) en el 100% de las 300
    // publicaciones medidas el 20/9, asi que este castigo no se dispara nunca.
    // Se deja porque es correcto y se enciende solo el dia que el scrape traiga
    // el dato. No se computa si NINGUNA publicacion lo declara: no se puede
    // distinguir "nadie ofrece envio gratis" de "el dato no vino".
    const castigoEnvio =
      metricas.pct_envio_gratis > 0 && metricas.pct_envio_gratis >= 0.85 ? 4 : 0;
    componentes.push({
      id: "techo_diferenciacion",
      nombre: "Techo de diferenciación",
      puntos: Math.max(0, base - castigoEnvio),
      maximo: MAX_TECHO,
      metrica: `el percentil 90 vale ${spread.toFixed(1)}× la mediana${castigoEnvio ? `, y el ${Math.round(metricas.pct_envio_gratis * 100)}% ofrece envío gratis` : ""}`,
      lectura:
        spread >= 2
          ? "Hay un segmento que paga bastante más que la mediana: se puede diferenciar hacia arriba."
          : "Mercado plano: todos al mismo precio, la única palanca es bajar.",
    });
  } else {
    omitidos.push({
      id: "techo_diferenciacion",
      nombre: "Techo de diferenciación",
      motivo: "no hay percentiles de precio utilizables",
    });
  }

  // ---- Peso del perfil sobre la competencia --------------------------------
  const peso = PESO_COMPETENCIA[perfil] ?? 1;
  if (peso !== 1) {
    for (const c of componentes) {
      if (c.id === "fragmentacion" || c.id === "atrincheramiento") {
        c.puntos = Math.min(c.maximo, c.puntos * peso);
      }
    }
  }

  // ---- Renormalizacion -----------------------------------------------------
  const obtenidos = componentes.reduce((a, c) => a + c.puntos, 0);
  const posibles = componentes.reduce((a, c) => a + c.maximo, 0);
  const scoreBruto = posibles > 0 ? (100 * obtenidos) / posibles : 0;

  // ---- Pisos y techos ------------------------------------------------------
  let score = scoreBruto;
  let techo: number | null = null;
  let motivoTecho: string | null = null;

  // Piso duro: no hay estructura de mercado que compense vender a perdida.
  // En los 36 historicos hay 13 analisis con margen <= 0, y uno de ellos
  // ("mini lavadora portatil", margen -51,3%) recibio score 65 = MARGINAL.
  if (margenPct <= 0) {
    techo = 20;
    motivoTecho = "el margen neto es negativo o cero al precio de entrada";
    score = Math.min(score, 20);
  }

  // Techo por confianza — el que ya existia en normalizeAnalysis, aplicado
  // ahora sobre un score que se puede defender numero por numero.
  const techoConfianza =
    confianza?.nivel === "baja" ? 60 : confianza?.nivel === "media" ? 75 : null;
  if (techoConfianza != null && score > techoConfianza) {
    techo = techoConfianza;
    motivoTecho = `la confianza de los datos es ${confianza?.nivel}: ${
      confianza?.motivos.map((m) => ETIQUETA_MOTIVO[m] ?? m).join("; ") ?? ""
    }`;
    score = techoConfianza;
  }

  const scoreFinal = Math.max(0, Math.min(100, Math.round(score)));
  const veredicto = scoreFinal >= 75 ? "VIABLE" : scoreFinal >= 50 ? "MARGINAL" : "SATURADO";

  return {
    score: scoreFinal,
    veredicto,
    componentes: componentes.map((c) => ({ ...c, puntos: Math.round(c.puntos * 10) / 10 })),
    omitidos,
    puntos_obtenidos: Math.round(obtenidos * 10) / 10,
    puntos_posibles: posibles,
    score_bruto: Math.round(scoreBruto),
    techo_aplicado: techo,
    motivo_techo: motivoTecho,
    precio_sugerido: precioSugerido,
    margen_neto_pct: margenPct,
    comision,
    metricas,
    formula: FORMULA_VERSION,
  };
}

/** Una linea por componente, para meter en el prompt y para la UI del TAB 4. */
export function explicarScore(s: ScoreCalculado): string {
  const lineas = s.componentes.map(
    (c) => `- ${c.nombre}: ${c.puntos}/${c.maximo} — ${c.metrica}`
  );
  if (s.omitidos.length > 0) {
    lineas.push(
      `- No computados por falta de datos: ${s.omitidos.map((o) => o.nombre.toLowerCase()).join(", ")}`
    );
  }
  if (s.techo_aplicado != null) {
    lineas.push(`- Techo aplicado: ${s.techo_aplicado} porque ${s.motivo_techo}`);
  }
  return lineas.join("\n");
}
