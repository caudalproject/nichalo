import type { Plan } from "./supabase";

export interface PlanConfig {
  maxItems: number;
  maxPagesPerQuery: number;
  analisisPorMes: number;
  allowImage: boolean;
}

/**
 * 50 publicaciones para todos los tiers (decision del 16/9).
 *
 * La profundidad del scrape dejo de ser la linea free/pago. Tres razones, en
 * orden de peso:
 *
 * 1. `lib/gemini.ts` capea el prompt en 50 publicaciones (`slice(0, 50)`). Las
 *    publicaciones 51 a 100 del viejo tier Pro NUNCA llegaban al modelo. Lo
 *    unico que hacian era ensanchar min/max y aumentar la probabilidad de
 *    disparar el warning de dispersion. No es una hipotesis: es el codigo.
 * 2. Apify cobra 0,002 USD por listing (medido sobre 11 runs reales, no
 *    estimado). 100 publicaciones costaban 0,20 USD contra 0,10 — el doble,
 *    por datos que empeoraban el veredicto. Esto BAJA el costo del Pro.
 * 3. El que compraba un pack corria igual con `plan: "free"` (los packs solo
 *    suman creditos_pack), asi que pagaba $4.500 y recibia el scrape mas
 *    chico. Unificar lo arregla de raiz en vez de con un caso especial.
 *
 * El salto que si cambiaba lo que Gemini lee era 30 -> 50. Ese se lo damos a
 * todos: el free tiene que ser desproporcionadamente bueno.
 *
 * maxPagesPerQuery queda en 2 para todos porque una sola pagina de ML no
 * siempre llega a 50 resultados. El costo esta capeado por maxItems, que es
 * lo que se cobra, asi que agregar la segunda pagina no encarece nada.
 */
export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  free:    { maxItems: 50, maxPagesPerQuery: 2, analisisPorMes: 1,  allowImage: true },
  starter: { maxItems: 50, maxPagesPerQuery: 2, analisisPorMes: 10, allowImage: true },
  pro:     { maxItems: 50, maxPagesPerQuery: 2, analisisPorMes: 30, allowImage: true },
};
