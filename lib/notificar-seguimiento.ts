/**
 * TAB 5.1 — el envio del mail del nicho vigilado.
 *
 * La REGLA de cuando se manda vive en lib/regla-notificacion.ts, sin I/O y
 * probada en scripts/validar-notificacion.mjs. Aca esta lo que toca la base y
 * Resend, que es lo que no se puede probar sin credenciales.
 */

import { createClient } from "@supabase/supabase-js";
import { calcularDelta, type CorridaComparable } from "./delta";
import { decidirNotificacion, type Decision } from "./regla-notificacion";
import { filasDelMail } from "./regla-notificacion";
import { sendSeguimientoEmail } from "./resend";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const BASE_URL = process.env.SITE_URL ?? "https://nichalo.com";

export async function notificarSiCorresponde(
  runId: string,
  ahora: Date = new Date()
): Promise<Decision> {
  try {
    const { data: corrida } = await supabase
      .from("watch_runs")
      .select(
        "id, watchlist_id, fetched_at, n_listings, precio_stats, metricas, vendedores, score, formula, origen, status, notificado_at"
      )
      .eq("id", runId)
      .maybeSingle();

    if (!corrida || corrida.status !== "done") {
      return { notificar: false, motivo: "la corrida no termino bien" };
    }

    const { data: nicho } = await supabase
      .from("watchlist")
      .select("id, user_id, producto, created_at, activo")
      .eq("id", corrida.watchlist_id)
      .maybeSingle();

    if (!nicho || !nicho.activo) {
      return { notificar: false, motivo: "el nicho no existe o esta desactivado" };
    }

    // La medicion anterior COMPLETA. Las que fallaron no entran: comparar
    // contra una corrida sin datos daria "sin dato" en las once filas.
    const { data: previas } = await supabase
      .from("watch_runs")
      .select(
        "id, fetched_at, n_listings, precio_stats, metricas, vendedores, score, formula, origen, status, notificado_at"
      )
      .eq("watchlist_id", nicho.id)
      .eq("status", "done")
      .lt("fetched_at", corrida.fetched_at)
      .order("fetched_at", { ascending: false })
      .limit(1);

    const anterior = previas?.[0] ?? null;
    const delta = anterior
      ? calcularDelta(anterior as CorridaComparable, corrida as CorridaComparable)
      : null;

    const { data: ultimoAviso } = await supabase
      .from("watch_runs")
      .select("notificado_at")
      .eq("watchlist_id", nicho.id)
      .not("notificado_at", "is", null)
      .order("notificado_at", { ascending: false })
      .limit(1);

    const decision = decidirNotificacion({
      origen: corrida.origen,
      delta,
      ultimaNotificacionAt: ultimoAviso?.[0]?.notificado_at ?? null,
      vigiladoDesde: nicho.created_at,
      ahora,
    });

    if (!decision.notificar || !delta) return decision;

    const { data: usuario } = await supabase
      .from("users")
      .select("email")
      .eq("id", nicho.user_id)
      .maybeSingle();

    if (!usuario?.email) {
      return { notificar: false, motivo: "el usuario no tiene mail cargado" };
    }

    const enviado = await sendSeguimientoEmail({
      email: usuario.email,
      producto: nicho.producto,
      titular:
        decision.tipo === "resumen"
          ? `Tu producto sigue tranquilo`
          : delta.titular,
      tipo: decision.tipo,
      dias: delta.dias,
      filas: decision.tipo === "cambios" ? filasDelMail(delta) : [],
      vendedoresNuevos:
        decision.tipo === "cambios" && delta.vendedores?.material
          ? delta.vendedores.nuevos
          : [],
      productoUrl: `${BASE_URL}/seguimiento`,
    });

    // `notificado_at` se marca solo si Resend acepto el mail. Marcarlo igual
    // correria la referencia de los 28 dias sobre un mail que nunca salio.
    if (enviado) {
      await supabase
        .from("watch_runs")
        .update({ notificado_at: new Date().toISOString() })
        .eq("id", runId);
    }

    return enviado
      ? decision
      : { notificar: false, motivo: "Resend rechazo el mail" };
  } catch (err) {
    console.error("[seguimiento] no se pudo notificar:", err);
    return { notificar: false, motivo: "error inesperado al notificar" };
  }
}
