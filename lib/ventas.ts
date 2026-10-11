/**
 * Ventas acumuladas de la competencia, en escalones. TAB 3.6 (11/10/2026).
 *
 * POR QUE EXISTE
 *
 * El bloque C del score ("demanda probada") no corrio NUNCA entre junio y el
 * 11/10: `soldQuantity` llego null en 810 de 810 publicaciones. No era que
 * Mercado Libre "casi nunca" lo publicara: el actor de Apify corre en modo
 * listado, y la pagina de busqueda de ML no muestra vendidos. En modo detalle
 * (la pagina de cada publicacion) si viene — medido en el paso 0 del 3.6: 26
 * de 28 paginas lo traen.
 *
 * TRES COSAS QUE ESTE MODULO HACE CUMPLIR, porque son las que hacen honesto al
 * numero:
 *
 * 1. ES UN PISO, NO UN CONTEO. ML lo muestra en escalones. Escalera observada
 *    el 11/10 sobre 28 paginas: +5, +25, +50, +100, +500, +1000 (y por encima
 *    +5mil, +10mil...). "+1000" es "por lo menos mil". Por eso se escribe
 *    siempre con "+" y "acumuladas": son desde que se creo la publicacion, no
 *    por mes ni por dia. "Unidades por dia" se descarto en el TAB 3.5: con
 *    escalones la diferencia entre dos mediciones da 0 y despues salta +4.000.
 *
 * 2. EN CATALOGO EL NUMERO ES DEL PRODUCTO, NO DEL VENDEDOR. La URL de una
 *    publicacion que pertenece a un producto de catalogo redirige a la pagina
 *    del catalogo, y ahi el contador suma a todos los vendedores. Medido el
 *    11/10: 22 de 28 paginas fueron de catalogo, incluidas varias que en el
 *    listado no lo parecian. Se rotula siempre.
 *
 * 3. null NUNCA ES 0. Una pagina sin el dato no "vendio cero": no lo publica.
 *    Sale del denominador. Fue el error de junio a septiembre (`toNum(null)`
 *    devolvia 0) y no se repite.
 *
 * Modulo puro: sin red, sin Supabase. Lo usan `lib/score.ts`, `lib/gemini.ts`
 * y la pagina de resultado.
 */

/** Que pagina devolvio el detalle. Decide como se lee el contador. */
export type TipoPaginaVentas = "catalogo" | "oferta" | "publicacion";

export interface VentaDetalle {
  /**
   * Id de la pagina de detalle que devolvio ML: el id del producto de catalogo
   * (MLA + ~8 digitos), el de la oferta (MLAU...) o el de la publicacion. Es la
   * clave de deduplicacion: dos publicaciones que caen en el mismo catalogo son
   * un solo producto.
   */
  clave: string;
  /** La publicacion del listado que se pidio. Une el detalle con el listado. */
  itemId: string | null;
  titulo: string;
  url: string | null;
  tipo: TipoPaginaVentas;
  /** Piso de ventas acumuladas que muestra ML. null = la pagina no lo publica. */
  vendidas: number | null;
  /** Reseñas de la pagina de detalle. En catalogo, del producto. */
  reviews: number | null;
  /** Por que entro entre las 10: criterio aprobado el 11/10. */
  motivo: "barata" | "relevancia";
}

export interface DetalleVentas {
  /** "omitido" = la consulta fallo, tardo de mas o no hubo que pedir. */
  estado: "ok" | "omitido";
  /** Por que se omitio. Es lo que la UI muestra en "No computado". */
  motivo: string | null;
  /** Cuantas URLs de detalle se pidieron. */
  pedidas: number;
  productos: VentaDetalle[];
}

export interface ResumenVentas {
  /** Productos distintos (deduplicados por `clave`) con el dato publicado. */
  medidos: number;
  /** Productos distintos que no publican el dato. No cuentan como cero. */
  sin_dato: number;
  /** De los medidos, cuantos llegan a +100 acumuladas. */
  con_100: number;
  pct_100: number | null;
  /** El escalon mas alto alcanzado por algun producto. */
  escalon_max: number | null;
  /** De los medidos, cuantos son paginas de catalogo (todos los vendedores). */
  de_catalogo: number;
}

/** Umbral de "demanda probada" por producto. Ver la nota de la formula. */
export const UMBRAL_VENTAS = 100;
/** Debajo de esto el bloque no mide un mercado: mide un par de productos. */
export const MIN_PRODUCTOS_MEDIDOS = 4;

export function tipoPagina(id: string, itemIdPedido: string | null): TipoPaginaVentas {
  if (/^[A-Z]{3}U\d+$/.test(id)) return "oferta";
  if (itemIdPedido && id === itemIdPedido) return "publicacion";
  return "catalogo";
}

/** Un producto por clave. Se queda con el primero que tenga el dato. */
export function deduplicar(productos: VentaDetalle[]): VentaDetalle[] {
  const porClave = new Map<string, VentaDetalle>();
  // Orden estable por clave: el dataset de Apify no garantiza orden, y el
  // score tiene que dar lo mismo en cualquier lectura.
  const ordenados = [...productos].sort((a, b) => a.clave.localeCompare(b.clave));
  for (const p of ordenados) {
    const previo = porClave.get(p.clave);
    if (!previo || (previo.vendidas == null && p.vendidas != null)) porClave.set(p.clave, p);
  }
  return Array.from(porClave.values());
}

export function resumirVentas(productos: VentaDetalle[]): ResumenVentas {
  const unicos = deduplicar(productos);
  // Un 0 explicito si es un dato (la pagina dice que no vendio); null no.
  const medidos = unicos.filter((p) => typeof p.vendidas === "number" && p.vendidas >= 0);
  const con100 = medidos.filter((p) => (p.vendidas as number) >= UMBRAL_VENTAS).length;
  return {
    medidos: medidos.length,
    sin_dato: unicos.length - medidos.length,
    con_100: con100,
    pct_100: medidos.length > 0 ? con100 / medidos.length : null,
    escalon_max: medidos.length > 0 ? Math.max(...medidos.map((p) => p.vendidas as number)) : null,
    de_catalogo: medidos.filter((p) => p.tipo === "catalogo").length,
  };
}

function locale(pais?: string): string {
  return pais === "MX" ? "es-MX" : pais === "CO" ? "es-CO" : "es-AR";
}

/** "+1.000 acumuladas". Siempre con "+": es un piso. Nunca "por dia". */
export function textoVendidas(n: number | null, pais?: string): string {
  if (n == null) return "no publica sus ventas";
  if (n <= 0) return "sin ventas";
  return `+${Math.round(n).toLocaleString(locale(pais))} acumuladas`;
}

/** "+1.000" sin el sufijo, para frases que ya dicen "acumuladas". */
export function pisoVendidas(n: number, pais?: string): string {
  return `+${Math.round(n).toLocaleString(locale(pais))}`;
}

export function etiquetaTipo(tipo: TipoPaginaVentas): string {
  return tipo === "catalogo"
    ? "el producto, todos los vendedores"
    : tipo === "oferta"
      ? "esta oferta"
      : "esta publicación";
}
