import { NextResponse } from "next/server";
import { Preference } from "mercadopago";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { mp, PACKS } from "@/lib/mercadopago";
import { SITIO } from "@/lib/sitio";

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
    // 25/9/2026: esto leia `process.env.SITE_URL`, que valia el apex
    // `https://nichalo.com`. El apex redirige 307 a `www` y MP NO sigue
    // redirects en las notificaciones, asi que el `notification_url` de abajo
    // apuntaba a una redireccion y el webhook nunca corria: la primera compra
    // organica (Pack 3, $4.500) se cobro sin acreditar un solo credito.
    // Ahora sale de lib/sitio.ts, que es la unica definicion de la URL
    // canonica y no se puede desconfigurar desde un panel.
    const siteUrl = process.env.SITE_URL ?? SITIO;
    const isLocalUrl = siteUrl.startsWith("http://localhost");
    // auto_return requiere back_urls https — en local (sandbox sin tunel) se
    // omite para no romper la creacion de la preferencia.
    const urlBase = isLocalUrl ? siteUrl : SITIO;

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
          success: `${urlBase}/dashboard?compra=exitosa`,
          pending: `${urlBase}/dashboard?compra=pendiente`,
          failure: `${urlBase}/dashboard?compra=fallida`,
        },
        // Explicito y no solo confiado al topico "Pagos" tildado a mano en
        // el panel de MP (Webhooks) — si alguien lo destilda, esta compra
        // igual notifica. Usa SITIO (con www) por lo explicado arriba.
        ...(isLocalUrl ? {} : { notification_url: `${SITIO}/api/pagos/webhook` }),
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
