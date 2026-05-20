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

export async function scrapeMercadoLibre(
  query: string,
  pais: "AR" | "MX" | "CO",
  plan: Plan = "free"
): Promise<ScrapeResult> {
  const apiKey = process.env.APIFY_API_KEY;
  const domain = ML_DOMAINS[pais] ?? ML_DOMAINS.AR;
  const siteId = SITE_IDS[pais] ?? "MLA";
  const config = PLAN_CONFIG[plan];

  if (!apiKey) throw new Error("APIFY_API_KEY no configurada");

  const endpoint = `https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${apiKey}`;

  const body = {
    siteId,
    searchQueries: [query],
    maxItems: config.maxItems,
    maxPagesPerQuery: config.maxPagesPerQuery,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
    },
  };

  console.log("[apify] scraping", query, "on", siteId, `(${domain})`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Apify respondió ${res.status}: ${text.slice(0, 300)}`);
  }

  const data = (await res.json()) as Array<Record<string, unknown>>;
  console.log("[apify] received", data.length, "items from", siteId);

  const listings: MLListing[] = data.slice(0, config.maxItems).map((item) => {
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
      isFreeShipping: item.freeShipping === true,
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
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}
