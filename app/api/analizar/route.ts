import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { inngest } from "@/lib/inngest";
import { extractKeywordsFromImage } from "@/lib/gemini";
import { sendUpsellEmail } from "@/lib/resend";
import type { Plan, AnalysisResult } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


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
  // OBLIGATORIA DEL LADO DEL SERVIDOR (23/9). Lo era desde el 21/9, pero solo
  // en `AnalizarForm.tsx`: el schema la seguia aceptando ausente.
  //
  // No es una cuestion de seguridad — quien saltee el formulario se gasta su
  // propio credito. Es que sin foto **se apaga toda la prevencion a la vez**:
  // no hay `search_keyword` (Apify busca con el texto tipeado, que es el caso
  // "aspiradora" que trae la categoria entera), no hay ficha, y sin ficha
  // `verificarPertenencia` se abstiene por su primer cerco. Queda el filtro de
  // palabras solo. Un camino asi no puede quedar alcanzable por accidente.
  imagenBase64: z.string().min(1),
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
    // La foto es la unica validacion de este schema que un usuario puede
    // disparar sin que haya un bug nuestro, asi que se le contesta con el
    // mismo texto que muestra el formulario. `invalid_input` no le dice nada a
    // nadie, y el cliente renderiza `detail` tal cual.
    const faltaFoto = parsed.error.issues.some((i) => i.path[0] === "imagenBase64");
    return NextResponse.json(
      {
        error: faltaFoto ? "foto_requerida" : "invalid_input",
        ...(faltaFoto
          ? {
              detail:
                "Subí una foto del producto. Sin la foto no podemos identificar cuál es y el análisis sale impreciso.",
            }
          : {}),
        issues: parsed.error.flatten(),
      },
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
    // EL CACHE SE ELIMINO EL 23/9/2026.
    //
    // Nacio para no pagar Apify dos veces por el mismo producto, pero desde
    // que la foto es obligatoria (21/9) el lookup vivia adentro de un
    // `if (!imagenBase64)` que ya no se cumple nunca: no podia pegar, y el
    // worker seguia escribiendo una fila por analisis. Estaba muerto y
    // costando.
    //
    // No se reanima metiendo la imagen en la clave, y ese es el punto: dos
    // fotos distintas del "mismo" producto son dos productos distintos para el
    // que las sube — otra marca, otra potencia, otro tamaño. Servirle a uno el
    // analisis calculado con la foto de otro es exactamente el error que este
    // sistema esta tratando de eliminar, y ademas seria silencioso (regla dura
    // del proyecto: el cache nunca se anuncia). Con el volumen actual de
    // analisis el ahorro no compensa ni de cerca ese riesgo.
    //
    // La tabla `analysis_cache` se dropea en la migracion
    // 20260923120000_drop_analysis_cache.sql.

    // --- Extraer keyword descriptiva y ficha a partir de la foto ---
    //
    // SIN `if (imagenBase64)`. La foto es obligatoria en el schema, asi que
    // esto corre siempre y el condicional seria una rama muerta. Se saca a
    // proposito: la rama muerta es como nacio el bug del cache — un lookup
    // adentro de un `if (!imagenBase64)` que dejo de cumplirse el 21/9 y
    // quedo dos dias cobrando sin poder pegar nunca.
    let searchKeyword = producto;
    let fichaProducto = "";
    try {
      // El producto tipeado viaja como ancla (23/9): la foto precisa el
      // texto, no compite con el. Sin esto el modelo leia la imagen en el
      // vacio y podia devolver un termino mas generico que el que el usuario
      // ya habia escrito.
      //
      // La FICHA que vuelve es la pieza nueva: describe la gama y la variante
      // del producto, y es lo que despues le permite al worker descartar la
      // publicacion que se llama igual pero juega en otro mercado.
      const identificado = await extractKeywordsFromImage(
        imagenBase64,
        imagenMimeType ?? "image/jpeg",
        producto
      );
      if (identificado?.termino_busqueda) searchKeyword = identificado.termino_busqueda;
      if (identificado?.ficha) fichaProducto = identificado.ficha;
    } catch (err) {
      // Se sigue con el texto del usuario, que es lo correcto — pero YA NO EN
      // SILENCIO. Era el hueco 3 de la auditoria del 23/9 y ademas el que
      // impedia medir: sin este log no hay de donde sacar cuantas veces pasa.
      console.error(
        "[analizar] extractKeywordsFromImage fallo, se busca con el texto tipeado:",
        err instanceof Error ? err.message : String(err)
      );
    }

    // SIN FICHA LA PASADA SEMANTICA NO CORRE (primer cerco de
    // `verificarPertenencia`). O sea: este log marca los analisis que salieron
    // con una sola capa de limpieza en vez de dos. Es el numero que el
    // pendiente "medir cuantas veces la ficha sale vacia" necesita, y hasta
    // ahora no existia en ningun lado.
    //
    // Pasa por dos caminos distintos y conviene poder separarlos: o fallo la
    // llamada (log de arriba), o el modelo devolvio SIN_DATO porque la foto no
    // alcanzaba. Solo el segundo llega aca limpio.
    if (!fichaProducto) {
      console.warn(
        `[analizar] ficha_vacia user=${user.id} producto=${JSON.stringify(producto)} ` +
          `keyword_propia=${searchKeyword !== producto}`
      );
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
    if (fichaProducto) {
      eventData.ficha_producto = fichaProducto;
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
