// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const googleTrends = require("google-trends-api") as any;

export async function getMLSearchTotal(
  producto: string,
  pais: string
): Promise<number> {
  const domainMap: Record<string, string> = {
    AR: "listado.mercadolibre.com.ar",
    MX: "listado.mercadolibre.com.mx",
    CO: "listado.mercadolibre.com.co",
  };
  const domain = domainMap[pais] ?? "listado.mercadolibre.com.ar";
  const query = encodeURIComponent(producto);

  try {
    const res = await fetch(
      `https://${domain}/${query}`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          "Accept": "text/html",
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    if (!res.ok) return 0;
    const html = await res.text();
    console.log("[ml-search] HTML snippet:", html.substring(0, 500));

    const patterns = [
      /(\d[\d.]*)\s*resultados/i,
      /(\d[\d.]*)\s*resultado/i,
      /"paging":\{"total":(\d+)/,
      /results['"]\s*:\s*(\d+)/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        return parseInt(match[1].replace(/\./g, ""), 10);
      }
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function getMLCategoryData(
  _producto: string,
  _pais: string
): Promise<{ categoryName: string; totalInCategory: number } | null> {
  return null;
}

export async function getGoogleTrends(
  producto: string,
  pais: string
): Promise<{ trending: boolean; interest: number; related: string[] }> {
  const geoMap: Record<string, string> = {
    AR: "AR",
    MX: "MX",
    CO: "CO",
  };
  const geo = geoMap[pais] ?? "AR";

  try {
    const result = await googleTrends.interestOverTime({
      keyword: producto,
      geo,
      startTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
      endTime: new Date(),
    });

    const data = JSON.parse(result);
    const timeline = data?.default?.timelineData ?? [];

    if (!timeline.length) return { trending: false, interest: 0, related: [] };

    const values = timeline.map((t: { value?: number[] }) => t.value?.[0] ?? 0);
    const avg = values.reduce((a: number, b: number) => a + b, 0) / values.length;

    const recent = values.slice(-4).reduce((a: number, b: number) => a + b, 0) / 4;
    const old = values.slice(0, 4).reduce((a: number, b: number) => a + b, 0) / 4;
    const trending = recent > old * 1.1;

    const relatedResult = await googleTrends.relatedQueries({
      keyword: producto,
      geo,
    });
    const relatedData = JSON.parse(relatedResult);
    const related: string[] =
      relatedData?.default?.rankedList?.[0]?.rankedKeyword
        ?.slice(0, 5)
        ?.map((k: { query: string }) => k.query) ?? [];

    return { trending, interest: Math.round(avg), related };
  } catch {
    return { trending: false, interest: 0, related: [] };
  }
}
