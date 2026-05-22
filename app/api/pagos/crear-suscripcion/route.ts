import { NextResponse } from "next/server";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { PLANES } from "@/lib/mercadopago";

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

  const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
  const preApproval = new PreApproval(mp);

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
      external_reference: `${user.id}|${plan}`,
    },
  });

  return NextResponse.json({ init_point: suscripcion.init_point });
}
