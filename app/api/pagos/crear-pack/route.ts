import { NextResponse } from "next/server";
import { Preference } from "mercadopago";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { mp, PACKS } from "@/lib/mercadopago";

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { pack } = await req.json();
  const packConfig = PACKS[pack as keyof typeof PACKS];

  if (!packConfig) {
    return NextResponse.json({ error: "Pack inválido" }, { status: 400 });
  }

  if (!user.email) {
    return NextResponse.json({ error: "El usuario no tiene email configurado" }, { status: 400 });
  }

  try {
    const preference = new Preference(mp);
    const externalRef = `${user.id}|${packConfig.pack}`;
    const siteUrl = process.env.SITE_URL ?? "";
    // auto_return requiere back_urls https — en local (sandbox sin túnel)
    // se omite para no romper la creación de la preferencia.
    const isLocalUrl = siteUrl.startsWith("http://localhost");

    const pref = await preference.create({
      body: {
        items: [
          {
            id: packConfig.pack,
            title: packConfig.nombre,
            quantity: 1,
            unit_price: packConfig.precio,
            currency_id: "ARS",
          },
        ],
        payer: { email: user.email },
        external_reference: externalRef,
        metadata: { user_id: user.id, pack: packConfig.pack },
        back_urls: {
          success: `${siteUrl}/dashboard?compra=exitosa`,
          pending: `${siteUrl}/dashboard?compra=pendiente`,
          failure: `${siteUrl}/dashboard?compra=fallida`,
        },
        // Explícito y no solo confiado al tópico "Pagos" tildado a mano en
        // el panel de MP (Webhooks) — si alguien lo destilda, esta compra
        // igual notifica. Debe apuntar a la URL con www. (nichalo.com sin
        // www. redirige 307 y MP no sigue redirects en las notificaciones).
        ...(isLocalUrl ? {} : { notification_url: `${siteUrl}/api/pagos/webhook` }),
        ...(isLocalUrl ? {} : { auto_return: "approved" as const }),
      },
    });

    const initPoint =
      pref.init_point ?? (pref as unknown as { sandbox_init_point?: string }).sandbox_init_point;

    if (!initPoint) {
      console.error("[crear-pack] MP no devolvió init_point:", pref);
      return NextResponse.json({ error: "Error al crear preferencia" }, { status: 500 });
    }

    return NextResponse.json({ init_point: initPoint });
  } catch (err) {
    console.error("[crear-pack] error:", err);
    return NextResponse.json({ error: "Error al crear preferencia" }, { status: 500 });
  }
}
