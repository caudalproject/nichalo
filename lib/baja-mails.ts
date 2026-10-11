import { createSupabaseServiceClient } from "@/lib/supabase-service";

/**
 * Baja de mails de marketing (TAB 3.8, 11/10/2026).
 *
 * Que corta: el mail de seguimiento a las 24-48 h y el upsell del 402.
 * Que NO corta: "tu analisis esta listo" (transaccional: lo pidio el usuario)
 * ni los mails de productos seguidos (se cortan dejando de seguir el producto
 * en /seguimiento, como explica ese mismo mail).
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type EstadoBaja = { userId: string; email: string | null; yaDadoDeBaja: boolean };

export async function buscarPorToken(token: string | undefined | null): Promise<EstadoBaja | null> {
  if (!token || !UUID.test(token)) return null;
  const sb = createSupabaseServiceClient();
  const { data } = await sb
    .from("users")
    .select("id, email, mails_baja_at")
    .eq("baja_token", token)
    .maybeSingle();
  return data ? { userId: data.id, email: data.email, yaDadoDeBaja: !!data.mails_baja_at } : null;
}

export async function buscarPorId(userId: string): Promise<EstadoBaja | null> {
  const sb = createSupabaseServiceClient();
  const { data } = await sb
    .from("users")
    .select("id, email, mails_baja_at")
    .eq("id", userId)
    .maybeSingle();
  return data ? { userId: data.id, email: data.email, yaDadoDeBaja: !!data.mails_baja_at } : null;
}

/** Idempotente: si ya estaba de baja, conserva la fecha original. */
export async function darDeBaja(userId: string): Promise<boolean> {
  const sb = createSupabaseServiceClient();
  const { error } = await sb
    .from("users")
    .update({ mails_baja_at: new Date().toISOString() })
    .eq("id", userId)
    .is("mails_baja_at", null);
  if (error) {
    console.error("[baja-mails]", error.message);
    return false;
  }
  return true;
}

/** "jua***@gmail.com" — para confirmar de quien es la baja sin mostrar el mail entero. */
export function enmascarar(email: string | null): string {
  if (!email) return "tu cuenta";
  const [u, d] = email.split("@");
  if (!d) return "tu cuenta";
  return `${u.slice(0, 3)}***@${d}`;
}
