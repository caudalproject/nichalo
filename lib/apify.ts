import { PLAN_CONFIG } from "./plans";
import type { Plan } from "./supabase";
import { tipoPagina, type DetalleVentas, type VentaDetalle } from "./ventas";

// Actor: piotrv1001/mercado-libre-listings-scraper
// Docs: https://apify.com/piotrv1001/mercado-libre-listings-scraper
const ACTOR_ID = "piotrv1001~mercado-libre-listings-scraper";

const SITE_IDS: Record<string, string> = {
  AR: "MLA",
  MX: "MLM",
  CO: "MCO",
};

const ML_DOMAINS: Record<string, string> = {
  AR: "mercadolibre.com.ar",
  MX: "mercadolibre.com.mx",
  CO: "mercadolibre.com.co",
};

export interface MLListing {
  title: string;
  price: number | null;
  currency: string | null;
  seller: string | null;
  rating: number | null;
  reviewsCount: number | null;
  soldQuantity: number | null;
  url: string | null;
  isFreeShipping: boolean | null;
  /**
   * TAB 3.6. Id de la publicacion y del producto de catalogo, tal cual los da
   * el listado. Hacen falta para pedir el detalle (ventas acumuladas) y para
   * unir el detalle de vuelta con el listado. Opcionales: los fixtures y los
   * analisis anteriores al 11/10 no los tienen.
   */
  itemId?: string | null;
  catalogProductId?: string | null;
}

export interface ScrapeResult {
  query: string;
  pais: string;
  domain: string;
  fetchedAt: string;
  totalListings: number;
  listings: MLListing[];
  sourcedFrom: "apify" | "mock";
}

export async function startApifyRun(
  query: string,
  pais: "AR" | "MX" | "CO",
  plan: Plan
): Promise<string> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY no configurada");

  const siteId = SITE_IDS[pais] ?? "MLA";
  const config = PLAN_CONFIG[plan];

  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId,
        searchQueries: [query],
        maxItems: config.maxItems,
        maxPagesPerQuery: config.maxPagesPerQuery,
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ["RESIDENTIAL"],
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify run respondió ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { data: { id: string } };
  const runId = data.data.id;
  return runId;
}

export async function checkApifyRun(runId: string): Promise<{ status: string }> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY no configurada");

  const res = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify status respondió ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as { data: { status: string } };
  return { status: data.data.status };
}

export async function getApifyResults(
  runId: string,
  query: string,
  pais: "AR" | "MX" | "CO",
  maxItems: number
): Promise<ScrapeResult> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY no configurada");

  const domain = ML_DOMAINS[pais] ?? ML_DOMAINS.AR;

  const res = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}&limit=${maxItems}`
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify dataset respondió ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as unknown;
  if (!Array.isArray(data)) {
    console.error("[apify] dataset no es array:", JSON.stringify(data).slice(0, 200));
    return {
      query,
      pais,
      domain,
      fetchedAt: new Date().toISOString(),
      totalListings: 0,
      listings: [],
      sourcedFrom: "apify" as const,
    };
  }

  const listings: MLListing[] = data.map((item) => {
    const seller = item.seller as Record<string, unknown> | null;
    return {
      title: String(item.title ?? ""),
      price: toNum(item.price),
      currency: str(item.currency),
      seller: str(seller?.nickname ?? seller?.storeName),
      rating: toNum(item.ratingAverage),
      reviewsCount: toNum(item.reviewCount),
      soldQuantity: toNum(item.soldQuantity),
      url: str(item.permalink),
      // Mismo criterio que toNum: ausencia !== false. Antes, un nulo se volvia
      // `false` y el 100% del mercado figuraba "sin envio gratis".
      isFreeShipping: item.freeShipping == null ? null : item.freeShipping === true,
      itemId: str(item.itemId),
      catalogProductId: str(item.catalogProductId),
    };
  });

  return {
    query,
    pais,
    domain,
    fetchedAt: new Date().toISOString(),
    totalListings: listings.length,
    listings,
    sourcedFrom: "apify",
  };
}

// ---------------------------------------------------------------------------
// TAB 3.6 — DETALLE DE 10 PUBLICACIONES PARA LAS VENTAS ACUMULADAS
//
// El run de arriba corre en MODO LISTADO: la pagina de busqueda de ML no
// muestra vendidos, y por eso `soldQuantity` llego null en 810 de 810
// publicaciones entre junio y octubre. El dato esta en la pagina de cada
// publicacion. Pedirla cuesta USD 0,025 cada una (`item-detail`), asi que se
// piden solo 10 (~USD 0,25 por analisis) y no las 30.
//
// El seguimiento (TAB 5) NO pasa por aca: sigue en modo listado y no paga
// detalle. Su bloque C se omite con motivo.
// ---------------------------------------------------------------------------

/** Precio del evento `item-detail` del actor, medido el 11/10. */
export const USD_POR_DETALLE = 0.025;
const N_BARATAS = 5;
const N_RELEVANCIA = 5;

export interface ElegidaDetalle {
  itemId: string;
  catalogProductId: string | null;
  url: string;
  titulo: string;
  motivo: "barata" | "relevancia";
}

/**
 * Forma de URL que el actor reconoce como detalle. Medido el 11/10: la forma
 * `articulo.*` devolvio 19 de 20; el permalink `/up/` tal cual, 0 de 1. Para
 * una publicacion de catalogo, ML redirige solo a la pagina del producto.
 */
export function urlDetalle(itemId: string, pais: "AR" | "MX" | "CO"): string | null {
  const m = /^([A-Z]{3})(\d+)$/.exec(itemId);
  if (!m) return null;
  const dominio = ML_DOMAINS[pais] ?? ML_DOMAINS.AR;
  return `https://articulo.${dominio}/${m[1]}-${m[2]}-_JM`;
}

/**
 * Las 10 publicaciones a las que se les pide el detalle. Criterio aprobado por
 * JP el 11/10: las 5 mas baratas + las 5 primeras por relevancia de ML, sin
 * repetir.
 *
 * - Las baratas porque son contra las que compite el que entra por precio, y
 *   porque sus reseñas reactivan el bloque de atrincheramiento (que tambien
 *   llegaba null en modo listado).
 * - Las de relevancia porque ML las ordena en buena parte por ventas: son las
 *   que demuestran (o no) que el mercado compra.
 *
 * El caller tiene que pasarle los listings YA filtrados por relevancia: el
 * paso 0 mostro que las 5 mas baratas del scrape crudo suelen ser accesorios
 * (una funda para el producto, un repuesto), y pagar su detalle es tirar plata.
 */
export function elegirParaDetalle(
  listings: MLListing[],
  pais: "AR" | "MX" | "CO"
): ElegidaDetalle[] {
  const usables = listings.filter((l) => l.itemId && urlDetalle(l.itemId, pais));
  const baratas = usables
    .filter((l) => typeof l.price === "number" && (l.price ?? 0) > 0)
    .sort((a, b) => (a.price as number) - (b.price as number) || (a.itemId as string).localeCompare(b.itemId as string))
    .slice(0, N_BARATAS);
  const elegidas: Array<{ l: MLListing; motivo: "barata" | "relevancia" }> = baratas.map((l) => ({ l, motivo: "barata" }));
  for (const l of usables) {
    if (elegidas.length >= N_BARATAS + N_RELEVANCIA) break;
    if (!elegidas.some((e) => e.l.itemId === l.itemId)) elegidas.push({ l, motivo: "relevancia" });
  }
  return elegidas.map(({ l, motivo }) => ({
    itemId: l.itemId as string,
    catalogProductId: l.catalogProductId ?? null,
    url: urlDetalle(l.itemId as string, pais) as string,
    titulo: l.title,
    motivo,
  }));
}

export async function startDetalleRun(
  elegidas: ElegidaDetalle[],
  pais: "AR" | "MX" | "CO",
  timeoutSegundos: number
): Promise<string> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY no configurada");
  // Tope duro de gasto: si el actor cambia de precio o se le escapa algo, el
  // run se corta solo. Un centavo de margen para el evento de arranque.
  const tope = (elegidas.length * USD_POR_DETALLE + 0.01).toFixed(2);
  const res = await fetch(
    `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${apiKey}&timeout=${timeoutSegundos}&maxTotalChargeUsd=${tope}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        siteId: SITE_IDS[pais] ?? "MLA",
        startUrls: elegidas.map((e) => ({ url: e.url })),
        includeProductDetail: true,
        maxItems: elegidas.length,
        // Cada pagina de detalle tarda ~23 s (medido el 11/10). Con el default
        // de 5 en paralelo, 10 URLs son dos tandas: 110-176 s. Con 10, una.
        maxConcurrency: elegidas.length,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"] },
      }),
    }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify detalle respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as { data: { id: string } };
  return data.data.id;
}

/**
 * Lee el dataset del run de detalle y lo une con las elegidas. La union es por
 * la publicacion pedida (`itemId`) o, si ML devolvio otra publicacion ganadora
 * del mismo catalogo, por el id del catalogo.
 */
export async function getDetalleResults(
  runId: string,
  elegidas: ElegidaDetalle[]
): Promise<DetalleVentas> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) throw new Error("APIFY_API_KEY no configurada");
  const res = await fetch(
    `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}&limit=${elegidas.length + 5}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify dataset de detalle respondió ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as unknown;
  const items = Array.isArray(data) ? (data as Array<Record<string, unknown>>) : [];

  const productos: VentaDetalle[] = [];
  for (const item of items) {
    const id = str(item.id);
    if (!id) continue;
    const itemIdDevuelto = str(item.itemId);
    const elegida =
      elegidas.find((e) => e.itemId === itemIdDevuelto) ??
      elegidas.find((e) => e.catalogProductId != null && e.catalogProductId === id);
    if (!elegida) continue;
    productos.push({
      clave: id,
      itemId: elegida.itemId,
      titulo: String(item.title ?? elegida.titulo),
      url: str(item.permalink),
      tipo: tipoPagina(id, elegida.itemId),
      vendidas: toNum(item.soldQuantity),
      reviews: toNum(item.reviewCount),
      motivo: elegida.motivo,
    });
  }

  return {
    estado: productos.length > 0 ? "ok" : "omitido",
    motivo: productos.length > 0 ? null : "la consulta de ventas no devolvió ninguna página de publicación",
    pedidas: elegidas.length,
    productos,
  };
}

export interface CostoApifyRun {
  runId: string;
  status: string;
  /** Lo que Apify reporta como cobrado. Tarda unos segundos en asentarse. */
  usd: number | null;
  /** Eventos cobrados: `product-listing`, `item-detail`, `apify-actor-start`. */
  eventos: Record<string, number> | null;
}

/** Lo que costo un run. Nunca tira: si falla, devuelve null y el analisis sigue. */
export async function getRunCosto(runId: string): Promise<CostoApifyRun | null> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(`https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`);
    if (!res.ok) return null;
    const { data } = (await res.json()) as {
      data: { status: string; usageTotalUsd?: number; chargedEventCounts?: Record<string, number> };
    };
    return {
      runId,
      status: data.status,
      usd: typeof data.usageTotalUsd === "number" ? data.usageTotalUsd : null,
      eventos: data.chargedEventCounts ?? null,
    };
  } catch {
    return null;
  }
}

/** Corta un run que se paso del tiempo. Best effort: si falla, Apify lo corta por su timeout. */
export async function abortarRun(runId: string): Promise<void> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) return;
  await fetch(`https://api.apify.com/v2/actor-runs/${runId}/abort?token=${apiKey}`, { method: "POST" }).catch(() => undefined);
}

function toNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  // Guarda explicita de ausencia. Sin esto, Number(null) === 0 y Number("") === 0:
  // un dato que Mercado Libre no publica entraba al sistema como un cero real e
  // indistinguible. Medido el 20/9 sobre 300 publicaciones: soldQuantity,
  // reviewCount y ratingAverage vienen null en el 100% de los casos, y Gemini
  // venia infiriendo reputacion de vendedores sobre esos ceros inventados.
  // El score del TAB 3 ya se defendia con filtros `> 0`, asi que este cambio es
  // score-neutral: verificado 10/10 sobre el golden set el 21/9.
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
