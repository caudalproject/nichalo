const ML_SITE_MAP: Record<string, string> = {
  AR: "MLA",
  MX: "MLM",
  CO: "MCO",
};

export async function getMLSearchTotal(
  producto: string,
  pais: string
): Promise<number> {
  const siteId = ML_SITE_MAP[pais] ?? "MLA";
  try {
    const query = encodeURIComponent(producto);
    const res = await fetch(
      `https://api.mercadolibre.com/sites/${siteId}/search?q=${query}&limit=1`,
      { headers: { "Content-Type": "application/json" } }
    );
    if (!res.ok) return 0;
    const data = await res.json();
    return data?.paging?.total ?? 0;
  } catch {
    return 0;
  }
}

export async function getMLCategoryData(
  producto: string,
  pais: string
): Promise<{ categoryName: string; totalInCategory: number } | null> {
  const siteId = ML_SITE_MAP[pais] ?? "MLA";
  try {
    const query = encodeURIComponent(producto);
    const res = await fetch(
      `https://api.mercadolibre.com/sites/${siteId}/search?q=${query}&limit=1`,
      { headers: { "Content-Type": "application/json" } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const filters = data?.available_filters ?? [];
    const catFilter = filters.find((f: { id: string }) => f.id === "category");
    if (!catFilter?.values?.length) return null;
    const topCat = catFilter.values[0];
    return {
      categoryName: topCat.name ?? "",
      totalInCategory: topCat.results ?? 0,
    };
  } catch {
    return null;
  }
}
