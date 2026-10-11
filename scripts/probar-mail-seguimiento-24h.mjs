/**
 * Manda las dos variantes del mail de seguimiento 24 h (TAB 3.8) a una casilla
 * que ya tenga cuenta en Nichalo, con SU baja_token (los links de baja y de
 * click funcionan de verdad). No toca eventos_embudo: no consume el "uno solo".
 *
 *   1. SATURADO, analisis viejo (lleva el parrafo de "desde esta semana...")
 *   2. VIABLE, analisis de ayer
 *
 * Uso: npx tsx --env-file=.env.local scripts/probar-mail-seguimiento-24h.mjs tu@mail.com
 */
import { createClient } from "@supabase/supabase-js";

const destino = process.argv[2];
if (!destino) {
  console.error("Falta el mail destino.");
  process.exit(1);
}
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { data: u } = await sb.from("users").select("id, baja_token").eq("email", destino).limit(1).maybeSingle();
if (!u) {
  console.error("Ese mail no tiene cuenta en Nichalo.");
  process.exit(1);
}
const { data: a } = await sb.from("analyses").select("id").eq("user_id", u.id).order("created_at", { ascending: false }).limit(1).maybeSingle();

const { sendSeguimiento24hEmail } = await import("../lib/resend.ts");
const base = { email: destino, analysisId: a?.id ?? "00000000-0000-0000-0000-000000000000", bajaToken: u.baja_token };

const r1 = await sendSeguimiento24hEmail({ ...base, producto: "organizador de cables", veredicto: "SATURADO", score: 31, analisisAt: "2026-09-28T15:00:00Z" });
const r2 = await sendSeguimiento24hEmail({ ...base, producto: "auriculares bluetooth", veredicto: "VIABLE", score: 74, analisisAt: new Date(Date.now() - 30 * 3600_000).toISOString() });
console.log({ saturado_viejo: r1, viable_ayer: r2, destino: destino.replace(/^(.{3}).*@/, "$1***@") });
