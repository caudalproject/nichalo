import type { MetadataRoute } from "next";
import { NICHOS } from "@/lib/tendencias";

/**
 * Sitemap del sitio (24/9/2026, TAB 7).
 *
 * Nace con el area de tendencias porque es la primera superficie de Nichalo
 * pensada para entrar por buscador. El resto de las paginas publicas se suman
 * aca porque tener un sitemap que solo lista una seccion le dice a Google que
 * el resto no importa.
 *
 * Quedan afuera a proposito las rutas con sesion (`/dashboard`,
 * `/seguimiento`, `/login`) y `/resultado/[id]`: un analisis es de quien lo
 * corrio y se comparte por link, no por buscador.
 */
const BASE = "https://nichalo.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const ahora = new Date();

  return [
    { url: BASE, lastModified: ahora, changeFrequency: "weekly", priority: 1 },
    {
      url: `${BASE}/tendencias`,
      lastModified: ahora,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    ...NICHOS.map((n) => ({
      url: `${BASE}/tendencias/${n.slug}`,
      lastModified: ahora,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    {
      url: `${BASE}/analizar`,
      lastModified: ahora,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
    {
      url: `${BASE}/terminos`,
      lastModified: ahora,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
    {
      url: `${BASE}/privacidad`,
      lastModified: ahora,
      changeFrequency: "yearly" as const,
      priority: 0.3,
    },
  ];
}
