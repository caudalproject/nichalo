/**
 * TAB 5.1 — la contabilidad del cupo de re-chequeos, en UN solo lugar.
 *
 * Por que existe este archivo en vez de un conteo adentro del cron:
 *
 * El plan de tabs ya pago dos veces el precio de la misma clase de bug — un
 * numero decidido en un lado y aplicado en otro. `refrescar_ciclo_pro` tiene el
 * 30 del Pro hardcodeado en SQL mientras `lib/plans.ts` dice lo suyo, y la
 * ficha del vault decia 50 publicaciones para los packs cuando el codigo
 * mandaba 30 (alguien pago $4.500 y recibio el scrape mas chico).
 *
 * Si el cron contara las corridas del mes por su cuenta, la divergencia seria
 * la misma y costaria plata de verdad: el usuario gasta su cupo a mano el
 * lunes y el cron le regala un scrape mas el martes, a $119 ARS cada uno. El
 * tope lo decidio el TAB 6; aca solo se cuenta, y se cuenta una vez.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { PLAN_CONFIG } from "./plans";
import type { Plan } from "./supabase";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Cliente = SupabaseClient<any, any, any>;

/** Mes calendario en UTC. El mismo corte que usa la ruta manual desde el 21/9:
 *  si el cron usara hora local y la ruta UTC, los dias 1 de cada mes habria
 *  usuarios con un re-chequeo de mas o de menos segun la hora. */
export function inicioDeMesUTC(ahora: Date = new Date()): Date {
  const d = new Date(ahora);
  d.setUTCDate(1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Corridas del mes de TODOS los nichos del usuario, manuales y del cron.
 *
 * Se cuentan tambien las que fallaron, a proposito: si el scrape ya salio,
 * Apify lo cobro igual. El cupo mide gasto, no exitos.
 */
export async function contarRechequeosDelMes(
  client: Cliente,
  userId: string,
  ahora: Date = new Date()
): Promise<number> {
  const { count } = await client
    .from("watch_runs")
    .select("id, watchlist!inner(user_id)", { count: "exact", head: true })
    .eq("watchlist.user_id", userId)
    .gte("fetched_at", inicioDeMesUTC(ahora).toISOString());

  return count ?? 0;
}

export interface Cupo {
  tope: number;
  usados: number;
  restante: number;
}

export async function cupoDeRechequeos(
  client: Cliente,
  userId: string,
  plan: Plan,
  ahora: Date = new Date()
): Promise<Cupo> {
  const tope = PLAN_CONFIG[plan].rechequeosPorMes;
  const usados = await contarRechequeosDelMes(client, userId, ahora);
  return { tope, usados, restante: Math.max(0, tope - usados) };
}
