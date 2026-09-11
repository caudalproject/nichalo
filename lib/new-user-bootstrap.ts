import type { User } from "@supabase/supabase-js";
import { sendWelcomeEmail } from "@/lib/resend";
import { createSupabaseServiceClient } from "@/lib/supabase-service";
import { computeFingerprintHash, getClientIp } from "@/lib/fingerprint";
import { normalizeEmail } from "@/lib/normalize-email";

const CLAIM_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias

interface CookieReader {
  get(name: string): { value: string } | undefined;
}

/**
 * Se comparte entre app/auth/callback (flujo Google/PKCE, instantaneo) y
 * app/api/auth/post-login (flujo OTP de 6 digitos, con la demora de recibir
 * y tipear el mail). Antes esto se gateaba con "creado hace menos de 10s",
 * que en OTP casi siempre da falso por la demora del mail. Ahora se gatea
 * con un UPDATE atomico condicional: solo la llamada que efectivamente pasa
 * de false a true "gana" y corre el bootstrap — sea cual sea el tiempo
 * transcurrido, y sin importar cuantas veces se llame despues.
 *
 * Devuelve ranFirstTime = false para cualquier login que no sea el primero.
 */
export async function bootstrapNewUser(
  user: User,
  headers: Headers,
  cookies: CookieReader
): Promise<{ ranFirstTime: boolean; sinCredito: boolean }> {
  const service = createSupabaseServiceClient();

  const { data: claimed, error: claimErr } = await service
    .from("users")
    .update({ credit_bootstrap_done: true })
    .eq("id", user.id)
    .eq("credit_bootstrap_done", false)
    .select("id");

  if (claimErr) {
    console.error("[new-user-bootstrap] error reclamando el flag de bootstrap:", claimErr.message);
    return { ranFirstTime: false, sinCredito: false };
  }

  const ranFirstTime = (claimed?.length ?? 0) > 0;
  if (!ranFirstTime || !user.email) {
    return { ranFirstTime, sinCredito: false };
  }

  const nombre =
    user.user_metadata?.full_name ??
    user.user_metadata?.name ??
    user.email.split("@")[0];
  sendWelcomeEmail(user.email, nombre).catch((err) => {
    console.error("[new-user-bootstrap] error enviando welcome email:", err);
  });

  let sinCredito = false;

  try {
    const ip = getClientIp(headers);
    const userAgent = headers.get("user-agent") ?? "";
    const deviceKey = `fp:${computeFingerprintHash(ip, userAgent)}`;
    const emailKey = `email:${normalizeEmail(user.email)}`;

    const { data: existingClaims, error: claimsErr } = await service
      .from("free_credit_claims")
      .select("fingerprint_hash, created_at")
      .in("fingerprint_hash", [deviceKey, emailKey]);

    if (claimsErr) throw claimsErr;

    const cutoff = Date.now() - CLAIM_WINDOW_MS;
    const recentClaim = (existingClaims ?? []).find(
      (c) => new Date(c.created_at).getTime() > cutoff
    );

    if (recentClaim) {
      // Mismo dispositivo/red o mismo alias de Gmail ya reclamo el credito
      // gratis hace menos de 30 dias. No se otorga.
      sinCredito = true;
    } else {
      // Sin colision reciente: otorgar credito y (re)registrar los claims.
      // upsert pisa claims viejos (>30 dias) — una IP compartida no queda
      // baneada para siempre.
      const nowIso = new Date().toISOString();
      const { error: upsertClaimErr } = await service
        .from("free_credit_claims")
        .upsert(
          [
            { fingerprint_hash: deviceKey, user_id: user.id, created_at: nowIso },
            { fingerprint_hash: emailKey, user_id: user.id, created_at: nowIso },
          ],
          { onConflict: "fingerprint_hash" }
        );
      if (upsertClaimErr) throw upsertClaimErr;

      const { error: creditErr } = await service
        .from("users")
        .update({ analisis_restantes: 1 })
        .eq("id", user.id);
      if (creditErr) throw creditErr;
    }
  } catch (err) {
    // Ante la duda, que entre: el costo de un falso negativo es un analisis;
    // el de un falso positivo es un usuario perdido.
    console.error("[new-user-bootstrap] fallback: se otorga credito por error en anti-fraude:", err);
    sinCredito = false;
    await service.from("users").update({ analisis_restantes: 1 }).eq("id", user.id);
  }

  // Atribucion de campana: persistir los UTM de la cookie de la landing.
  const utmSource = cookies.get("utm_source")?.value;
  const utmContent = cookies.get("utm_content")?.value;
  if (utmSource || utmContent) {
    await service
      .from("users")
      .update({
        ...(utmSource ? { utm_source: utmSource } : {}),
        ...(utmContent ? { utm_content: utmContent } : {}),
      })
      .eq("id", user.id);
  }

  return { ranFirstTime, sinCredito };
}
