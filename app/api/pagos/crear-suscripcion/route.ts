import { NextResponse } from "next/server";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { PLANES } from "@/lib/mercadopago";

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { plan } = await req.json();
  const planConfig = PLANES[plan as keyof typeof PLANES];

  if (!planConfig) {
    return NextResponse.json({ error: "Plan inválido" }, { status: 400 });
  }

  if (!user.email) {
    return NextResponse.json({ error: "El usuario no tiene email configurado" }, { status: 400 });
  }

  try {
    const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
    const preApproval = new PreApproval(mp);

    const externalRef = `${user.id}|${plan}`;
    const existing = await preApproval.search({
      options: { external_reference: externalRef },
    });
    const activeSub = existing.results?.find((s) => s.status === "authorized");
    if (activeSub?.init_point) {
      return NextResponse.json({ init_point: activeSub.init_point });
    }

    const suscripcion = await preApproval.create({
      body: {
        reason: planConfig.nombre,
        auto_recurring: {
          frequency: 1,
          frequency_type: "months",
          transaction_amount: planConfig.precio,
          currency_id: "ARS",
        },
        back_url: `${process.env.SITE_URL}/dashboard?pago=exitoso`,
        payer_email: user.email,
        external_reference: externalRef,
      },
    });

    const initPoint = suscripcion.init_point ?? suscripcion.sandbox_init_point;
    if (!initPoint) {
      console.error("[crear-suscripcion] MP no devolvió init_point:", suscripcion);
      return NextResponse.json({ error: "Error al crear suscripción" }, { status: 500 });
    }

    if (suscripcion.id) {
      await adminSupabase
        .from("users")
        .update({ mp_preapproval_id: suscripcion.id })
        .eq("id", user.id);
    }

    return NextResponse.json({ init_point: initPoint });
  } catch (err) {
    console.error("[crear-suscripcion] error:", err);
    return NextResponse.json({ error: "Error al crear suscripción" }, { status: 500 });
  }
}
