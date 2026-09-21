import { PLAN_CONFIG } from "./plans";
import type { Plan } from "./supabase";

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
