/**
 * TAB 5.1 — el cron semanal del seguimiento.
 *
 * ESTE ARCHIVO NACE APAGADO, A PROPOSITO.
 *
 * Cada corrida paga un scrape de Apify (~$119 ARS) POR NICHO VIGILADO, se
 * mande mail o no. El propio brief del tab lo dice: encenderlo sin tope es una
 * factura abierta. El tope ya existe desde el TAB 6 (`rechequeosPorMes` en
 * lib/plans.ts), pero un tope por plan no protege de un bug en el cron mismo,
 * asi que hay tres frenos encadenados y ninguno depende de los otros:
 *
 *   1. `SEGUIMIENTO_CRON` — sin la variable, el cron corre y no hace nada.
 *      Tres valores: `off` (default), `prueba` (solo los mails de
 *      `SEGUIMIENTO_CRON_EMAILS`) y `on`.
 *   2. El cupo mensual por plan, contado por lib/cupo-seguimiento.ts — el mismo
 *      contador que usa el boton manual, para que las dos vias no se pisen.
 *   3. `SEGUIMIENTO_CRON_MAX` — techo duro de nichos por corrida. Es la red
 *      contra un bug de los otros dos: pase lo que pase, una corrida no puede
 *      costar mas que este numero por $119 ARS.
 *
 * Ademas no re-mide un nicho medido hace menos de 6 dias: si el usuario apreto
 * el boton manual ayer, el cron no vuelve a pagar el scrape hoy.
 */

import { createClient } from "@supabase/supabase-js";
import { inngest } from "./inngest";
import { cupoDeRechequeos } from "./cupo-seguimiento";
import type { Plan } from "./supabase";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type ModoCron = "off" | "prueba" | "on";

export function modoCron(): ModoCron {
  const v = (process.env.SEGUIMIENTO_CRON ?? "off").trim().toLowerCase();
  return v === "on" || v === "prueba" ? v : "off";
}

function mailsDePrueba(): string[] {
  return (process.env.SEGUIMIENTO_CRON_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/** Techo duro de scrapes por corrida. 25 x $119 = ~$2.975 ARS de piso maximo. */
const MAX_POR_CORRIDA = Number(process.env.SEGUIMIENTO_CRON_MAX ?? 25);

/** Cuantas filas de watchlist se miran. Mas que esto y la corrida no entra en
 *  el cupo de nadie igual; existe para no traer una tabla entera a memoria. */
const MAX_CANDIDATOS = 500;

/**
 * No re-medir un nicho medido hace menos de esto. Son 6 y no 7 para que una
 * cadencia semanal no se saltee sola por unos minutos de corrimiento.
 *
 * Es configurable SOLO para poder verificar el mail: el aviso necesita DOS
 * mediciones (sin anterior no hay delta y no se manda nada), y con 6 dias fijos
 * la primera prueba end-to-end tardaria una semana. Bajarlo NO destraba ningun
 * gasto extra — el cupo mensual por plan y `SEGUIMIENTO_CRON_MAX` siguen
 * mandando — pero deja de proteger contra re-medir algo que el usuario ya
 * midio a mano. Se vuelve a 6 apenas termina la prueba.
 */
const DIAS_MIN_ENTRE_MEDICIONES = Number(process.env.SEGUIMIENTO_CRON_DIAS_MIN ?? 6);

interface NichoCandidato {
  id: string;
  user_id: string;
  producto: string;
  pais: "AR" | "MX" | "CO";
  search_keyword: string | null;
  perfil_vendedor: string | null;
  costo_estimado: number | null;
  last_check_at: string | null;
}

export interface ResultadoCorrida {
  modo: ModoCron;
  candidatos: number;
  encolados: number;
  salteados: Record<string, number>;
}

/**
 * Elige los nichos, inserta la corrida y manda el evento — todo en el mismo
 * paso, y en ese orden, por idempotencia: el indice unico parcial
 * `watch_runs_una_en_vuelo` hace que un reintento del paso choque con 23505 en
 * los nichos que ya se encolaron y los saltee. Sin eso, un reintento pagaria
 * los scrapes dos veces.
 */
export async function elegirYEncolar(ahora: Date = new Date()): Promise<ResultadoCorrida> {
  const modo = modoCron();
  const salteados: Record<string, number> = {};
  const saltear = (k: string) => {
    salteados[k] = (salteados[k] ?? 0) + 1;
  };

  if (modo === "off") {
    return { modo, candidatos: 0, encolados: 0, salteados: {} };
  }

  const { data: nichos } = await supabase
    .from("watchlist")
    .select(
      "id, user_id, producto, pais, search_keyword, perfil_vendedor, costo_estimado, last_check_at"
    )
    .eq("activo", true)
    .order("last_check_at", { ascending: true, nullsFirst: true })
    .limit(MAX_CANDIDATOS);

  const candidatos = (nichos ?? []) as NichoCandidato[];
  if (candidatos.length === 0) {
    return { modo, candidatos: 0, encolados: 0, salteados };
  }

  const ids = Array.from(new Set(candidatos.map((n) => n.user_id)));
  const { data: usuarios } = await supabase
    .from("users")
    .select("id, email, plan")
    .in("id", ids);

  const porUsuario = new Map(
    (usuarios ?? []).map((u: { id: string; email: string; plan: Plan }) => [u.id, u])
  );

  const permitidos = mailsDePrueba();
  const limiteMs = DIAS_MIN_ENTRE_MEDICIONES * 86_400_000;

  // Cupo restante por usuario, resuelto una vez. Se descuenta en memoria a
  // medida que se encolan nichos del mismo usuario en esta misma corrida.
  const restantePorUsuario = new Map<string, number>();
  let encolados = 0;

  for (const nicho of candidatos) {
    if (encolados >= MAX_POR_CORRIDA) {
      saltear("techo_de_corrida");
      continue;
    }

    const usuario = porUsuario.get(nicho.user_id);
    if (!usuario?.email) {
      saltear("usuario_sin_ficha");
      continue;
    }

    if (modo === "prueba" && !permitidos.includes(usuario.email.toLowerCase())) {
      saltear("fuera_de_la_lista_de_prueba");
      continue;
    }

    if (
      nicho.last_check_at &&
      ahora.getTime() - new Date(nicho.last_check_at).getTime() < limiteMs
    ) {
      saltear("medido_hace_menos_de_6_dias");
      continue;
    }

    if (!restantePorUsuario.has(nicho.user_id)) {
      const cupo = await cupoDeRechequeos(supabase, nicho.user_id, usuario.plan, ahora);
      restantePorUsuario.set(nicho.user_id, cupo.restante);
    }

    const restante = restantePorUsuario.get(nicho.user_id) ?? 0;
    if (restante <= 0) {
      saltear("sin_cupo_en_el_mes");
      continue;
    }

    const { data: run, error } = await supabase
      .from("watch_runs")
      .insert({ watchlist_id: nicho.id, origen: "cron", status: "pending" })
      .select("id")
      .single();

    if (error || !run) {
      // 23505 = ya hay una corrida en vuelo para ese nicho (o es el reintento
      // de este mismo paso). No es un error: es el freno funcionando.
      saltear(error?.code === "23505" ? "ya_tenia_una_corrida_en_vuelo" : "no_se_pudo_insertar");
      continue;
    }

    try {
      await inngest.send({
        name: "nichalo/seguimiento.rechequeo",
        data: {
          run_id: run.id,
          watchlist_id: nicho.id,
          producto: nicho.producto,
          pais: nicho.pais,
          search_keyword: nicho.search_keyword,
          perfil_vendedor: nicho.perfil_vendedor ?? "principiante",
          costo_estimado: nicho.costo_estimado,
        },
      });
    } catch (err) {
      // Si el evento no salio, la fila quedaria 'pending' para siempre y el
      // indice unico dejaria ese nicho trabado. Se marca error para liberarlo.
      await supabase
        .from("watch_runs")
        .update({
          status: "error",
          error_message: "No se pudo encolar el re-chequeo del cron.",
        })
        .eq("id", run.id);
      saltear("no_se_pudo_encolar");
      console.error("[cron-seguimiento] inngest.send fallo:", err);
      continue;
    }

    restantePorUsuario.set(nicho.user_id, restante - 1);
    encolados += 1;
  }

  return { modo, candidatos: candidatos.length, encolados, salteados };
}

/**
 * Lunes 9:00 de Buenos Aires. El vendedor mira el nicho cuando planifica la
 * semana, no el domingo a la noche.
 */
export const cronSeguimientoSemanal = inngest.createFunction(
  {
    id: "cron-seguimiento-semanal",
    triggers: [{ cron: "TZ=America/Argentina/Buenos_Aires 0 9 * * 1" }],
    retries: 1,
  },
  async ({ step }) => {
    return await step.run("elegir-y-encolar", async () => await elegirYEncolar());
  }
);
