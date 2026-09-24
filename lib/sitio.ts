/**
 * URL canonica del sitio (24/9/2026, TAB 7).
 *
 * **Es `www.nichalo.com`, no `nichalo.com`**, y la diferencia importa.
 * Verificado contra la API de Vercel: el proyecto tiene tres dominios y
 * `nichalo.com` esta configurado con `redirect: "www.nichalo.com"`. O sea que
 * el apex **redirige (307)** y el unico que sirve contenido es el `www`.
 *
 * La primera version de `/tendencias` declaraba los `canonical` y escribia el
 * sitemap con `https://nichalo.com`. Eso es un defecto justo en lo unico que
 * esta seccion existe para hacer — ser indexada: un sitemap cuyas URLs
 * redirigen es un error clasico de SEO, y un `canonical` que apunta a una
 * redireccion le pide a Google que resuelva una ambiguedad que deberiamos
 * resolver nosotros.
 *
 * Vive aca y no en cada pagina para que exista **una** definicion. Si algun
 * dia el dominio primario cambia, se cambia en un lugar.
 *
 * Nota: `lib/resend.ts` y `lib/notificar-seguimiento.ts` siguen usando el apex
 * para los links de los mails. Funciona (redirige), no es SEO, y cambiarlo
 * estaba fuera del alcance de este tab.
 */
export const SITIO = "https://www.nichalo.com";
