import type { Plan } from "./supabase";

export interface PlanConfig {
  maxItems: number;
  maxPagesPerQuery: number;
  /**
   * OJO CON EL NOMBRE: solo es "por mes" en Pro. El unico refill que existe es
   * la funcion SQL `refrescar_ciclo_pro`, que tiene `and plan = 'pro'` adentro
   * — el free NO se recarga nunca. Para el free este numero es el credito
   * unico de bienvenida, de por vida. La landing ya lo dice bien ("1 analisis
   * de cortesia, sin recarga automatica"); el que miente es este campo.
   * Medido el 21/9 (TAB 6): 13 usuarios externos llevan meses en 0 creditos y
   * no existe ningun camino por el que vuelvan sin pagar.
   */
  analisisPorMes: number;
  allowImage: boolean;
  /** Nichos simultaneos en la watchlist del TAB 5. */
  nichosVigilados: number;
  /** Re-chequeos totales por mes calendario, sumando todos los nichos. */
  rechequeosPorMes: number;
}

/**
 * 30 publicaciones para todos los tiers.
 *
 * CORRECCION 16/9 (tarde): el 16/9 a la mañana se unifico en 50 razonando desde
 * el cap del prompt. Estaba mal: el TAB 4 del 13/9 ya habia MEDIDO 30 vs 50 vs
 * 100 sobre un mismo scrape guardado a disco, y 50 no es mejor que 30 — en
 * "auriculares bluetooth" la media de 50 (37,5) salio por debajo de la de 30
 * (41,3). El ruido del score dentro de un mismo tier llega a 45 puntos, asi que
 * la diferencia de 6 puntos entre tiers no se distingue del azar del modelo.
 * 50 costaba 67% mas ($163 contra $102 ARS) sin beneficio medible.
 *
 * Ver `Negocios/Nichalo/AI-Sessions/2026-09-13-tab4-arquitectura-producto.md`,
 * seccion 2, y su addendum (paso 5 del orden de ejecucion).
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
 * El free sigue siendo desproporcionadamente bueno, pero por lo que de verdad
 * cambia el resultado: secciones completas, confianza medida y reintento sin
 * cargo. No por un numero de publicaciones que no mueve el veredicto.
 */
/**
 * TOPES DEL SEGUIMIENTO (decision del TAB 6, 21/9/2026).
 *
 * El TAB 5 dejo watchlist y re-chequeo desplegados SIN ningun tope por plan:
 * el unico freno era el cooldown de 6 h por nicho. Un usuario free podia
 * vigilar N nichos y re-chequear cada uno 4 veces por dia, a $119 ARS el
 * scrape. Con el video del 22/9 trayendo trafico eso es una factura abierta,
 * asi que el tope se cierra aca y no en el TAB 5.1.
 *
 * Los numeros salen de la tabla de margen del TAB 5:
 * - Pro: 5 nichos x re-chequeo semanal = 20/mes = $2.389 ARS => 85,1% de
 *   margen sobre $16.000. Ademas "5 nichos, uno por semana cada uno" es una
 *   frase que describe exactamente lo que hace el producto, sin inventar nada.
 * - Free: 1 nicho y 1 re-chequeo por mes ($119 ARS de techo por usuario). Es
 *   una probada: alcanza para ver el delta funcionando una vez, no para vivir
 *   del seguimiento gratis.
 * - Starter no se vende (se elimino como suscripcion el 12/9); queda coherente
 *   por si el enum vuelve a usarse.
 */
export const PLAN_CONFIG: Record<Plan, PlanConfig> = {
  free:    { maxItems: 30, maxPagesPerQuery: 1, analisisPorMes: 1,  allowImage: true, nichosVigilados: 1, rechequeosPorMes: 1  },
  starter: { maxItems: 30, maxPagesPerQuery: 1, analisisPorMes: 10, allowImage: true, nichosVigilados: 3, rechequeosPorMes: 6  },
  pro:     { maxItems: 30, maxPagesPerQuery: 1, analisisPorMes: 30, allowImage: true, nichosVigilados: 5, rechequeosPorMes: 20 },
};
