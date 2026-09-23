import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { inngest } from "@/lib/inngest";
import { extractKeywordsFromImage } from "@/lib/gemini";
import { sendUpsellEmail } from "@/lib/resend";
import type { Plan, AnalysisResult } from "@/lib/supabase";
import { FORMULA_VERSION } from "@/lib/score";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Bajado de 30 a 7 dias el 15/9/2026. Medido sobre la base antes de tocarlo:
// el cache pego 2 veces en 34 analisis historicos (6%), y las dos veces fue el
// mismo usuario repitiendo el mismo producto en menos de 24 h — cero hits entre
// usuarios distintos. O sea que la ventana de 30 dias no estaba ahorrando
// practicamente nada, y a cambio permitia servir datos de precios de hasta un
// mes de antiguedad en un mercado con inflacion mensual. 7 dias cubre el caso
// real que si ocurre (el usuario que reanaliza lo mismo en pocos dias) sin
// sostener precios viejos.
//
// El cache sigue siendo silencioso (regla dura del proyecto): esto no agrega
// ningun aviso al usuario, solo acorta la ventana.
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const DatosProSchema = z.object({
  origen_producto: z.string().nullable().optional(),
  presupuesto_inicial: z.number().nullable().optional(),
  tiene_variantes: z.string().nullable().optional(),
  detalle_variantes: z.string().nullable().optional(),
  canal_distribucion: z.string().nullable().optional(),
}).nullable().optional();

const BodySchema = z.object({
  producto: z.string().min(2).max(120),
  pais: z.enum(["AR", "MX", "CO"]),
  costoEstimado: z.number().positive().max(1_000_000),
  imagenBase64: z.string().optional(),
  imagenMimeType: z.string().optional(),
  perfilVendedor: z.enum(["principiante", "intermedio", "experto"]).default("principiante"),
  datos_pro: DatosProSchema,
  // Id del analisis de confianza baja que origina este reintento. Ver
  // `resolverReintentoGratis` mas abajo.
  reintento_de: z.string().uuid().optional(),
});

/**
 * Decide si este analisis es un reintento gratis.
 *
 * Regla (Capa 4 de la propuesta de confianza del 16/9): si el sistema le dijo
 * al usuario que sus datos eran poco confiables, no le cobramos el reintento.
 * Cobrarlo es el verdadero golpe a la credibilidad: le avisamos que el
 * resultado no servia y le descontamos un credito igual.
 *
 * Se valida TODO del lado del servidor y ninguna condicion sale del cliente:
 * el cliente solo manda un id.
 *
 * El "una sola vez por analisis" NO se hace cumplir aca sino con el indice
 * unico parcial `analyses_reintento_de_unico`. Este chequeo es solo para poder
 * dar un mensaje decente; la garantia real es la constraint, porque dos
 * requests simultaneos pasarian los dos por este if.
 */
async function esReintentoGratis(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  userId: string,
  reintentoDe: string | undefined
): Promise<boolean> {
  if (!reintentoDe) return false;

  const { data: origen } = await supabase
    .from("analyses")
    .select("id, user_id, resultado_json, created_at")
    .eq("id", reintentoDe)
    .eq("user_id", userId)
    .maybeSingle();

  if (!origen) return false;

  // Solo los de confianza baja dan derecho. "media" no: ahi el analisis sigue
  // siendo utilizable y regalar un credito por cada uno saldria carisimo — el
  // 62% de los analisis historicos tenia alguna senal.
  const resultado = origen.resultado_json as AnalysisResult | null;
  if (resultado?.confianza?.nivel !== "baja") return false;

  // Ventana de 7 dias. Sin limite temporal, un analisis malo de hace seis
  // meses seguiria dando un credito gratis para siempre.
  const edadMs = Date.now() - new Date(origen.created_at as string).getTime();
  if (edadMs > 7 * 24 * 60 * 60 * 1000) return false;

  const { count } = await supabase
    .from("analyses")
    .select("id", { count: "exact", head: true })
    .eq("reintento_de", reintentoDe);

  return (count ?? 0) === 0;
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 422 }
    );
  }
  const { producto, pais, costoEstimado, imagenBase64, imagenMimeType, perfilVendedor, datos_pro, reintento_de } = parsed.data;

  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Opción B (red de seguridad) del refill mensual de Pro: si pasó más de un
  // mes desde el último refill, se recarga acá antes de leer el perfil. No
  // hace nada si el usuario no es Pro o si todavía no corresponde — la
  // condición vive adentro de la función SQL, no acá, para que esto y el
  // webhook (Opción A) nunca puedan duplicar un refill.
  const { error: refillErr } = await supabase.rpc("refrescar_ciclo_pro", {
    user_id_param: user.id,
  });
  if (refillErr) {
    console.error("[analizar] error en refill lazy (no bloqueante):", refillErr.message);
  }

  const { data: profile, error: profileErr } = await supabase
    .from("users")
    .select("id, plan, creditos_ciclo, creditos_pack")
    .eq("id", user.id)
    .maybeSingle();

  if (profileErr) {
    return NextResponse.json(
      { error: "profile_lookup_failed", detail: profileErr.message },
      { status: 500 }
    );
  }

  let restantes = (profile?.creditos_ciclo ?? 0) + (profile?.creditos_pack ?? 0);
  if (!profile) {
    // No otorgar credito aca: el credito gratis solo lo otorga
    // app/auth/callback/route.ts, despues de pasar el chequeo anti-fraude de
    // multicuentas. Si no hay fila todavia (p. ej. se borro a mano), se crea
    // con el default de columna (0) y el usuario se choca con el paywall en
    // vez de regenerar un credito gratis borrando su perfil.
    const { error: insertErr } = await supabase.from("users").insert({
      id: user.id,
      email: user.email,
      plan: "free",
    });
    if (insertErr) {
      return NextResponse.json(
        { error: "profile_create_failed", detail: insertErr.message },
        { status: 500 }
      );
    }
    restantes = 0;
  }

  const reintentoGratis = await esReintentoGratis(supabase, user.id, reintento_de);

  // Un reintento por confianza baja no necesita credito: el analisis que lo
  // origina ya se cobro y no sirvio.
  if (restantes <= 0 && !reintentoGratis) {
    if (user.email) {
      await sendUpsellEmail(user.email);
    }
    return NextResponse.json({ error: "no_credits_left" }, { status: 402 });
  }

  const plan = (profile?.plan ?? "free") as Plan;

  try {
    // --- Cache lookup (only when no image) ---
    if (!imagenBase64) {
      const productoNorm = producto.trim().toLowerCase();
      const cutoff = new Date(Date.now() - CACHE_TTL_MS).toISOString();

      const { data: cached } = await supabase
        .from("analysis_cache")
        .select("resultado_json, publicaciones_analizadas, created_at")
        .eq("producto", productoNorm)
        .eq("pais", pais)
        .eq("perfil_vendedor", perfilVendedor ?? "principiante")
        // El costo entra en la busqueda porque entra en el resultado: margen,
        // ganancia, costo_evaluacion y la senal de confianza costo_fuera_de_rango
        // se calcularon con el costo de quien corrio el analisis original.
        .eq("costo_estimado", costoEstimado)
        .gte("created_at", cutoff)
        .maybeSingle();

      // TAB 3.2 (22/9) — EL CACHE NO PUEDE CRUZAR VERSIONES DE FORMULA.
      //
      // La clave del cache es producto + pais + perfil + costo, y NO incluye la
      // version de formula. Cada vez que el score cambia, el cache sigue
      // sirviendo el resultado viejo con total confianza: paso el 20/9 (v1) y
      // otra vez el 21/9 (v1.1), y las dos veces se resolvio purgando filas a
      // mano. El plan de tabs dejo escrito que a la tercera se arreglaba en la
      // lectura. Esta es la tercera: la v1.2 cambia el score de todo producto
      // que se venda por pack, y sin esto un usuario pediria un analisis nuevo
      // para recibir exactamente el numero equivocado que acabamos de corregir
      // — pagando el credito igual.
      //
      // Se resuelve en la lectura y no en la clave a proposito: no toca el
      // esquema, y las filas viejas simplemente dejan de matchear y expiran
      // solas por TTL.
      const formulaCacheada = (cached?.resultado_json as AnalysisResult | undefined)?.score_detalle
        ?.formula;
      const cacheVigente = cached != null && formulaCacheada === FORMULA_VERSION;

      if (cacheVigente) {
        const resultadoJson = cached.resultado_json as AnalysisResult;
        resultadoJson.publicaciones_analizadas = cached.publicaciones_analizadas as number;
        resultadoJson.cache_date = cached.created_at as string;

        const { data: inserted, error: insertErr } = await supabase
          .from("analyses")
          .insert({
            user_id: user.id,
            producto,
            pais,
            costo_estimado: costoEstimado,
            resultado_json: resultadoJson,
            score: resultadoJson.score,
            veredicto: resultadoJson.veredicto,
            reintento_de: reintentoGratis ? reintento_de : null,
          })
          .select("id")
          .single();

        if (insertErr || !inserted) {
          // Si choca con analyses_reintento_de_unico, alguien ya uso el
          // reintento de ese analisis. Se responde sin cobrar ni crear nada.
          if (insertErr?.code === "23505") {
            return NextResponse.json({ error: "reintento_ya_usado" }, { status: 409 });
          }
          return NextResponse.json(
            { error: insertErr?.message ?? "Error guardando el análisis." },
            { status: 500 }
          );
        }

        if (!reintentoGratis) {
          await supabase.rpc("descontar_analisis", { user_id_param: user.id });
        }

        return NextResponse.json({ id: inserted.id });
      }
    }

    // --- Si hay imagen, extraer keyword descriptiva para Apify ---
    let searchKeyword = producto;
    if (imagenBase64) {
      try {
        // El producto tipeado viaja como ancla (23/9): la foto precisa el
        // texto, no compite con el. Sin esto el modelo leia la imagen en el
        // vacio y podia devolver un termino mas generico que el que el usuario
        // ya habia escrito.
        const keyword = await extractKeywordsFromImage(
          imagenBase64,
          imagenMimeType ?? "image/jpeg",
          producto
        );
        if (keyword) searchKeyword = keyword;
      } catch {
        // Fallback silencioso al texto del usuario
      }
    }

    // --- Crear job y disparar evento Inngest ---
    const { data: job, error: jobErr } = await supabase
      .from("analysis_jobs")
      .insert({
        user_id: user.id,
        producto,
        pais,
        costo_estimado: costoEstimado,
        status: "pending",
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      return NextResponse.json(
        { error: jobErr?.message ?? "Error creando el job." },
        { status: 500 }
      );
    }

    const eventData: Record<string, unknown> = {
      job_id: job.id,
      user_id: user.id,
      producto,
      pais,
      costo_estimado: costoEstimado,
      plan,
      perfil_vendedor: perfilVendedor,
      datos_pro: datos_pro ?? null,
      // Ya validado arriba contra la base. El worker NO lo revalida: confia en
      // que la route decidio, porque el evento solo lo puede emitir la route.
      reintento_de: reintentoGratis ? reintento_de : null,
    };
    if (searchKeyword !== producto) {
      eventData.search_keyword = searchKeyword;
    }

    await inngest.send({
      name: "nichalo/analisis.requested",
      data: eventData,
    });

    return NextResponse.json({ job_id: job.id }, { status: 202 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
