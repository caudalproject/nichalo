import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { MercadoPagoConfig, PreApproval } from "mercadopago";
import { createClient } from "@supabase/supabase-js";
import { PLANES } from "@/lib/mercadopago";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifyMPSignature(req: Request, body: unknown): boolean {
  const webhookSecret = process.env.MP_WEBHOOK_SECRET;
  if (!webhookSecret) return false;

  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");

  if (!xSignature || !xRequestId) return false;

  const parts = xSignature.split(",");
  const ts = parts.find((p) => p.startsWith("ts="))?.split("=")[1];
  const v1 = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

  if (!ts || !v1) return false;

  const dataId = (body as { data?: { id?: string } })?.data?.id ?? "";
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hash = createHmac("sha256", webhookSecret).update(manifest).digest("hex");

  return hash === v1;
}

export async function POST(req: Request) {
  const body = await req.json();

  if (!verifyMPSignature(req, body)) {
    console.error("[webhook] firma inválida — request rechazado");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
