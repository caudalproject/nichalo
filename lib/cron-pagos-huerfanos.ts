/**
 * Alerta de pago huerfano (25/9/2026).
 *
 * UN PAGO HUERFANO ES PLATA COBRADA SIN PRODUCTO ENTREGADO.
 *
 * Por que existe este archivo: el 25/9/2026 entro la primera compra organica
 * (Pack 3, $4.500) y el webhook de MP nunca la acredito — el `notification_url`
 * de la preferencia apuntaba al apex `nichalo.com`, que redirige 307 a `www`, y
 * MP no sigue redirects en las notificaciones. El cliente pago y se quedo con
 * cero creditos.
 *
 * La causa de ese bug ya esta arreglada (ver lib/sitio.ts y crear-pack). Este
 * archivo NO arregla esa causa: existe porque **el sistema no tenia forma de
 * enterarse**. Se detecto porque JP leyo un mail de Mercado Pago un jueves a la
 * manana. Esa es la falla de fondo, y sobrevive a cualquier fix puntual del
 * webhook: si manana se cae por otro motivo — token vencido, firma cambiada,
 * MP caido — el sintoma vuelve a ser silencioso.
 *
 * Compara lo que MP dice que se cobro contra lo que la base dice que se
 * entrego, y avisa cuando no coinciden.
 *
 * DIFERENCIA A PROPOSITO CON EL CRON DE SEGUIMIENTO: aquel nace apagado porque
 * cada corrida paga scrapes de Apify. Este **nace encendido**, porque una
 * corrida cuesta cero (una lectura a la API de MP y una query a Supabase) y
 * porque un monitor que nace apagado reproduce exactamente el problema que
 * vino a resolver. El interruptor existe igual, pero hay que pedirlo.
 */

import { createClient } from "@supabase/supabase-js";
import { inngest } from "./inngest";
import { resend } from "./resend";
import { SITIO } from "./sitio";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/** Interruptor. Cualquier valor distinto de "off" deja el monitor encendido. */
export function monitorEncendido(): boolean {
  return (process.env.PAGOS_HUERFANOS_CRON ?? "on").trim().toLowerCase() !== "off";
}

/**
 * A donde va la alerta.
 *
 * Es una variable de entorno y no una constante para no escribir una direccion
 * personal en el repositorio. Si no esta configurada cae a la casilla de la
 * marca, que siempre existe: preferimos un mail que quizas nadie lea antes que
 * un monitor que descubre un problema y se lo guarda.
 */
function destinoAlerta(): string {
  const v = (process.env.ALERTAS_EMAIL ?? "").trim();
  return v.length > 0 ? v : "hola@nichalo.com";
}

/**
 * Cuanto hacia atras se miran los pagos. Siete dias cubre un fin de semana
 * largo con el monitor caido sin traer un historial entero en cada corrida.
 */
const DIAS_VENTANA = 7;

/**
 * Gracia antes de considerar huerfano a un pago.
 *
 * El webhook legitimo tarda segundos. Sin esta ventana, una corrida que cae
 * justo entre el "approved" de MP y el INSERT del webhook levantaria una falsa
 * alarma por cada compra sana — y un monitor que grita en falso se termina
 * ignorando, que es la unica forma de que este archivo no sirva para nada.
 */
const MINUTOS_DE_GRACIA = 15;

/** Techo de pagos por corrida. No esperamos ni cerca de este volumen todavia;
 *  esta para que un rango de fechas mal armado no traiga un historial entero. */
const MAX_PAGOS = 100;

export interface PagoHuerfano {
  id: string;
  monto: number;
  email: string | null;
  fecha: string;
}

export interface ResultadoMonitor {
  estado: "off" | "sin-token" | "error-mp" | "ok";
  revisados: number;
  huerfanos: PagoHuerfano[];
  aviso: "enviado" | "no-hizo-falta" | "fallo" | null;
  detalle?: string;
}

interface PagoMP {
  id: number | string;
  transaction_amount?: number;
  date_approved?: string;
  date_created?: string;
  payer?: { email?: string };
}

/**
 * Pagos aprobados de los ultimos DIAS_VENTANA dias, segun Mercado Pago.
 *
 * Se usa `fetch` contra la API y no `Payment.search` del SDK a proposito: la
 * forma del search del SDK cambio entre versiones y este archivo es una red de
 * seguridad — no puede romperse por un upgrade de dependencia que nadie ligo
 * con los pagos.
 */
async function pagosAprobadosRecientes(token: string): Promise<PagoMP[]> {
  const desde = new Date(Date.now() - DIAS_VENTANA * 24 * 60 * 60 * 1000).toISOString();
  const url =
    "https://api.mercadopago.com/v1/payments/search" +
    `?sort=date_created&criteria=desc&status=approved` +
    `&range=date_created&begin_date=${encodeURIComponent(desde)}&end_date=NOW` +
    `&limit=${MAX_PAGOS}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

  if (!res.ok) {
    throw new Error(`MP respondio ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  const data = (await res.json()) as { results?: PagoMP[] };
  return data.results ?? [];
}

function formatearPesos(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

/**
 * El corazon del monitor. Exportada aparte de la funcion de Inngest para poder
 * correrla a mano sin esperar al cron.
 */
export async function buscarPagosHuerfanos(): Promise<ResultadoMonitor> {
  if (!monitorEncendido()) {
    return { estado: "off", revisados: 0, huerfanos: [], aviso: null };
  }

  const token = process.env.MP_ACCESS_TOKEN;
  if (!token) {
    console.error("[pagos-huerfanos] MP_ACCESS_TOKEN no configurado");
    return { estado: "sin-token", revisados: 0, huerfanos: [], aviso: null };
  }

  let pagos: PagoMP[];
  try {
    pagos = await pagosAprobadosRecientes(token);
  } catch (err) {
    const detalle = err instanceof Error ? err.message : String(err);
    console.error("[pagos-huerfanos] error consultando MP:", detalle);
    return { estado: "error-mp", revisados: 0, huerfanos: [], aviso: null, detalle };
  }

  // Los muy recientes todavia pueden estar en manos del webhook legitimo.
  const corte = Date.now() - MINUTOS_DE_GRACIA * 60 * 1000;
  const candidatos = pagos.filter((p) => {
    const cuando = p.date_approved ?? p.date_created;
    return cuando ? new Date(cuando).getTime() < corte : false;
  });

  if (candidatos.length === 0) {
    return { estado: "ok", revisados: 0, huerfanos: [], aviso: "no-hizo-falta" };
  }

  const ids = candidatos.map((p) => String(p.id));

  const { data: registradas, error } = await supabase
    .from("purchases")
    .select("mp_payment_id")
    .in("mp_payment_id", ids);

  if (error) {
    console.error("[pagos-huerfanos] error leyendo purchases:", error.message);
    return {
      estado: "error-mp",
      revisados: candidatos.length,
      huerfanos: [],
      aviso: null,
      detalle: error.message,
    };
  }

  const yaEstan = new Set((registradas ?? []).map((r) => String(r.mp_payment_id)));

  const huerfanos: PagoHuerfano[] = candidatos
    .filter((p) => !yaEstan.has(String(p.id)))
    .map((p) => ({
      id: String(p.id),
      monto: p.transaction_amount ?? 0,
      email: p.payer?.email ?? null,
      fecha: p.date_approved ?? p.date_created ?? "",
    }));

  if (huerfanos.length === 0) {
    return { estado: "ok", revisados: candidatos.length, huerfanos: [], aviso: "no-hizo-falta" };
  }

  const aviso = await avisar(huerfanos, candidatos.length);
  return { estado: "ok", revisados: candidatos.length, huerfanos, aviso };
}

/**
 * El mail de alerta.
 *
 * Se re-manda en cada corrida mientras el pago siga sin aparecer, y eso es
 * deliberado: son casos rarisimos y cada uno es un cliente que pago y no tiene
 * lo que compro. Silenciarlo con una tabla de "ya avise" agrega estado que
 * puede fallar justo cuando importa, y el costo de insistir es un mail.
 */
async function avisar(
  huerfanos: PagoHuerfano[],
  revisados: number
): Promise<"enviado" | "fallo"> {
  const total = huerfanos.reduce((acc, h) => acc + h.monto, 0);

  const filas = huerfanos
    .map(
      (h) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-family:monospace;font-size:13px">${h.id}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600">${formatearPesos(h.monto)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px">${h.email ?? "—"}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">${h.fecha.slice(0, 16).replace("T", " ")}</td>
      </tr>`
    )
    .join("");

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:40px 20px;background:#ffffff">
      <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px 20px;border-radius:4px;margin-bottom:24px">
        <div style="font-size:18px;font-weight:700;color:#991b1b">
          ${huerfanos.length} pago${huerfanos.length === 1 ? "" : "s"} cobrado${huerfanos.length === 1 ? "" : "s"} sin acreditar
        </div>
        <div style="font-size:14px;color:#7f1d1d;margin-top:4px">${formatearPesos(total)} en total</div>
      </div>
      <p style="font-size:15px;color:#374151;line-height:1.6">
        Mercado Pago dice que estos pagos estan <strong>aprobados</strong>, pero no tienen
        fila en <code>purchases</code>. El cliente pago y no recibio sus creditos.
      </p>
      <table style="width:100%;border-collapse:collapse;margin:24px 0;font-size:14px">
        <thead>
          <tr style="text-align:left;color:#6b7280;font-size:12px;text-transform:uppercase">
            <th style="padding:8px 12px">Pago</th><th style="padding:8px 12px">Monto</th>
            <th style="padding:8px 12px">Cliente</th><th style="padding:8px 12px">Fecha</th>
          </tr>
        </thead>
        <tbody>${filas}</tbody>
      </table>
      <p style="font-size:14px;color:#374151;line-height:1.6">
        <strong>Que revisar:</strong> que el <code>notification_url</code> de la preferencia
        apunte a <code>${SITIO}</code> (el apex redirige 307 y MP no sigue redirects),
        que <code>MP_WEBHOOK_SECRET</code> coincida con el del panel de MP, y las entregas
        fallidas en el panel &rarr; Webhooks.
      </p>
      <p style="font-size:13px;color:#9ca3af;line-height:1.6;margin-top:32px">
        Revisados ${revisados} pagos aprobados de los ultimos ${DIAS_VENTANA} dias.
        Este aviso se repite en cada corrida hasta que el pago aparezca en la base.
      </p>
    </div>`;

  try {
    const { error } = await resend.emails.send({
      from: "Nichalo <hola@nichalo.com>",
      to: destinoAlerta(),
      subject: `⚠️ ${huerfanos.length} pago${huerfanos.length === 1 ? "" : "s"} sin acreditar (${formatearPesos(total)})`,
      html,
    });
    if (error) {
      console.error("[pagos-huerfanos] Resend devolvio error:", error);
      return "fallo";
    }
    return "enviado";
  } catch (err) {
    console.error("[pagos-huerfanos] error enviando alerta:", err);
    return "fallo";
  }
}

/**
 * Cada 3 horas. No es "cada 5 minutos" porque el webhook sano acredita en
 * segundos y esto es una red, no el camino principal; no es diario porque
 * entre que alguien paga y se entera de que no recibio nada no deberian pasar
 * 24 horas.
 */
export const cronPagosHuerfanos = inngest.createFunction(
  {
    id: "cron-pagos-huerfanos",
    triggers: [{ cron: "TZ=America/Argentina/Buenos_Aires 0 */3 * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    return await step.run("buscar-pagos-huerfanos", async () => await buscarPagosHuerfanos());
  }
);
