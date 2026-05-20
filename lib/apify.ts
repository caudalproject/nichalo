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

  console.log("[apify] starting async run", query, "on", siteId);

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
  console.log("[apify] run started, id:", runId);
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
  console.log("[apify] run", runId, "status:", data.data.status);
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

  const data = (await res.json()) as Array<Record<string, unknown>>;
  console.log("[apify] received", data.length, "items for run", runId);

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
