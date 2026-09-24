import { Resend } from 'resend'
import type { FilaMail } from './regla-notificacion'

const RESEND_API_KEY = process.env.RESEND_API_KEY;
if (!RESEND_API_KEY) {
  console.error("[resend] RESEND_API_KEY no configurada");
}
export const resend = new Resend(RESEND_API_KEY)

const BASE_URL = process.env.SITE_URL ?? 'https://nichalo.com'

function escapeHtml(str: unknown): string {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const logoHtml = `<div style="margin-bottom:32px"><span style="font-size:24px;font-weight:700;color:#16a34a">N</span><span style="font-size:24px;font-weight:700;color:#111827">ichalo</span></div>`

const footerHtml = `<div style="margin-top:48px;padding-top:24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">Nichalo · San Isidro, Argentina · <a href="${BASE_URL}" style="color:#9ca3af">nichalo.com</a></div>`

function btnHtml(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:24px">${label}</a>`
}

function wrap(content: string) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#ffffff">${logoHtml}${content}${footerHtml}</div>`
}

export async function sendWelcomeEmail(email: string, nombre: string) {
  const nombreSeguro = escapeHtml(nombre || 'vendedor');
  try {
    const { error: resendError } = await resend.emails.send({
      from: 'Nichalo <hola@nichalo.com>',
      to: email,
      subject: 'Bienvenido a Nichalo 👋',
      html: wrap(`
        <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px">¡Hola ${nombreSeguro}! Ya podés validar tu primer producto</h1>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0">Nichalo analiza el mercado de Mercado Libre en ~3 minutos y te dice si tu producto tiene oportunidad real de venta.</p>
        ${btnHtml(`${BASE_URL}/analizar`, 'Hacer mi primer análisis')}
      `),
    })
    if (resendError) {
      console.error("[resend] error enviando email:", resendError);
    }
  } catch (err) {
    console.error('[Resend] Error enviando bienvenida:', err)
  }
}

const veredictoColor: Record<string, string> = {
  VIABLE: '#16a34a',
  MARGINAL: '#ca8a04',
  SATURADO: '#dc2626',
}

export async function sendAnalysisReadyEmail(
  email: string,
  producto: string,
  veredicto: string,
  score: number,
  analysisId: string,
) {
  const color = veredictoColor[veredicto] ?? '#6b7280'
  const productoSeguro = escapeHtml(producto);
  const veredictoSeguro = escapeHtml(veredicto);
  const scoreSeguro = Number.isFinite(score) ? score : '—';
  try {
    const { error: resendError } = await resend.emails.send({
      from: 'Nichalo <hola@nichalo.com>',
      to: email,
      subject: `Tu análisis de ${productoSeguro} está listo`,
      html: wrap(`
        <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 24px">Tu análisis está listo</h1>
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:24px;display:inline-block;min-width:260px">
          <div style="font-size:13px;color:#6b7280;margin-bottom:8px">${productoSeguro}</div>
          <div style="font-size:28px;font-weight:700;color:${color};margin-bottom:4px">${veredictoSeguro}</div>
          <div style="font-size:15px;color:#374151">Score: <strong>${scoreSeguro}/100</strong></div>
        </div>
        ${btnHtml(`${BASE_URL}/resultado/${encodeURIComponent(analysisId)}`, 'Ver análisis completo')}
      `),
    })
    if (resendError) {
      console.error("[resend] error enviando email:", resendError);
    }
  } catch (err) {
    console.error('[Resend] Error enviando resultado:', err)
  }
}

export async function sendUpsellEmail(email: string) {
  try {
    const { error: resendError } = await resend.emails.send({
      from: 'Nichalo <hola@nichalo.com>',
      to: email,
      subject: `Desbloqueá más análisis en Nichalo 🚀`,
      html: wrap(`
        <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px">Se te acabaron los análisis</h1>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px">Comprá un pack para seguir validando productos, sin vencimiento — o pasate a Pro si validás varios por mes.</p>
        <table style="border-collapse:collapse;width:100%;max-width:400px">
          <tr style="background:#f9fafb">
            <td style="padding:12px 16px;font-weight:600;color:#111827;border:1px solid #e5e7eb;border-radius:8px 0 0 0">Pack 3</td>
            <td style="padding:12px 16px;color:#374151;border:1px solid #e5e7eb">$4.500 ARS</td>
            <td style="padding:12px 16px;color:#374151;border:1px solid #e5e7eb;border-radius:0 8px 0 0">3 análisis, sin vencimiento</td>
          </tr>
          <tr style="background:#f9fafb">
            <td style="padding:12px 16px;font-weight:600;color:#111827;border:1px solid #e5e7eb">Pack 10</td>
            <td style="padding:12px 16px;color:#374151;border:1px solid #e5e7eb">$12.000 ARS</td>
            <td style="padding:12px 16px;color:#374151;border:1px solid #e5e7eb">10 análisis, sin vencimiento</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;font-weight:600;color:#111827;border:1px solid #e5e7eb;border-radius:0 0 0 8px">Pro</td>
            <td style="padding:12px 16px;color:#374151;border:1px solid #e5e7eb">$16.000 ARS/mes</td>
            <td style="padding:12px 16px;color:#374151;border:1px solid #e5e7eb;border-radius:0 0 8px 0">30 análisis/mes + avanzado</td>
          </tr>
        </table>
        ${btnHtml(`${BASE_URL}/#planes`, 'Ver planes')}
        <p style="text-align:center;font-size:11px;color:#9CA3AF;margin-top:24px;">
          No querés recibir estos emails?
          <a href="${BASE_URL}/unsubscribe" style="color:#9CA3AF;">Cancelar suscripción</a>
        </p>
      `),
    })
    if (resendError) {
      console.error("[resend] error enviando email:", resendError);
    }
  } catch (err) {
    console.error('[Resend] Error enviando upsell:', err)
  }
}

/**
 * TAB 5.1 (23/9/2026) — el mail semanal del nicho vigilado.
 *
 * Tres decisiones que estan en el HTML y conviene no perder:
 *
 * 1. EL ASUNTO ES EL TITULAR, no "Novedades de Nichalo". El titular ya lo arma
 *    `armarTitular()` en lib/delta.ts a partir del cambio mas fuerte medido, y
 *    es una frase concreta ("Entraron 3 vendedores nuevos al nicho en 7 dias").
 *    Un asunto generico se abre una vez; uno que dice que paso se abre siempre.
 *
 * 2. SOLO VAN LAS FILAS MATERIALES. El delta calcula once campos; el mail
 *    muestra los que superaron el umbral. El resto esta en la pantalla. Un mail
 *    con once filas donde nueve dicen "igual" es un mail que ensena a ignorar
 *    los mails.
 *
 * 3. NO HAY LINK DE BAJA FALSO. El unico boton es "Ver el producto", y la baja
 *    se explica en texto: se deja de seguir el producto en /seguimiento (TAB
 *    5.2, 24/9: renombre de /vigilancia — ver redirect permanente en
 *    next.config.mjs). `sendUpsellEmail` linkea a `/unsubscribe`, que HOY NO
 *    EXISTE como pagina (404) — repetir ese link aca seria prometer una baja
 *    que no funciona en el mail que mas se repite de todos.
 */


const tonoColor: Record<FilaMail["tono"], string> = {
  bueno: "#16a34a",
  malo: "#dc2626",
  neutro: "#374151",
};

export async function sendSeguimientoEmail(args: {
  email: string;
  producto: string;
  titular: string;
  tipo: "cambios" | "resumen";
  dias: number;
  mediciones?: number;
  filas: FilaMail[];
  vendedoresNuevos: string[];
  productoUrl: string;
}) {
  const productoSeguro = escapeHtml(args.producto);
  const titularSeguro = escapeHtml(args.titular);

  const asunto =
    args.tipo === "resumen"
      ? `${args.producto}: sin cambios en las últimas ${Math.max(1, Math.round(args.dias / 7))} semanas`
      : `${args.producto}: ${args.titular}`;

  const filasHtml = args.filas
    .map(
      (f) => `
        <tr>
          <td style="padding:10px 12px;font-size:14px;color:#374151;border-bottom:1px solid #f3f4f6">${escapeHtml(f.etiqueta)}</td>
          <td style="padding:10px 12px;font-size:13px;color:#9ca3af;border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap">${escapeHtml(f.antes)}</td>
          <td style="padding:10px 12px;font-size:14px;font-weight:600;color:${tonoColor[f.tono]};border-bottom:1px solid #f3f4f6;text-align:right;white-space:nowrap">${escapeHtml(f.ahora)}</td>
        </tr>`
    )
    .join("");

  const tablaHtml = args.filas.length
    ? `<table style="border-collapse:collapse;width:100%;margin-top:24px">
         <tr>
           <th style="padding:0 12px 8px;font-size:11px;font-weight:600;color:#9ca3af;text-align:left;text-transform:uppercase;letter-spacing:.04em">Qué cambió</th>
           <th style="padding:0 12px 8px;font-size:11px;font-weight:600;color:#9ca3af;text-align:right;text-transform:uppercase;letter-spacing:.04em">Antes</th>
           <th style="padding:0 12px 8px;font-size:11px;font-weight:600;color:#9ca3af;text-align:right;text-transform:uppercase;letter-spacing:.04em">Ahora</th>
         </tr>
         ${filasHtml}
       </table>`
    : "";

  const vendedoresHtml = args.vendedoresNuevos.length
    ? `<p style="font-size:14px;color:#374151;line-height:1.6;margin:24px 0 0"><strong>Vendedores nuevos:</strong> ${args.vendedoresNuevos
        .slice(0, 6)
        .map((v) => escapeHtml(v))
        .join(", ")}${args.vendedoresNuevos.length > 6 ? ` y ${args.vendedoresNuevos.length - 6} más` : ""}.</p>`
    : "";

  const cuerpoResumen = `
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0">Medimos <strong>${productoSeguro}</strong>${
      args.mediciones ? ` ${args.mediciones} ${args.mediciones === 1 ? "vez" : "veces"}` : ""
    } en el último mes y el nicho no se movió lo suficiente como para escribirte.</p>
    <p style="font-size:14px;color:#6b7280;line-height:1.6;margin:16px 0 0">Te mandamos este resumen una vez por mes para que sepas que el seguimiento sigue corriendo. Los demás mails solo salen cuando algo cambia de verdad.</p>`;

  const cuerpoCambios = `
    <p style="font-size:15px;color:#374151;line-height:1.6;margin:0">Esto es lo que se movió en <strong>${productoSeguro}</strong> desde la medición anterior. Todo medido sobre las publicaciones reales de Mercado Libre, sin inteligencia artificial de por medio.</p>
    ${tablaHtml}
    ${vendedoresHtml}`;

  try {
    const { error: resendError } = await resend.emails.send({
      from: 'Nichalo <hola@nichalo.com>',
      to: args.email,
      subject: asunto.length > 120 ? asunto.slice(0, 117) + "…" : asunto,
      html: wrap(`
        <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px;line-height:1.35">${titularSeguro}</h1>
        ${args.tipo === "resumen" ? cuerpoResumen : cuerpoCambios}
        ${btnHtml(args.productoUrl, 'Ver el producto')}
        <p style="font-size:11px;color:#9ca3af;margin-top:28px;line-height:1.6">Recibís este mail porque estás siguiendo este producto en Nichalo. Para dejar de recibirlo, dejá de seguirlo desde <a href="${BASE_URL}/seguimiento" style="color:#9ca3af">tu lista de seguimiento</a>.</p>
      `),
    })
    if (resendError) {
      console.error("[resend] error enviando mail de seguimiento:", resendError);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Resend] Error enviando seguimiento:', err)
    return false;
  }
}
