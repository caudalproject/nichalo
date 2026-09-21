/**
 * TAB 5 — el delta entre dos mediciones de un nicho.
 *
 * Funcion pura: entran dos corridas, sale la comparacion. Sin I/O, sin Gemini,
 * sin fecha del sistema. Eso la hace testeable y es el motivo por el que el
 * delta NO se guarda en una tabla: si manana cambia la definicion de "cambio
 * material", se recalcula sola sobre la historia que ya existe.
 *
 * Todo sale de cantidades MEDIDAS (precios, nombres de vendedor, conteos), no
 * del score del LLM. Por eso el seguimiento esquiva por construccion el
 * problema de determinismo que hizo falta resolver en el TAB 3.
 */

import type { PrecioStats } from "./confianza";
import type { MetricasScrape } from "./score";

export interface CorridaComparable {
  fetched_at: string;
  n_listings: number | null;
  precio_stats: PrecioStats | null;
  metricas: MetricasScrape | null;
  vendedores: string[] | null;
  score: number | null;
  formula: string | null;
}

export type Direccion = "sube" | "baja" | "igual";
export type Formato = "moneda" | "porcentaje" | "entero" | "ratio";

export interface CambioNumerico {
  id: string;
  etiqueta: string;
  antes: number | null;
  ahora: number | null;
  delta: number | null;
  /** Variacion relativa. null cuando `antes` es 0 o falta: dividir por cero no
   *  es "subio infinito", es "no se puede expresar en porcentaje". */
  delta_pct: number | null;
  direccion: Direccion;
  /** Supera el umbral de materialidad. Lo que no es material no va al mail. */
  material: boolean;
  /** El dato no existe en alguna de las dos corridas. Se muestra como "sin
   *  dato", nunca como un delta de 0 — que seria afirmar que no cambio. */
  sin_dato: boolean;
  formato: Formato;
  /** Si sube es bueno para el que vende, o malo. Define el color, no el signo. */
  bueno_si: "sube" | "baja" | "neutro";
}

export interface DeltaVendedores {
  nuevos: string[];
  salieron: string[];
  se_mantienen: number;
  antes: number;
  ahora: number;
  material: boolean;
}

export interface Delta {
  comparable: boolean;
  motivo_no_comparable: string | null;
  desde: string;
  hasta: string;
  dias: number;
  cambios: CambioNumerico[];
  vendedores: DeltaVendedores | null;
  score: {
    antes: number | null;
    ahora: number | null;
    delta: number | null;
    comparable: boolean;
    motivo: string | null;
  };
  hay_cambios_materiales: boolean;
  /** Titular armado deterministicamente a partir del cambio mas fuerte.
   *  El brief contemplaba pagarle a Gemini ~USD 0,005 por esta frase; con los
   *  campos ya medidos se arma sola y sale gratis. */
  titular: string;
}

/** Umbrales de materialidad. Debajo de esto es ruido del scrape, no mercado. */
export const UMBRAL = {
  precio_pct: 0.05,
  listings: 3,
  vendedores: 2,
  puntos_pct: 0.1,
  score: 5,
  ratio: 0.1,
} as const;

function dif(antes: number | null | undefined, ahora: number | null | undefined) {
  const a = typeof antes === "number" && Number.isFinite(antes) ? antes : null;
  const b = typeof ahora === "number" && Number.isFinite(ahora) ? ahora : null;
  if (a === null || b === null) {
    return { antes: a, ahora: b, delta: null, delta_pct: null, sin_dato: true };
  }
  const delta = b - a;
  return {
    antes: a,
    ahora: b,
    delta,
    delta_pct: a !== 0 ? delta / Math.abs(a) : null,
    sin_dato: false,
  };
}

function direccion(delta: number | null): Direccion {
  if (delta === null || delta === 0) return "igual";
  return delta > 0 ? "sube" : "baja";
}

function campo(args: {
  id: string;
  etiqueta: string;
  antes: number | null | undefined;
  ahora: number | null | undefined;
  formato: Formato;
  bueno_si: "sube" | "baja" | "neutro";
  esMaterial: (d: { delta: number | null; delta_pct: number | null }) => boolean;
}): CambioNumerico {
  const d = dif(args.antes, args.ahora);
  return {
    id: args.id,
    etiqueta: args.etiqueta,
    ...d,
    direccion: direccion(d.delta),
    material: d.sin_dato ? false : args.esMaterial(d),
    formato: args.formato,
    bueno_si: args.bueno_si,
  };
}

const porPct = (u: number) => (d: { delta_pct: number | null }) =>
  d.delta_pct !== null && Math.abs(d.delta_pct) >= u;
const porAbs = (u: number) => (d: { delta: number | null }) =>
  d.delta !== null && Math.abs(d.delta) >= u;

function normalizar(vs: string[] | null | undefined): string[] {
  return (vs ?? [])
    .map((v) => v.trim().toLowerCase())
    .filter((v) => v.length > 0);
}

export function calcularDelta(
  anterior: CorridaComparable,
  actual: CorridaComparable
): Delta {
  const desde = anterior.fetched_at;
  const hasta = actual.fetched_at;
  const dias = Math.max(
    0,
    Math.round(
      (new Date(hasta).getTime() - new Date(desde).getTime()) / 86_400_000
    )
  );

  const pa = anterior.precio_stats;
  const pb = actual.precio_stats;
  const ma = anterior.metricas;
  const mb = actual.metricas;

  const cambios: CambioNumerico[] = [
    campo({
      id: "precio_mediano",
      etiqueta: "Precio mediano del nicho",
      antes: pa?.precio_mediano,
      ahora: pb?.precio_mediano,
      formato: "moneda",
      bueno_si: "sube",
      esMaterial: porPct(UMBRAL.precio_pct),
    }),
    campo({
      id: "p10",
      etiqueta: "Precio de entrada (p10)",
      antes: pa?.p10,
      ahora: pb?.p10,
      formato: "moneda",
      bueno_si: "sube",
      esMaterial: porPct(UMBRAL.precio_pct),
    }),
    campo({
      id: "p90",
      etiqueta: "Techo del nicho (p90)",
      antes: pa?.p90,
      ahora: pb?.p90,
      formato: "moneda",
      bueno_si: "sube",
      esMaterial: porPct(UMBRAL.precio_pct),
    }),
    campo({
      id: "n_listings",
      etiqueta: "Publicaciones compitiendo",
      antes: anterior.n_listings ?? ma?.n_listings,
      ahora: actual.n_listings ?? mb?.n_listings,
      formato: "entero",
      bueno_si: "baja",
      esMaterial: porAbs(UMBRAL.listings),
    }),
    campo({
      id: "vendedores_unicos",
      etiqueta: "Vendedores distintos",
      antes: ma?.vendedores_unicos,
      ahora: mb?.vendedores_unicos,
      formato: "entero",
      bueno_si: "baja",
      esMaterial: porAbs(UMBRAL.vendedores),
    }),
    campo({
      id: "ratio_vendedores",
      etiqueta: "Fragmentación (vendedores por publicación)",
      antes: ma?.ratio_vendedores,
      ahora: mb?.ratio_vendedores,
      formato: "ratio",
      bueno_si: "sube",
      esMaterial: porAbs(UMBRAL.ratio),
    }),
    campo({
      id: "spread_p90_p50",
      etiqueta: "Techo de diferenciación (p90 / mediana)",
      antes: ma?.spread_p90_p50,
      ahora: mb?.spread_p90_p50,
      formato: "ratio",
      bueno_si: "sube",
      esMaterial: porAbs(UMBRAL.ratio),
    }),
    // Las tres de abajo dependen de campos que Mercado Libre no siempre expone.
    // Hasta el fix del 21/9 llegaban como ceros y el delta decia "sin cambios"
    // sobre datos que no existian. Ahora, si faltan, se marcan `sin_dato`.
    campo({
      id: "listings_con_ventas",
      etiqueta: "Publicaciones con ventas declaradas",
      antes: ma?.listings_con_ventas,
      ahora: mb?.listings_con_ventas,
      formato: "entero",
      bueno_si: "neutro",
      esMaterial: porAbs(UMBRAL.listings),
    }),
    campo({
      id: "mediana_unidades_vendidas",
      etiqueta: "Unidades vendidas (mediana)",
      antes: ma?.mediana_unidades_vendidas,
      ahora: mb?.mediana_unidades_vendidas,
      formato: "entero",
      bueno_si: "sube",
      esMaterial: porPct(UMBRAL.precio_pct),
    }),
    campo({
      id: "pct_envio_gratis",
      etiqueta: "Ofrecen envío gratis",
      antes: ma?.pct_envio_gratis,
      ahora: mb?.pct_envio_gratis,
      formato: "porcentaje",
      bueno_si: "baja",
      esMaterial: porAbs(UMBRAL.puntos_pct),
    }),
  ];

  // --- Vendedores: quienes, no cuantos ------------------------------------
  const va = normalizar(anterior.vendedores);
  const vb = normalizar(actual.vendedores);
  let vendedores: DeltaVendedores | null = null;
  if (va.length > 0 || vb.length > 0) {
    const setA = new Set(va);
    const setB = new Set(vb);
    const unicosB = Array.from(setB);
    const unicosA = Array.from(setA);
    const nuevos = unicosB.filter((v) => !setA.has(v));
    const salieron = unicosA.filter((v) => !setB.has(v));
    vendedores = {
      nuevos,
      salieron,
      se_mantienen: unicosB.filter((v) => setA.has(v)).length,
      antes: setA.size,
      ahora: setB.size,
      material: nuevos.length + salieron.length >= UMBRAL.vendedores,
    };
  }

  // --- Score: solo si las dos corridas usan la MISMA formula ---------------
  const mismaFormula =
    !!anterior.formula && !!actual.formula && anterior.formula === actual.formula;
  const scoreDif = dif(anterior.score, actual.score);
  const score = {
    antes: scoreDif.antes,
    ahora: scoreDif.ahora,
    delta: mismaFormula ? scoreDif.delta : null,
    comparable: mismaFormula && !scoreDif.sin_dato,
    motivo: !anterior.formula || !actual.formula
      ? "Falta la versión de fórmula en alguna de las dos mediciones."
      : !mismaFormula
        ? "La fórmula del score cambió entre las dos mediciones: el número no es comparable."
        : null,
  };

  const hayMateriales =
    cambios.some((c) => c.material) || (vendedores?.material ?? false);

  return {
    comparable: true,
    motivo_no_comparable: null,
    desde,
    hasta,
    dias,
    cambios,
    vendedores,
    score,
    hay_cambios_materiales: hayMateriales,
    titular: armarTitular(cambios, vendedores, dias),
  };
}

/**
 * El cambio mas fuerte, en castellano. Se elige por magnitud relativa dentro de
 * los materiales, con prioridad a competencia y precio: son los dos que mueven
 * una decision de vender o no.
 */
function armarTitular(
  cambios: CambioNumerico[],
  vendedores: DeltaVendedores | null,
  dias: number
): string {
  const ventana = dias <= 1 ? "desde la última medición" : `en ${dias} días`;

  if (vendedores?.material && vendedores.nuevos.length > vendedores.salieron.length) {
    const n = vendedores.nuevos.length;
    return `Entraron ${n} vendedor${n === 1 ? "" : "es"} nuevo${n === 1 ? "" : "s"} al nicho ${ventana}.`;
  }
  if (vendedores?.material && vendedores.salieron.length > vendedores.nuevos.length) {
    const n = vendedores.salieron.length;
    return `Salieron ${n} vendedor${n === 1 ? "" : "es"} del nicho ${ventana}.`;
  }

  const precio = cambios.find((c) => c.id === "precio_mediano" && c.material);
  if (precio && precio.delta_pct !== null) {
    const pct = Math.abs(Math.round(precio.delta_pct * 100));
    return `El precio mediano ${precio.direccion === "baja" ? "bajó" : "subió"} ${pct}% ${ventana}.`;
  }

  const otro = cambios.find((c) => c.material);
  if (otro && otro.delta !== null) {
    return `${otro.etiqueta}: ${otro.direccion === "baja" ? "bajó" : "subió"} ${ventana}.`;
  }

  return `Sin cambios relevantes ${ventana}.`;
}
