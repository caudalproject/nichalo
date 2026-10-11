import { createSupabaseServiceClient } from "@/lib/supabase-service";

/**
 * Eventos del embudo de conversion (TAB 3.8, 11/10/2026).
 *
 * Tabla `eventos_embudo`, una fila por usuario + evento + origen. La UNIQUE
 * hace dos trabajos: el embudo cuenta a cada usuario una sola vez, y los
 * mails usan el insert como candado (se anota ANTES de mandar; si la fila ya
 * existia, no se manda).
 *
 * Lectura: `select * from v_embudo;` en el SQL editor de Supabase.
 */
export type EventoEmbudo =
  | "vio_packs"
  | "click_comprar"
  | "mail_seguimiento"
  | "mail_click"
  | "mail_upsell";

/** Pantallas donde se muestra la oferta de packs. */
export const ORIGENES_PACKS = ["resultado", "dashboard", "analizar"] as const;
export type OrigenPacks = (typeof ORIGENES_PACKS)[number];

/** Campañas de mail con link medido. */
export const CAMPANAS_MAIL = ["seguimiento_24h"] as const;

/**
 * Inserta el evento si no existia. Devuelve true solo si esta llamada lo
 * creo — false si ya estaba o si fallo (el que llama decide que hacer).
 */
export async function registrarEvento(
  userId: string,
  evento: EventoEmbudo,
  origen = ""
): Promise<boolean> {
  const sb = createSupabaseServiceClient();
  const { data, error } = await sb
    .from("eventos_embudo")
    .upsert(
      { user_id: userId, evento, origen },
      { onConflict: "user_id,evento,origen", ignoreDuplicates: true }
    )
    .select("id");
  if (error) {
    console.error(`[eventos-embudo] ${evento}/${origen}:`, error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

/** Deshace un evento — solo para liberar el candado de un mail que no salio. */
export async function borrarEvento(userId: string, evento: EventoEmbudo, origen = "") {
  const sb = createSupabaseServiceClient();
  await sb
    .from("eventos_embudo")
    .delete()
    .eq("user_id", userId)
    .eq("evento", evento)
    .eq("origen", origen);
}
