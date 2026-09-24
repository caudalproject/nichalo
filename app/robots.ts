import type { MetadataRoute } from "next";

/**
 * robots.txt (24/9/2026, TAB 7).
 *
 * Existe sobre todo para declarar el sitemap. Los `disallow` son las rutas que
 * no tienen nada que hacer en un indice: requieren sesion, son callbacks de
 * auth, o son la API.
 *
 * `/resultado/` se bloquea a proposito. Un analisis es publico por link
 * —decision del TAB 4, el anonimo ve el analisis entero— pero publico por link
 * no es lo mismo que indexable: son paginas de un usuario concreto con su
 * producto y su costo adentro, y no queremos que aparezcan en una busqueda.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/auth/", "/dashboard", "/seguimiento", "/login", "/resultado/"],
    },
    sitemap: "https://nichalo.com/sitemap.xml",
  };
}
