// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
const googleTrends = require("google-trends-api") as any;

export async function getMLSearchTotal(
  producto: string,
  pais: string
): Promise<number> {
  const siteMap: Record<string, string> = {
    AR: "MLA",
    MX: "MLM",
    CO: "MCO",
    CL: "MLC",
    UY: "MLU",
  };
  const siteId = siteMap[pais] ?? "MLA";
  const query = encodeURIComponent(producto);

  try {
    const res = await fetch(
      `https://api.mercadolibre.com/sites/${siteId}/search?q=${query}&limit=1`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return data?.paging?.total ?? 0;
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
