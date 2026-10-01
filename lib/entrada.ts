/**
 * Validacion de lo que el usuario tipea ANTES de gastar un analisis (TAB 3.3,
 * 1/10/2026). No toca la formula ni el score: arregla lo que entra.
 *
 * Dos entradas producian resultados falsos con trafico real (video del 24/9):
 *
 * 1. Costo en otra unidad (85, 31 y 15: dolares o miles abreviados).
 * 2. Link de Mercado Libre pegado como nombre del producto: la URL llegaba
 *    literal a la busqueda ("https www mercadolibre com cartera").
 */

// ---------------------------------------------------------------------------
// COSTO IMPLAUSIBLEMENTE BAJO
// ---------------------------------------------------------------------------

/**
 * Por debajo de este costo (en pesos, por unidad) se pide confirmacion antes de
 * correr el analisis. UMBRAL: $1.000 ARS.
 *
 * Calibrado el 1/10/2026 con `public.analyses` (64 filas, todas AR):
 *
 *   - Costos de los analisis desde el 24/9 (trafico externo real): el minimo
 *     legitimo es $3.500 (aspiradora mini) y despues $5.000 (frambuesa
 *     liofilizada 20 g). Mediana de toda la tabla: no sirve, esta contaminada.
 *   - Los costos < $1.000 desde el 24/9 son EXACTAMENTE los tres casos malos:
 *     85 (JBL Tune 520BT, el que al re-correr con 85.000 dio 11 SATURADO),
 *     31 (remera) y 15 (calleras CrossFit). Ningun costo legitimo cae ahi.
 *   - 37 de las 64 filas son < $1.000, pero 35 son anteriores al 24/9 y son
 *     pruebas de desarrollo de la epoca del USD puente (13/9: 2,10 · 5,00 ·
 *     6,85 · 8,32 ...). No representan a un usuario y no se usan para
 *     calibrar; se citan para que nadie las lea como "el 58% de la gente
 *     carga costos chicos".
 *
 * $1.000 deja un factor 3,5 de aire contra el piso legitimo observado
 * ($3.500) y ~11x contra el caso malo mas alto (85). Es CONSERVADOR a
 * proposito: un falso positivo cuesta un click ("es correcto"); un falso
 * negativo cuesta un credito y un veredicto inventado.
 *
 * PENDIENTE DE RECALIBRAR: n externo chico (~25 analisis). Si aparece un
 * producto real de menos de $1.000 (un accesorio barato, un lote por unidad)
 * este es el numero a mover — el costo es dejar pasar menos casos, no romper
 * nada. MX y CO no tienen datos: hoy el pipeline entero es AR y pesos (ver
 * lib/currency.ts), asi que el umbral es uno solo.
 */
export const COSTO_MINIMO_PLAUSIBLE = 1000;

/**
 * Lee un monto tipeado en formato argentino.
 *
 * CAUSA PROBABLE DE LOS COSTOS 85 / 31 / 15 (hallazgo del 1/10): el campo
 * mostraba el placeholder "Ej: 14.900" y el formulario hacia
 * `parseFloat(texto.replace(",", "."))`. `parseFloat("85.000")` es **85**. Un
 * usuario que sigue el ejemplo del propio campo y escribe "85.000" mandaba 85.
 * Los tres casos malos (85, 31, 15) son justo valores redondos en miles.
 *
 * Reglas: el punto seguido de exactamente 3 digitos es separador de miles
 * ("85.000", "1.250.000"); la coma es el decimal ("14.900,50"); un punto con
 * 1-2 digitos despues ("14.5") se respeta como decimal.
 */
export function parsearMontoAR(texto: string): number {
  const t = texto.trim().replace(/\s|\$/g, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) {
    return parseFloat(t.replace(/\./g, "").replace(",", "."));
  }
  return parseFloat(t.replace(",", "."));
}

export function costoImplausiblementeBajo(costoLocal: number): boolean {
  return Number.isFinite(costoLocal) && costoLocal > 0 && costoLocal < COSTO_MINIMO_PLAUSIBLE;
}

/**
 * Las dos lecturas razonables de un costo chico. "Miles abreviados" (85 → 85.000)
 * es la unica que se puede corregir sola; la otra (dolares) necesita un tipo de
 * cambio que el sistema no tiene (lib/currency.ts devuelve 1) y un selector de
 * moneda que queda fuera de este tab, asi que solo se le avisa.
 */
export function sugerirCostoEnMiles(costoLocal: number): number {
  return Math.round(costoLocal * 1000);
}

// ---------------------------------------------------------------------------
// LINK DE MERCADO LIBRE COMO PRODUCTO
// ---------------------------------------------------------------------------

export type EntradaProducto =
  | { tipo: "texto"; producto: string }
  | { tipo: "link_ml"; producto: string }
  | { tipo: "link_sin_titulo" };

const HOST_ML = /(^|\.)mercadolibre\.com(\.[a-z]{2})?$/i;
const PALABRAS_RUIDO = new Set(["p", "up", "jm", "s", "item"]);

function pareceLink(texto: string): boolean {
  return /^https?:\/\//i.test(texto) || /^(www\.)?[a-z0-9-]+\.mercadolibre\.com(\.[a-z]{2})?\//i.test(texto) || /^(www\.)?mercadolibre\.com(\.[a-z]{2})?\//i.test(texto);
}

/** Limpia un segmento del path hasta dejar solo el titulo, o null si no queda uno. */
function tituloDeSegmento(segmento: string): string | null {
  let s: string;
  try {
    s = decodeURIComponent(segmento);
  } catch {
    s = segmento;
  }
  // Sufijos de listado: "..._JM", "_NQ_NP_...", "_Desde_51".
  s = s.replace(/_(JM|NQ.*|Desde_\d+.*)$/i, "");
  // Ids de publicacion: MLA-123456, MLA123456, MLAU229542010 (cualquier pais).
  s = s.replace(/\bML[A-Z]{1,2}U?-?\d+\b/gi, " ");
  s = s.replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  if (sinPalabrasUtiles(s)) return null;
  return s;
}

// Un segmento sirve solo si tiene al menos una palabra de 3+ letras que no sea ruido.
function sinPalabrasUtiles(s: string): boolean {
  const palabras = s.split(" ").filter((p) => /[a-záéíóúñ]{3,}/i.test(p) && !PALABRAS_RUIDO.has(p.toLowerCase()));
  return palabras.length === 0;
}

/**
 * Si el texto es un link, devuelve el titulo sacado del slug o `link_sin_titulo`
 * (hay que pedirle el nombre al usuario). NUNCA devuelve la URL como producto.
 *
 * Solo se lee el slug: no se abre la publicacion (eso es otra feature).
 */
export function normalizarProducto(entrada: string): EntradaProducto {
  const texto = entrada.trim();
  if (!pareceLink(texto)) return { tipo: "texto", producto: texto };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
  } catch {
    return { tipo: "link_sin_titulo" };
  }
  // Un link que no es de ML tampoco puede viajar literal a la busqueda.
  if (!HOST_ML.test(url.hostname)) return { tipo: "link_sin_titulo" };

  // `pathname` ya excluye query string y #fragmento.
  for (const segmento of url.pathname.split("/").filter(Boolean)) {
    const titulo = tituloDeSegmento(segmento);
    if (titulo) return { tipo: "link_ml", producto: titulo.slice(0, 120).trim() };
  }
  return { tipo: "link_sin_titulo" };
}

export const MENSAJE_LINK_SIN_TITULO =
  "Pegaste un link y no pudimos sacar el nombre del producto. Escribí el nombre (por ejemplo: “silla gamer ergonómica”).";
