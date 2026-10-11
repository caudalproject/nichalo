import { inngest } from "./inngest";
import { createSupabaseServiceClient } from "./supabase-service";
import { registrarEvento, borrarEvento } from "./eventos-embudo";
import { sendSeguimiento24hEmail } from "./resend";

/**
 * Mail unico de seguimiento a las 24-48 h del primer analisis (TAB 3.8, 11/10/2026).
 *
 * El problema que ataca: desde el video del 24/9, 22 analizaron y 1 compro.
 * El unico mail de upsell salia solo si el usuario VOLVIA y chocaba con el 402.
 * Si no volvia, nadie le hablaba.
 *
 * A quien: free, en 0 creditos, sin compras, sin baja, no interno, que nunca
 * lo recibio, con su primer analisis hace entre 24 y 48 h. La seleccion vive
 * en SQL: `candidatos_mail_seguimiento()` (migracion 20261011150000).
 *
 * Como se dispara sin cron pago: una funcion de Inngest cada 3 h, igual que
 * `cron-pagos-huerfanos` (ya corre gratis). No llama a Apify ni a Gemini: una
 * consulta y, como mucho, un mail por candidato. NO es el cron del TAB 5.1.
 *
 * "Uno solo" se garantiza en la base: el evento `mail_seguimiento` se inserta
 * ANTES de mandar (UNIQUE por usuario). Si Resend falla, se borra el evento y
 * el proximo turno lo reintenta — la ventana de 24 h da ~8 turnos.
 *
 * Interruptor: `MAIL_SEGUIMIENTO=off` en Vercel lo apaga sin deploy de codigo.
 */

const HORA = 3_600_000;
const LIMITE_POR_TURNO = 50;

/** Inicio del backfill: el video del 24/9/2026. */
const BACKFILL_DESDE_DEFAULT = "2026-09-24T03:00:00Z";

type Candidato = {
  user_id: string;
  email: string;
  baja_token: string;
  primer_analisis_at: string;
  analysis_id: string;
  producto: string;
  veredicto: string;
  score: number | null;
  analisis_at: string;
};

async function buscarCandidatos(desde: Date, hasta: Date, limite: number): Promise<Candidato[]> {
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb.rpc("candidatos_mail_seguimiento", {
    p_desde: desde.toISOString(),
    p_hasta: hasta.toISOString(),
    p_limite: limite,
  });
  if (error) throw new Error(`candidatos_mail_seguimiento: ${error.message}`);
  return (data ?? []) as Candidato[];
}

async function mandarUno(c: Candidato, origen: "ventana" | "backfill") {
  // Candado: si otra corrida ya lo anoto, no se manda.
  if (!(await registrarEvento(c.user_id, "mail_seguimiento", origen))) {
    return "ya_enviado_o_error_de_base";
  }
  const ok = await sendSeguimiento24hEmail({
    email: c.email,
    producto: c.producto,
    veredicto: c.veredicto,
    score: c.score,
    analysisId: c.analysis_id,
    analisisAt: c.analisis_at,
    bajaToken: c.baja_token,
  });
  if (!ok) {
    await borrarEvento(c.user_id, "mail_seguimiento", origen);
    return "fallo_resend";
  }
  return "enviado";
}

export const cronMailSeguimiento = inngest.createFunction(
  {
    id: "cron-mail-seguimiento-24h",
    // Minuto 30 para no coincidir con cron-pagos-huerfanos (minuto 0).
    triggers: [{ cron: "TZ=America/Argentina/Buenos_Aires 30 */3 * * *" }],
    retries: 1,
  },
  async ({ step }) => {
    if (process.env.MAIL_SEGUIMIENTO === "off") return { apagado: true };

    const candidatos = await step.run("buscar-candidatos", async () => {
      const ahora = Date.now();
      return buscarCandidatos(new Date(ahora - 48 * HORA), new Date(ahora - 24 * HORA), LIMITE_POR_TURNO);
    });

    const resultado: Record<string, number> = {};
    for (const c of candidatos) {
      const r = await step.run(`mail-${c.user_id}`, () => mandarUno(c, "ventana"));
      resultado[r] = (resultado[r] ?? 0) + 1;
    }
    return { candidatos: candidatos.length, ...resultado };
  }
);

/**
 * Envio unico a los que ya habian pasado la ventana cuando esto se desplego
 * (decision de JP, 11/10/2026: 18 usuarios). Se dispara a mano con el evento
 * `nichalo/mail-seguimiento.backfill`, data `{ dryRun?: boolean, desde?: ISO }`.
 * Solo toma primeros analisis de hace mas de 48 h: no se pisa con el cron.
 * Correrlo dos veces no duplica nada (mismo candado).
 */
export const backfillMailSeguimiento = inngest.createFunction(
  {
    id: "backfill-mail-seguimiento-24h",
    triggers: [{ event: "nichalo/mail-seguimiento.backfill" }],
    retries: 1,
  },
  async ({ event, step }) => {
    if (process.env.MAIL_SEGUIMIENTO === "off") return { apagado: true };
    const data = (event.data ?? {}) as { dryRun?: boolean; desde?: string };

    const candidatos = await step.run("buscar-candidatos", async () =>
      buscarCandidatos(
        new Date(data.desde ?? BACKFILL_DESDE_DEFAULT),
        new Date(Date.now() - 48 * HORA),
        LIMITE_POR_TURNO
      )
    );
    if (data.dryRun) {
      return { dryRun: true, candidatos: candidatos.length };
    }

    const resultado: Record<string, number> = {};
    for (const c of candidatos) {
      const r = await step.run(`mail-${c.user_id}`, () => mandarUno(c, "backfill"));
      resultado[r] = (resultado[r] ?? 0) + 1;
    }
    return { candidatos: candidatos.length, ...resultado };
  }
);
