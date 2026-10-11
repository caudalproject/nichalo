import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { CAMPANAS_MAIL, registrarEvento } from "@/lib/eventos-embudo";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Click del boton de un mail (TAB 3.8). Identifica al usuario por su
 * `baja_token` — no hace falta sesion, que es justo lo que falta cuando
 * alguien abre el mail en el celular — anota `mail_click` y redirige.
 *
 * El destino es fijo (/analizar), no viene en la URL: sin open redirect.
 * /analizar sin creditos muestra los packs con el producto del usuario; sin
 * sesion, el middleware lo manda a /login y vuelve con el destino intacto.
 *
 * Limite conocido: un escaner de links del proveedor de mail cuenta como click.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t") ?? "";
  const campana = url.searchParams.get("c") ?? "";

  const destino = new URL("/analizar", url.origin);
  if ((CAMPANAS_MAIL as readonly string[]).includes(campana)) {
    destino.searchParams.set("utm_source", "mail");
    destino.searchParams.set("utm_campaign", campana);

    if (UUID.test(token)) {
      try {
        const sb = createSupabaseServiceClient();
        const { data: u } = await sb
          .from("users")
          .select("id")
          .eq("baja_token", token)
          .maybeSingle();
        if (u) await registrarEvento(u.id, "mail_click", campana);
      } catch (err) {
        console.error("[api/mail/click]", err);
      }
    }
  }

  return NextResponse.redirect(destino, 302);
}
