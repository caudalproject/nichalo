import { NextResponse } from "next/server";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { createClient } from "@supabase/supabase-js";
import { PLANES } from "@/lib/mercadopago";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  const body = await req.json();

  if (body.type !== "preapproval") {
    return NextResponse.json({ ok: true });
  }

  const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
  const preApproval = new PreApproval(mp);

  const suscripcion = await preApproval.get({ id: body.data.id });

  if (suscripcion.status === "authorized") {
    const [user_id, plan] = (suscripcion.external_reference ?? "").split("|");
    const planConfig = PLANES[plan as keyof typeof PLANES];

    if (user_id && planConfig) {
      await supabase
        .from("users")
        .update({
          plan: planConfig.plan,
          analisis_restantes: planConfig.analisis,
        })
        .eq("id", user_id);
    }
  }

  return NextResponse.json({ ok: true });
}
