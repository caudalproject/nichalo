import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { MercadoPagoConfig, PreApproval, Payment } from "mercadopago";
import { createClient } from "@supabase/supabase-js";
import { PLANES, PACKS } from "@/lib/mercadopago";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function verifyMPSignature(req: Request, body: unknown, dataId: string): boolean {
  const webhookSecret = process.env.MP_WEBHOOK_SECRET;
  if (!webhookSecret) return false;

  const xSignature = req.headers.get("x-signature");
  const xRequestId = req.headers.get("x-request-id");

  if (!xSignature || !xRequestId) return false;

  const parts = xSignature.split(",");
  const ts = parts.find((p) => p.startsWith("ts="))?.split("=")[1];
  const v1 = parts.find((p) => p.startsWith("v1="))?.split("=")[1];

  if (!ts || !v1) return false;

  // Rechazar requests de más de 5 minutos
  const tsNum = parseInt(ts, 10);
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - tsNum) > 300) return false;

  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
  const hash = createHmac("sha256", webhookSecret).update(manifest).digest("hex");

  const hashBuffer = Buffer.from(hash, "hex");
  const v1Buffer = Buffer.from(v1, "hex");
  if (hashBuffer.length !== v1Buffer.length) return false;
  return require("crypto").timingSafeEqual(hashBuffer, v1Buffer);
}

export async function POST(req: Request) {
  const body = await req.json();

  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id") ??
                 url.searchParams.get("id") ??
                 (body as { data?: { id?: string } })?.data?.id ?? "";

  if (!verifyMPSignature(req, body, dataId)) {
    console.error("[webhook] firma inválida — request rechazado");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // MP manda "subscription_preapproval" en la notificación real de
  // preapproval (no "preapproval" a secas, como se supuso originalmente).
  // Sin este tipo reconocido, ninguna alta/baja de suscripción disparaba
  // nada — nunca se notó porque hasta ahora hubo cero suscripciones pagas.
  const SUBSCRIPTION_TYPES = [
    "preapproval",
    "subscription_preapproval",
    "subscription_authorized_payment",
  ];

  if (body.type === "payment") {
    return await manejarPagoDePack(body.data.id);
  }

  if (!SUBSCRIPTION_TYPES.includes(body.type)) {
    return NextResponse.json({ ok: true });
  }

  try {
    const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
    const preApproval = new PreApproval(mp);

    const suscripcion = await preApproval.get({ id: body.data.id });

    if (suscripcion.status === "authorized") {
      const [user_id, plan] = (suscripcion.external_reference ?? "").split("|");
      const planConfig = PLANES[plan as keyof typeof PLANES];

      if (user_id && planConfig) {
        // Solo actualizar si el plan cambió — evita resetear créditos en duplicados
        const { data: currentUser } = await supabase
          .from("users")
          .select("plan")
          .eq("id", user_id)
          .single();

        if (currentUser?.plan !== planConfig.plan) {
          const { error } = await supabase
            .from("users")
            .update({
              plan: planConfig.plan,
              analisis_restantes: planConfig.analisis,
            })
            .eq("id", user_id);

          if (error) {
            console.error("[webhook] error actualizando usuario:", error.message);
            return NextResponse.json({ error: "DB error" }, { status: 500 });
          }
        }
      }
    }

    // Manejar renovaciones mensuales
    if (body.type === "subscription_authorized_payment" && suscripcion.status === "authorized") {
      const [user_id, plan] = (suscripcion.external_reference ?? "").split("|");
      const planConfig = PLANES[plan as keyof typeof PLANES];
      if (user_id && planConfig) {
        await supabase
          .from("users")
          .update({ analisis_restantes: planConfig.analisis })
          .eq("id", user_id);
      }
    }

    if (suscripcion.status === "cancelled" || suscripcion.status === "paused") {
      const [user_id] = (suscripcion.external_reference ?? "").split("|");
      if (user_id) {
        await supabase
          .from("users")
          .update({ plan: "free" })
          .eq("id", user_id);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] error procesando webhook:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

// Pago único de un pack de créditos (Checkout Pro). Los packs NO tocan el
// plan del usuario, solo suman a analisis_restantes.
async function manejarPagoDePack(paymentId: string) {
  try {
    const mp = new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN! });
    const paymentClient = new Payment(mp);

    // Nunca confiar en el body del webhook: se consulta el pago contra la
    // API de MP antes de otorgar nada.
    const pago = await paymentClient.get({ id: paymentId });

    if (pago.status !== "approved") {
      // pending, rejected, in_process, etc. — no se otorga nada. Si más
      // tarde pasa a approved, MP manda una notificación nueva.
      return NextResponse.json({ ok: true });
    }

    const [user_id, pack] = (pago.external_reference ?? "").split("|");
    const packConfig = PACKS[pack as keyof typeof PACKS];

    if (!user_id || !packConfig || !pago.id) {
      console.error("[webhook] pago approved sin user_id/pack válido:", pago.external_reference);
      return NextResponse.json({ ok: true });
    }

    // Idempotencia: insertar primero. Si el unique de mp_payment_id choca
    // (23505), el pago ya fue procesado por un reintento anterior — no
    // sumar créditos de nuevo.
    const { error: insertError } = await supabase.from("purchases").insert({
      user_id,
      pack: packConfig.pack,
      monto_ars: packConfig.precio,
      mp_payment_id: String(pago.id),
      creditos_otorgados: packConfig.creditos,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        // Reintento de un webhook ya procesado — responder 200 sin duplicar créditos.
        return NextResponse.json({ ok: true });
      }
      console.error("[webhook] error insertando purchase:", insertError.message);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    // Incremento atómico — evita el race condition de leer y escribir desde JS.
    const { error: rpcError } = await supabase.rpc("increment_analisis_restantes", {
      user_id_param: user_id,
      amount_param: packConfig.creditos,
    });

    if (rpcError) {
      console.error("[webhook] error otorgando créditos del pack:", rpcError.message);
      return NextResponse.json({ error: "DB error" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[webhook] error procesando pago de pack:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
