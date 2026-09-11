import { createHmac } from "crypto";

/**
 * Fingerprint de dispositivo/red para el anti-fraude de creditos gratis.
 * Nunca persistir la IP cruda — solo este hash.
 *
 * Requiere runtime "nodejs" (usa el modulo `crypto` de Node).
 */
export function computeFingerprintHash(ip: string, userAgent: string): string {
  const secret = process.env.FINGERPRINT_SECRET;
  if (!secret) {
    throw new Error("FINGERPRINT_SECRET no esta configurado");
  }
  const payload = `${ip}|${userAgent.slice(0, 120)}`;
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Primer valor de x-forwarded-for, o "unknown" si no esta presente. */
export function getClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  return "unknown";
}
