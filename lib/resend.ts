import { Resend } from 'resend'
import type { FilaMail } from './regla-notificacion'
import { createSupabaseServiceClient } from './supabase-service'
import { registrarEvento } from './eventos-embudo'

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

/**
 * Baja de mails (TAB 3.8, 11/10/2026). El link lleva el `baja_token` del
 * usuario: se da de baja sin iniciar sesion. Sin token (mails viejos que
 * linkean a /unsubscribe pelado) la pagina pide sesion.
 */
function bajaUrl(token?: string | null) {
  return token
    ? `${BASE_URL}/unsubscribe?t=${encodeURIComponent(token)}`
    : `${BASE_URL}/unsubscribe`
}

/** Encabezados de baja en un clic (RFC 8058) — los piden Gmail y Yahoo. */
function headersBaja(token?: string | null): Record<string, string> | undefined {
  if (!token) return undefined
  return {
    'List-Unsubscribe': `<${BASE_URL}/api/unsubscribe?t=${encodeURIComponent(token)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  }
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

/**
 * Sale con el 402 de un segundo intento sin creditos.
 *
 * TAB 3.8 (11/10/2026): antes salia en CADA 402 (el que tocaba 3 veces recibia
 * 3 mails) y linkeaba a un /unsubscribe que daba 404. Ahora: respeta la baja,
 * sale una sola vez por usuario (candado `mail_upsell` en eventos_embudo) y
 * el link de baja funciona. La firma no cambia: la route de analisis no se toca.
 */
export async function sendUpsellEmail(email: string) {
  let bajaToken: string | null = null
  try {
    const sb = createSupabaseServiceClient()
    const { data: u } = await sb
      .from('users')
      .select('id, baja_token, mails_baja_at')
      .eq('email', email)
      .limit(1)
      .maybeSingle()
    if (u?.mails_baja_at) return
    if (u) {
      // false = ya se le mando (o la base fallo: ante la duda, no se insiste)
      if (!(await registrarEvento(u.id, 'mail_upsell'))) return
      bajaToken = u.baja_token
    }
  } catch (err) {
    console.error('[Resend] upsell: no se pudo chequear baja/duplicado:', err)
    return
  }

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
          <a href="${bajaUrl(bajaToken)}" style="color:#9CA3AF;">Cancelar suscripción</a>
        </p>
      `),
      headers: headersBaja(bajaToken),
    })
    if (resendError) {
      console.error("[resend] error enviando email:", resendError);
    }
  } catch (err) {
    console.error('[Resend] Error enviando upsell:', err)
  }
}

const VEREDICTO_MINUSCULA: Record<string, string> = {
  VIABLE: 'viable',
  MARGINAL: 'marginal',
  SATURADO: 'saturado',
}

/** Desde el TAB 3.6 (score-v1.4, 11/10/2026) el analisis mide ventas de la competencia. */
const ANALISIS_CON_VENTAS_DESDE = Date.parse('2026-10-11T03:00:00Z')

/**
 * Mail unico de seguimiento (TAB 3.8, 11/10/2026): a las 24-48 h del primer
 * analisis, a quien quedo en 0 y no compro. Uno solo, nunca una secuencia.
 * Lo dispara `lib/mail-seguimiento.ts`; el candado de "uno solo" vive alla.
 *
 * El boton pasa por /api/mail/click para medir el click (evento `mail_click`)
 * y redirige a /analizar, que sin creditos muestra los packs con el producto
 * del usuario.
 */
export async function sendSeguimiento24hEmail(args: {
  email: string
  producto: string
  veredicto: string
  score: number | null
  analysisId: string
  analisisAt: string
  bajaToken: string
}): Promise<boolean> {
  const productoLimpio = (args.producto || 'tu producto').trim()
  const productoTitulo =
    productoLimpio.charAt(0).toUpperCase() + productoLimpio.slice(1)
  const productoCorto =
    productoTitulo.length > 60 ? productoTitulo.slice(0, 57) + '…' : productoTitulo
  const veredicto = VEREDICTO_MINUSCULA[args.veredicto] ?? 'marginal'
  const productoSeguro = escapeHtml(productoLimpio)
  const color = veredictoColor[args.veredicto] ?? '#6b7280'
  const scoreTxt = Number.isFinite(args.score) ? ` (${args.score}/100)` : ''

  const analisisMs = Date.parse(args.analisisAt)
  const horas = (Date.now() - analisisMs) / 3_600_000
  const cuando =
    horas < 48
      ? 'Ayer'
      : `El ${new Date(analisisMs).toLocaleDateString('es-AR', {
          day: 'numeric',
          month: 'numeric',
          timeZone: 'America/Argentina/Buenos_Aires',
        })}`

  const parrafoVeredicto =
    args.veredicto === 'VIABLE'
      ? 'Antes de comprar stock conviene compararlo con dos alternativas: el que mejor da no siempre es el primero que se te ocurrió.'
      : 'Que un producto no cierre es la mitad del trabajo: te ahorraste comprar stock que no iba a rotar. La otra mitad es encontrar el que sí.'

  const parrafoNovedad =
    analisisMs < ANALISIS_CON_VENTAS_DESDE
      ? `<p style="font-size:15px;color:#374151;line-height:1.6;margin:16px 0 0">Desde esta semana el análisis también mide cuánto vendieron las publicaciones de la competencia en Mercado Libre, así que el próximo que hagas va a tener más datos que el de ${productoSeguro}.</p>`
      : ''

  const ctaUrl = `${BASE_URL}/api/mail/click?t=${encodeURIComponent(args.bajaToken)}&c=seguimiento_24h`

  try {
    const { error: resendError } = await resend.emails.send({
      from: 'Nichalo <hola@nichalo.com>',
      to: args.email,
      subject: `${productoCorto} dio ${veredicto}. ¿Cuál probás ahora?`,
      html: wrap(`
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0">${cuando} analizaste <strong>${productoSeguro}</strong> en Nichalo y dio <strong style="color:${color}">${escapeHtml(args.veredicto)}${scoreTxt}</strong>.</p>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:16px 0 0">${parrafoVeredicto}</p>
        ${parrafoNovedad}
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:16px 0 0">Con el Pack 3 validás tres productos más por $4.500 — $1.500 cada uno, sin vencimiento.</p>
        ${btnHtml(ctaUrl, 'Elegir mi próximo producto →')}
        <p style="font-size:13px;margin:20px 0 0"><a href="${BASE_URL}/resultado/${encodeURIComponent(args.analysisId)}" style="color:#6b7280">Volver a ver el análisis de ${productoSeguro}</a></p>
        <p style="font-size:14px;color:#374151;margin:28px 0 0">— Nichalo</p>
        <p style="font-size:11px;color:#9ca3af;margin-top:28px;line-height:1.6">Es el único mail que te mandamos sobre esto. <a href="${bajaUrl(args.bajaToken)}" style="color:#9ca3af">Darme de baja</a>.</p>
      `),
      headers: headersBaja(args.bajaToken),
    })
    if (resendError) {
      console.error('[resend] error enviando mail de seguimiento 24h:', resendError)
      return false
    }
    return true
  } catch (err) {
    console.error('[Resend] Error enviando seguimiento 24h:', err)
    return false
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
 *    next.config.mjs). Cuando se escribio esto (23/9) `/unsubscribe`
 *    daba 404. Existe desde el TAB 3.8 (11/10), pero corta los mails de
 *    marketing, no el seguimiento: ese se corta dejando de seguir el producto.
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
