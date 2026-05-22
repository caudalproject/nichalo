import { Resend } from 'resend'

export const resend = new Resend(process.env.RESEND_API_KEY)

const BASE_URL = 'https://nichalo.com'

const logoHtml = `<div style="margin-bottom:32px"><span style="font-size:24px;font-weight:700;color:#16a34a">N</span><span style="font-size:24px;font-weight:700;color:#111827">ichalo</span></div>`

const footerHtml = `<div style="margin-top:48px;padding-top:24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af">Nichalo · San Isidro, Argentina · <a href="${BASE_URL}" style="color:#9ca3af">nichalo.com</a></div>`

function btnHtml(href: string, label: string) {
  return `<a href="${href}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:24px">${label}</a>`
}

function wrap(content: string) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;padding:40px 20px;background:#ffffff">${logoHtml}${content}${footerHtml}</div>`
}

export async function sendWelcomeEmail(email: string, nombre: string) {
  try {
    await resend.emails.send({
      from: 'hola@nichalo.com',
      to: email,
      subject: 'Bienvenido a Nichalo 👋',
      html: wrap(`
        <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px">¡Hola ${nombre}! Ya podés validar tu primer producto</h1>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0">Nichalo analiza el mercado de Mercado Libre en segundos y te dice si tu producto tiene oportunidad real de venta.</p>
        ${btnHtml(`${BASE_URL}/analizar`, 'Hacer mi primer análisis')}
      `),
    })
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
  try {
    await resend.emails.send({
      from: 'hola@nichalo.com',
      to: email,
      subject: `Tu análisis de ${producto} está listo`,
      html: wrap(`
        <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 24px">Tu análisis está listo</h1>
        <div style="border:1px solid #e5e7eb;border-radius:12px;padding:24px;display:inline-block;min-width:260px">
          <div style="font-size:13px;color:#6b7280;margin-bottom:8px">${producto}</div>
          <div style="font-size:28px;font-weight:700;color:${color};margin-bottom:4px">${veredicto}</div>
          <div style="font-size:15px;color:#374151">Score: <strong>${score}/100</strong></div>
        </div>
        ${btnHtml(`${BASE_URL}/resultado/${analysisId}`, 'Ver análisis completo')}
      `),
    })
  } catch (err) {
    console.error('[Resend] Error enviando resultado:', err)
  }
}

export async function sendUpsellEmail(email: string) {
  try {
    await resend.emails.send({
      from: 'hola@nichalo.com',
      to: email,
      subject: 'Te quedaste sin análisis — upgrade a Starter o Pro',
      html: wrap(`
        <h1 style="font-size:22px;font-weight:700;color:#111827;margin:0 0 16px">Se te acabaron los análisis</h1>
        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 24px">Hacé upgrade para seguir validando productos y encontrar tu próximo nicho.</p>
        <table style="border-collapse:collapse;width:100%;max-width:400px">
          <tr style="background:#f9fafb">
            <td style="padding:12px 16px;font-weight:600;color:#111827;border:1px solid #e5e7eb;border-radius:8px 0 0 0">Starter</td>
            <td style="padding:12px 16px;color:#374151;border:1px solid #e5e7eb">$12 USD/mes</td>
            <td style="padding:12px 16px;color:#374151;border:1px solid #e5e7eb;border-radius:0 8px 0 0">10 análisis</td>
          </tr>
          <tr>
            <td style="padding:12px 16px;font-weight:600;color:#111827;border:1px solid #e5e7eb;border-radius:0 0 0 8px">Pro</td>
            <td style="padding:12px 16px;color:#374151;border:1px solid #e5e7eb">$29 USD/mes</td>
            <td style="padding:12px 16px;color:#374151;border:1px solid #e5e7eb;border-radius:0 0 8px 0">30 análisis + imagen</td>
          </tr>
        </table>
        ${btnHtml(`${BASE_URL}/#planes`, 'Ver planes')}
      `),
    })
  } catch (err) {
    console.error('[Resend] Error enviando upsell:', err)
  }
}
