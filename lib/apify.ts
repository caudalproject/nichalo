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

const POLL_INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 40; // 40 × 3s = 120s timeout

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

  const runEndpoint = `https://api.apify.com/v2/acts/${ACTOR_ID}/runs?token=${apiKey}`;

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

  console.log("[apify] starting async run", query, "on", siteId);

  const runRes = await fetch(runEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!runRes.ok) {
    const text = await runRes.text().catch(() => "");
    throw new Error(`Apify run respondió ${runRes.status}: ${text.slice(0, 300)}`);
  }

  const runData = (await runRes.json()) as { data: { id: string } };
  const runId = runData.data.id;
  console.log("[apify] run started, id:", runId);

  // Polling
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const statusRes = await fetch(
      `https://api.apify.com/v2/actor-runs/${runId}?token=${apiKey}`
    );

    if (!statusRes.ok) continue;

    const statusData = (await statusRes.json()) as { data: { status: string } };
    const status = statusData.data.status;
    console.log(`[apify] poll ${attempt + 1}/${MAX_ATTEMPTS} — status: ${status}`);

    if (status === "FAILED" || status === "TIMED_OUT") {
      throw new Error(`Apify run ${status} (runId: ${runId})`);
    }

    if (status === "SUCCEEDED") {
      const itemsRes = await fetch(
        `https://api.apify.com/v2/actor-runs/${runId}/dataset/items?token=${apiKey}`
      );

      if (!itemsRes.ok) {
        const text = await itemsRes.text().catch(() => "");
        throw new Error(`Apify dataset respondió ${itemsRes.status}: ${text.slice(0, 300)}`);
      }

      const data = (await itemsRes.json()) as Array<Record<string, unknown>>;
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
  }

  throw new Error(`Apify timeout después de ${MAX_ATTEMPTS * POLL_INTERVAL_MS / 1000}s (runId: ${runId})`);
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
