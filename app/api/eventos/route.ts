import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { ORIGENES_PACKS, registrarEvento } from "@/lib/eventos-embudo";

export const dynamic = "force-dynamic";

/**
 * Eventos del embudo que solo ve el navegador (TAB 3.8):
 *   - vio_packs      origen = resultado | dashboard | analizar
 *   - click_comprar  origen = pack_3 | pack_10
 *
 * Lista blanca cerrada: el cliente no puede inventar eventos ni origenes.
 * Sin sesion no se registra nada (el embudo es de usuarios registrados).
 * Siempre responde 204: un fallo de medicion nunca le rompe nada al usuario.
 */
const PERMITIDOS: Record<string, readonly string[]> = {
  vio_packs: ORIGENES_PACKS,
  click_comprar: ["pack_3", "pack_10"],
};

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const evento = typeof body?.evento === "string" ? body.evento : "";
    const origen = typeof body?.origen === "string" ? body.origen : "";
    if (!PERMITIDOS[evento]?.includes(origen)) {
      return new NextResponse(null, { status: 204 });
    }

    const supabase = createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await registrarEvento(user.id, evento as "vio_packs" | "click_comprar", origen);
    }
  } catch (err) {
    console.error("[api/eventos]", err);
  }
  return new NextResponse(null, { status: 204 });
}
