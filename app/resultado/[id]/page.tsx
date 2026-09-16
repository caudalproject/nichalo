import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import type { AnalysisResult, AnalysisRow } from "@/lib/supabase";
import { Navbar } from "@/components/Navbar";
import { PriceDistributionChart } from "@/components/PriceDistributionChart";
import { ShareButton } from "@/components/ShareButton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency } from "@/lib/utils";
import { ScoreDisplay } from "@/components/ScoreDisplay";
import { AvisoConfianza } from "@/components/AvisoConfianza";
import { confianzaHeredada } from "@/lib/confianza";
import { PacksOffer } from "@/components/PacksOffer";

export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

const PAIS_LABEL: Record<string, string> = {
  AR: "Argentina",
  MX: "México",
  CO: "Colombia",
};

function veredictoStyles(v: AnalysisRow["veredicto"]) {
  if (v === "VIABLE") {
    return {
      pillBg: "bg-green-100",
      pillBorder: "border-green-200",
      pillText: "text-[#16A34A]",
      title: "text-[#16A34A]",
      emoji: "🟢",
      headline: "Es viable — adelante",
    };
  }
  if (v === "MARGINAL") {
    return {
      pillBg: "bg-yellow-100",
      pillBorder: "border-yellow-200",
      pillText: "text-[#CA8A04]",
      title: "text-[#CA8A04]",
      emoji: "🟡",
      headline: "Es marginal — con cuidado",
    };
  }
  return {
    pillBg: "bg-red-100",
    pillBorder: "border-red-200",
    pillText: "text-[#DC2626]",
    title: "text-[#DC2626]",
    emoji: "🔴",
    headline: "Saturado — buscá otro nicho",
  };
}

function costoBadgeClasses(ev: string): string {
  if (ev === "COMPETITIVO") return "bg-green-100 text-[#16A34A] border-green-200 hover:bg-green-100";
  if (ev === "ALTO") return "bg-yellow-100 text-[#CA8A04] border-yellow-200 hover:bg-yellow-100";
  return "bg-red-100 text-[#DC2626] border-red-200 hover:bg-red-100";
}

function costoLabel(ev: string) {
  if (ev === "COMPETITIVO") return "Competitivo";
  if (ev === "ALTO") return "Alto";
  return "Muy alto";
}

function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\b[a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+:\s*\S+/gi, "")
    .replace(/\bsold(?:_?[Qq]uantity)?:\s*\d+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sellerDisplayName(nombre: string, index: number): string {
  if (!nombre || nombre === "null" || nombre.includes("http") || nombre.includes("/") || nombre.includes(".com")) {
    return `Vendedor #${index + 1}`;
  }
  return nombre;
}

function formatLocalPrice(value: number, currencyCode: string | undefined): string {
  if (!currencyCode) return formatCurrency(value, "ARS");
  const locale = currencyCode === "MXN" ? "es-MX" : currencyCode === "COP" ? "es-CO" : "es-AR";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currencyCode,
    maximumFractionDigits: 0,
  }).format(value);
}

const SCORE_PILLS = [
  {
    label: "0–49",
    sublabel: "Saturado",
    min: 0,
    max: 49,
    base: "bg-red-100 text-red-700 border-red-200",
    active: "bg-red-500 text-white border-red-500",
  },
  {
    label: "50–74",
    sublabel: "Marginal",
    min: 50,
    max: 74,
    base: "bg-yellow-100 text-yellow-700 border-yellow-200",
    active: "bg-yellow-500 text-white border-yellow-500",
  },
  {
    label: "75–100",
    sublabel: "Viable",
    min: 75,
    max: 100,
    base: "bg-green-100 text-green-700 border-green-200",
    active: "bg-[#16A34A] text-white border-[#16A34A]",
  },
];

export default async function ResultadoPage({ params }: Params) {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: analysis, error } = await supabase
    .from("analyses")
    .select(
      "id, user_id, producto, pais, costo_estimado, resultado_json, score, veredicto, created_at"
    )
    .eq("id", params.id)
    .maybeSingle();

  if (error || !analysis) {
    notFound();
  }

  const profile = user
    ? (
        await supabase
          .from("users")
          .select("plan, creditos_ciclo, creditos_pack")
          .eq("id", user.id)
          .maybeSingle()
      ).data
    : null;
  const analisisRestantes = profile
    ? (profile.creditos_ciclo ?? 0) + (profile.creditos_pack ?? 0)
    : undefined;

  const totalAnalisis = user ? (
    await supabase
      .from("analyses")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
  ).count ?? 0 : 0;

  const isPrimerAnalisis = totalAnalisis <= 1 && profile?.plan === "free";

  const result = analysis.resultado_json as AnalysisResult;
  const styles = veredictoStyles(analysis.veredicto);

  const costo = Number(analysis.costo_estimado);
  const moneda = result.moneda;
  const FALLBACK_RATES: Record<string, number> = { ARS: 1400, MXN: 17, COP: 4200 };
  const tasaCambio = result.tasa_cambio ?? FALLBACK_RATES[result.moneda ?? 'ARS'] ?? 1400;
  const usdToLocal = (usd: number) => usd * tasaCambio;
  const formatLocal = (usd: number) => formatLocalPrice(usdToLocal(usd), moneda ?? 'ARS');
  const precioVentaLocal = result.margen.precio_sugerido_venta;
  // Bug encontrado 2026-09-13: esta condición usaba `moneda` sin el fallback
  // ?? 'ARS' que sí tiene `formatLocal` dos líneas arriba. Cualquier análisis
  // sin `moneda` en resultado_json (anteriores a que ese campo existiera)
  // se quedaba SIN dividir por la tasa de cambio, inflando margenBruto/roi
  // (ej. "Termo Stanley" mostraba 100.0% de margen en vez de ~61%). Ahora
  // siempre se divide, usando la mejor tasa disponible (ver línea 171).
  const precioVentaUsd = tasaCambio > 0 ? precioVentaLocal / tasaCambio : precioVentaLocal;

  // Bug encontrado 2026-09-16: margen y ROI se calculaban sin restar la
  // comision de ML, que Gemini ya devuelve y que esta pagina muestra una fila
  // mas arriba. En "Silla gamer" eso daba 92,8% contra el 78,86% que habia
  // calculado el modelo: dos margenes en el sistema, y la pantalla mostraba
  // el mas favorable. A diferencia del resto de este archivo, esto estaba mal
  // tambien con datos perfectamente limpios.
  const comisionUsd =
    result.comision_detalle?.monto_usd ?? result.margen.comision_ml_estimada ?? 0;
  const gananciaUsd = precioVentaUsd - costo - comisionUsd;
  const margenBruto = precioVentaUsd > 0 ? (gananciaUsd / precioVentaUsd) * 100 : 0;
  const roi = costo > 0 ? (gananciaUsd / costo) * 100 : 0;

  // Confianza. `undefined` = analisis anterior al 16/9, cuando no se medía.
  // Para esos se reconstruye con lo que haya en resultado_json en vez de
  // asumir "alta": los analisis viejos son justamente los que tienen los
  // numeros sospechosos.
  const confianza =
    result.confianza ??
    confianzaHeredada({
      precioMinimo: result.competencia?.precio_minimo,
      precioMaximo: result.competencia?.precio_maximo,
      precioSugerido: precioVentaLocal,
      costoLocal: costo * tasaCambio,
    });
  const confiable = confianza?.nivel === "alta";
  const bajaConfianza = confianza?.nivel === "baja";
  const degradado = confianza != null && !confiable;
  const mostrarMediana = degradado && result.precio_stats?.precio_mediano != null;
  const localeMap: Record<string, string> = { AR: "es-AR", MX: "es-MX", CO: "es-CO" };
  const locale = localeMap[analysis.pais] ?? "es-AR";
  const fecha = new Date(analysis.created_at).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  // Bug encontrado 2026-09-16: los packs NO cambian el plan del usuario, solo
  // suman `creditos_pack` (ver el comentario en lib/mercadopago.ts). Como esta
  // condicion miraba unicamente `plan === "free"`, alguien que pagaba $4.500
  // por el Pack 3 veia las secciones blureadas desde su segundo analisis.
  // Cobrar y entregar el producto capado es peor que cualquier badge en verde.
  //
  // NO alcanza con mirar `creditos_pack > 0`: el credito gratis de bienvenida
  // tambien se otorga ahi (bootstrapNewUser), asi que esa condicion abriria
  // todo para cualquier usuario free. Y `creditos_pack` baja a 0 cuando los
  // gasta, con lo que perderia el acceso a sus propios analisis pasados.
  // El unico hecho persistente de "pago alguna vez" es la tabla `purchases`.
  const compro = user
    ? ((
        await supabase
          .from("purchases")
          .select("id", { count: "exact", head: true })
          .eq("user_id", user.id)
      ).count ?? 0) > 0
    : false;

  const isFree =
    (!user || !profile || (profile.plan === "free" && !compro)) && !isPrimerAnalisis;

  const resultadoParaMostrar = isFree ? {
    ...result,
    competencia: {
      ...result.competencia,
      top_vendedores: [],
      palabras_clave_titulos: [],
      distribucion_precios: [],
    },
    tendencia: null,
    estacionalidad: null,
    diferenciadores_oportunidad: [],
    riesgos: [],
    recomendacion: null,
    productos_alternativos: [],
    analisis_costo_proveedor: null,
  } : result;

  const publicaciones =
    result.publicaciones_analizadas ?? result.competencia?.cantidad_vendedores ?? 0;

  const hasChart = resultadoParaMostrar.competencia?.distribucion_precios?.length > 0;
  const hasTopVendedores = resultadoParaMostrar.competencia?.top_vendedores?.length > 0;
  const hasKeywords = resultadoParaMostrar.competencia?.palabras_clave_titulos?.length > 0;
  const hasDiferenciadores = resultadoParaMostrar.diferenciadores_oportunidad?.length > 0;

  return (
    <>
      <Navbar
        email={user?.email}
        analisisRestantes={analisisRestantes}
        plan={profile?.plan}
      />
      <main className="container py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Contexto para el visitante sin cuenta. La landing lo manda aca
              con "Mira un analisis real, sin registrarte", y lo que ve es la
              version publica: sin competencia en detalle, sin riesgos y sin
              recomendacion (`isFree` mas arriba tapa esas secciones para
              cualquiera sin sesion). Sin este cartel la pagina se lee como si
              estuviera rota; con el, el hueco es la oferta. */}
          {!user && (
            <div className="rounded-xl border border-[#16A34A]/25 bg-[#F0FDF4] px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4">
              <p className="text-sm text-[#0A0A0A]">
                Estás viendo la <strong>versión pública</strong> de un análisis
                real. Creá una cuenta gratis y tu primer análisis lo ves entero.
              </p>
              <Link href="/login" className="mt-3 block sm:mt-0 sm:shrink-0">
                <Button size="sm" className="w-full sm:w-auto">
                  Empezar gratis →
                </Button>
              </Link>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            {user ? (
              <Link
                href="/dashboard"
                className="text-sm text-muted-foreground hover:underline"
              >
                <span className="whitespace-nowrap">← Volver al dashboard</span>
              </Link>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <ShareButton />
              {user && (
                <Link href="/analizar">
                  <Button size="sm">+ Nuevo análisis</Button>
                </Link>
              )}
            </div>
          </div>

          {/* CAPA 1: Veredicto hero */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className={`h-1.5 w-full ${
              analysis.veredicto === 'VIABLE' ? 'bg-green-500' :
              analysis.veredicto === 'MARGINAL' ? 'bg-yellow-400' :
              'bg-red-500'
            }`} />

            <div className="px-4 sm:px-8 py-12">
              <div className="flex items-center gap-3 mb-8">
                <span className={`text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded-full ${
                  analysis.veredicto === 'VIABLE' ? 'bg-green-50 text-green-700' :
                  analysis.veredicto === 'MARGINAL' ? 'bg-yellow-50 text-yellow-700' :
                  'bg-red-50 text-red-700'
                }`}>
                  {analysis.veredicto}
                </span>
                <span className="text-sm text-gray-400">{styles.headline}</span>
              </div>

              <div className="mb-8">
                <ScoreDisplay score={analysis.score} veredicto={analysis.veredicto} />

                <div className="mt-4 h-1.5 bg-gray-100 rounded-full w-full max-w-64">
                  <div className={`h-full rounded-full transition-all ${
                    analysis.veredicto === 'VIABLE' ? 'bg-green-500' :
                    analysis.veredicto === 'MARGINAL' ? 'bg-yellow-400' :
                    'bg-red-500'
                  }`} style={{ width: `${analysis.score}%` }} />
                </div>

                <div className="flex gap-4 mt-2 text-xs text-gray-400">
                  <span>0–49 · Saturado</span>
                  <span>50–74 · Marginal</span>
                  <span>75–100 · Viable</span>
                </div>
              </div>

              <div className="border-t border-gray-50 pt-6">
                <h1 className="text-xl font-semibold text-gray-900 mb-1">{analysis.producto}</h1>
                <p className="text-sm text-gray-400">
                  {PAIS_LABEL[analysis.pais] ?? analysis.pais} · Costo {formatLocal(costo)} · {fecha}
                </p>
                {publicaciones > 0 && (
                  <p className="text-xs text-gray-500 mt-1 font-medium">
                    Datos de {publicaciones} publicaciones reales de Mercado Libre
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Confianza de los datos — va ANTES de cualquier numero derivado. */}
          <AvisoConfianza
            confianza={confianza}
            stats={result.precio_stats ?? result.competencia}
            formatear={(n: number) => formatLocalPrice(n, moneda ?? "ARS")}
          />

          {/* CAPA 2: Resumen ejecutivo */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 text-center">
              <div className="text-xs text-[#6B7280]">Ganancia por unidad</div>
              <div
                className={`mt-1 font-mono text-xl font-bold ${
                  bajaConfianza ? "text-[#9CA3AF]" : "text-[#0A0A0A]"
                }`}
              >
                {bajaConfianza
                  ? "—"
                  : result.margen?.ganancia_estimada != null
                    ? formatLocal(result.margen.ganancia_estimada)
                    : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 text-center">
              <div className="text-xs text-[#6B7280]">Margen bruto</div>
              <div
                className={`mt-1 font-mono text-xl font-bold ${
                  bajaConfianza ? "text-[#9CA3AF]" : "text-[#0A0A0A]"
                }`}
              >
                {/* Sin decimal cuando la confianza es baja: "92.8%" afirma una
                    precision que los datos no sostienen. El decimal hace mas
                    dano que el numero. */}
                {bajaConfianza ? `~${Math.round(margenBruto)}%` : `${margenBruto.toFixed(1)}%`}
              </div>
              {bajaConfianza && (
                <div className="mt-1 text-[10px] font-medium uppercase tracking-wide text-amber-700">
                  baja confianza
                </div>
              )}
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 text-center">
              <div className="text-xs text-[#6B7280]">Publicaciones scrapeadas</div>
              <div className="mt-1 font-mono text-xl font-bold text-[#0A0A0A]">
                {String(result.publicaciones_analizadas ?? result.competencia?.cantidad_vendedores ?? 0)}
              </div>
            </div>
            <div className="rounded-lg border border-[#E5E7EB] bg-white p-4 text-center">
              <div className="text-xs text-[#6B7280]">Precio sugerido</div>
              <div className="mt-1 font-mono text-xl font-bold text-[#0A0A0A]">
                {formatLocalPrice(result.margen.precio_sugerido_venta, moneda)}
              </div>
            </div>
          </div>

          {/* CAPA 3: Imagen analizada */}
          {result.imagen_url && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Imagen analizada</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative h-48 w-full overflow-hidden rounded-md border">
                  <Image
                    src={result.imagen_url}
                    alt={`Imagen de ${analysis.producto}`}
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {/* CAPA 4: Análisis general */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumen</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{sanitizeText(result.resumen)}</p>
            </CardContent>
          </Card>

          {/* CAPA 5: Título sugerido */}
          {result.titulo_sugerido_publicacion && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Título sugerido para la publicación</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="rounded-md bg-muted px-4 py-3 font-sans text-lg text-[#0A0A0A]">
                  {sanitizeText(result.titulo_sugerido_publicacion)}
                </p>
              </CardContent>
            </Card>
          )}

          {/* CAPA 6: Competencia + Margen */}
          <LockedSection locked={isFree} isLoggedIn={!!user} veredicto={analysis.veredicto}>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Competencia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Publicaciones scrapeadas">
                  {result.publicaciones_analizadas ?? result.competencia?.cantidad_vendedores ?? 0}
                </Row>

                <Row label="Precio mínimo">
                  {formatLocalPrice(result.competencia?.precio_minimo ?? 0, moneda)}
                </Row>
                {/* Con confianza degradada manda la mediana: el promedio es lo
                    que un solo outlier de $2.695.000 podia mover solo. El
                    promedio sigue visible abajo, etiquetado, para que nadie
                    sienta que le escondimos un numero. */}
                {mostrarMediana ? (
                  <>
                    <Row label="Precio mediano">
                      <span className="font-medium">
                        {formatLocalPrice(result.precio_stats!.precio_mediano, moneda)}
                      </span>
                    </Row>
                    <div className="flex items-center justify-between text-xs text-[#9CA3AF]">
                      <span>Precio promedio (sensible a outliers)</span>
                      <span>
                        {formatLocalPrice(result.competencia?.precio_promedio ?? 0, moneda)}
                      </span>
                    </div>
                  </>
                ) : (
                  <Row label="Precio promedio">
                    {formatLocalPrice(result.competencia?.precio_promedio ?? 0, moneda)}
                  </Row>
                )}
                <Row label="Precio máximo">
                  {formatLocalPrice(result.competencia?.precio_maximo ?? 0, moneda)}
                </Row>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Margen estimado</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <div className="flex items-center justify-between border-b pb-1.5">
                    <span className="text-muted-foreground">Precio sugerido de venta</span>
                    <span className="flex items-center gap-1.5">
                      {formatLocalPrice(result.margen.precio_sugerido_venta, moneda)}
                      {margenBruto >= 0 ? (
                        <span className="text-green-500 text-sm">✓</span>
                      ) : (
                        <span className="text-amber-500 text-sm">⚠</span>
                      )}
                    </span>
                  </div>
                  {margenBruto < 0 && (
                    <p className="mt-1 text-xs text-[#6B7280]">
                      Este precio no genera ganancia con tu costo actual — ver Recomendación abajo.
                    </p>
                  )}
                  <p className="mt-1 text-xs text-[#6B7280]">
                    Percentil según perfil con margen mínimo garantizado
                  </p>
                </div>
                {/* Comisión ML */}
                <div className="flex justify-between items-start py-2 border-b border-gray-50">
                  <div>
                    <span className="text-sm text-gray-500">Comisión ML estimada</span>
                    {result.comision_detalle && (
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          result.comision_detalle.tipo_publicacion === 'Premium'
                            ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {result.comision_detalle.tipo_publicacion}
                        </span>
                        <span className="text-xs text-gray-400">
                          {result.comision_detalle.porcentaje}%
                          {result.comision_detalle.cargo_fijo_ars > 0 && ` + $${result.comision_detalle.cargo_fijo_ars.toLocaleString('es-AR')} fijo`}
                        </span>
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-900">
                    {result.comision_detalle?.monto_ars
                      ? formatLocalPrice(result.comision_detalle.monto_ars, moneda ?? 'ARS')
                      : formatLocal(result.comision_detalle?.monto_usd ?? result.margen.comision_ml_estimada ?? 0)}
                  </span>
                </div>
                <Row label="Ganancia estimada">
                  <strong>{formatLocal(result.margen.ganancia_estimada)}</strong>
                </Row>
                {/* Con confianza baja el verde es inalcanzable. Tampoco rojo:
                    pintar de rojo tambien seria afirmar algo sobre datos que no
                    sostienen ninguna afirmacion. Neutro y dicho con palabras. */}
                <Row label="Margen bruto">
                  {bajaConfianza ? (
                    <Badge variant="outline" className="border-[#E5E7EB] text-[#6B7280]">
                      ~{Math.round(margenBruto)}% · baja confianza
                    </Badge>
                  ) : (
                    <Badge
                      variant={
                        margenBruto >= 25
                          ? "success"
                          : margenBruto >= 10
                            ? "warning"
                            : "destructive"
                      }
                    >
                      {margenBruto.toFixed(1)}%
                    </Badge>
                  )}
                </Row>
                <Row label="ROI">
                  {bajaConfianza ? (
                    <span className="text-xs text-[#6B7280]">
                      No calculable con estos datos
                    </span>
                  ) : (
                    <Badge
                      variant={
                        roi >= 30 ? "success" : roi >= 15 ? "warning" : "destructive"
                      }
                    >
                      {roi.toFixed(1)}%
                    </Badge>
                  )}
                </Row>
                {result.margen.costo_evaluacion && (
                  <Row label="Costo ingresado">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{formatLocal(costo)}</span>
                      {/* "Competitivo" solo con confianza alta. Ese badge al lado
                          del aviso de datos sucios era la contradiccion mas
                          visible de la pantalla: el sistema declaraba bueno un
                          costo que el mismo habia marcado como sospechoso. */}
                      {confiable ? (
                        <Badge className={costoBadgeClasses(result.margen.costo_evaluacion)}>
                          {costoLabel(result.margen.costo_evaluacion)}
                        </Badge>
                      ) : confianza?.motivos.includes("costo_fuera_de_rango") ? (
                        <Badge variant="outline" className="border-amber-300 text-amber-800">
                          Revisalo
                        </Badge>
                      ) : null}
                    </div>
                  </Row>
                )}
              </CardContent>
            </Card>
          </div>
          </LockedSection>

          {/* CAPA 7: Top vendedores */}
          {hasTopVendedores && (
            <LockedSection locked={isFree} isLoggedIn={!!user} veredicto={analysis.veredicto}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top vendedores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  {resultadoParaMostrar.competencia.top_vendedores.slice(0, 3).map((v, i) => {
                    const displayName = sellerDisplayName(v.nombre, i);
                    const repValida = ["ALTA", "MEDIA", "BAJA"].includes(v.reputacion);
                    return (
                      <div
                        key={i}
                        className="rounded-md border bg-muted/30 p-3 text-sm space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs font-medium">
                            #{i + 1}
                          </span>
                          <span className="font-semibold truncate">{displayName}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Precio</span>
                          <span>{formatLocalPrice(v.precio, moneda)}</span>
                        </div>
                        {v.ventas > 0 && (
                          <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Ventas</span>
                            <span>{v.ventas.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Reputación</span>
                          {repValida ? (
                            v.reputacion === "BAJA" ? (
                              <Badge
                                variant="outline"
                                className="text-xs bg-orange-100 text-orange-700 border-orange-300"
                                title="Oportunidad de entrada"
                              >
                                BAJA · Oportunidad
                              </Badge>
                            ) : (
                            <Badge
                              variant={
                                v.reputacion === "ALTA"
                                  ? "success"
                                  : "warning"
                              }
                              className="text-xs"
                            >
                              {v.reputacion}
                            </Badge>
                            )
                          ) : (
                            <Badge variant="secondary" className="text-xs">
                              Sin datos
                            </Badge>
                          )}
                        </div>
                        {v.diferenciador && (
                          <p className="text-xs text-muted-foreground pt-1 border-t">
                            {sanitizeText(v.diferenciador)}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
            </LockedSection>
          )}

          {/* CAPA 8: Distribución de precios */}
          {hasChart && (
            <LockedSection locked={isFree} isLoggedIn={!!user} veredicto={analysis.veredicto}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Distribución de precios</CardTitle>
              </CardHeader>
              <CardContent>
                <PriceDistributionChart
                  data={resultadoParaMostrar.competencia.distribucion_precios}
                  precioSugerido={result.margen.precio_sugerido_venta}
                />
                <div className="mt-3 flex items-center justify-center gap-6 text-xs text-[#6B7280]">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-[#16A34A]" />
                    Rango de precio recomendado
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-sm bg-[#1a1a1a]" />
                    Otros rangos
                  </span>
                </div>
              </CardContent>
            </Card>
            </LockedSection>
          )}

          {/* CAPA 9: Palabras clave */}
          {hasKeywords && (
            <LockedSection locked={isFree} isLoggedIn={!!user} veredicto={analysis.veredicto}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Palabras clave en títulos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {resultadoParaMostrar.competencia.palabras_clave_titulos.map((kw, i) => (
                    <Badge key={i} variant="outline" className="text-sm">
                      {kw}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
            </LockedSection>
          )}

          {/* CAPA 10: Tendencia + Estacionalidad */}
          <LockedSection locked={isFree} isLoggedIn={!!user} veredicto={analysis.veredicto}>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tendencia y demanda</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{resultadoParaMostrar.tendencia ? sanitizeText(resultadoParaMostrar.tendencia) : ""}</p>
              </CardContent>
            </Card>

            {resultadoParaMostrar.estacionalidad && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Estacionalidad</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{sanitizeText(resultadoParaMostrar.estacionalidad)}</p>
                </CardContent>
              </Card>
            )}
          </div>
          </LockedSection>

          {/* CAPA 11: Oportunidades de diferenciación */}
          {hasDiferenciadores && (
            <LockedSection locked={isFree} isLoggedIn={!!user} veredicto={analysis.veredicto}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Oportunidades de diferenciación</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {resultadoParaMostrar.diferenciadores_oportunidad.map((d, i) => (
                    <Badge
                      key={i}
                      className="bg-gray-50 text-gray-900 border-gray-200 hover:bg-gray-50"
                    >
                      {sanitizeText(d)}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
            </LockedSection>
          )}

          {/* CAPA 11b: Productos alternativos */}
          {resultadoParaMostrar.productos_alternativos && resultadoParaMostrar.productos_alternativos.length > 0 && (
            <LockedSection locked={isFree} isLoggedIn={!!user} veredicto={analysis.veredicto}>
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Productos con mejor oportunidad
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Este nicho está difícil, pero estos productos relacionados tienen más chances:
              </p>
              <div className="space-y-3">
                {resultadoParaMostrar.productos_alternativos.map((alt, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-white rounded-xl border border-gray-200">
                    <span className="text-gray-900 font-bold text-sm mt-0.5">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-gray-900">{alt.nombre}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-gray-700">
                          {alt.nicho === 'específico' ? 'Más específico' :
                           alt.nicho === 'adyacente' ? 'Nicho adyacente' : 'Nuevo segmento'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500">{alt.razon}</p>
                      <Link
                        href={`/analizar?producto=${encodeURIComponent(alt.nombre)}&pais=${analysis.pais}`}
                        className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900 mt-2"
                      >
                        Analizar este producto →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            </LockedSection>
          )}

          {/* CAPA 12: Análisis de costo vs proveedores */}
          {resultadoParaMostrar.analisis_costo_proveedor &&
            resultadoParaMostrar.analisis_costo_proveedor.rango_mayorista_estimado &&
            !resultadoParaMostrar.analisis_costo_proveedor.rango_mayorista_estimado.toLowerCase().includes("no disponible") && (
            <LockedSection locked={isFree} isLoggedIn={!!user} veredicto={analysis.veredicto}>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Análisis de costo vs. proveedores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Rango mayorista estimado (importación)">
                  <span className="font-medium">
                    {resultadoParaMostrar.analisis_costo_proveedor.rango_mayorista_estimado}
                  </span>
                </Row>
                {result.margen.costo_evaluacion && (
                  <Row label="Evaluación del costo">
                    <Badge className={costoBadgeClasses(result.margen.costo_evaluacion)}>
                      {costoLabel(result.margen.costo_evaluacion)}
                    </Badge>
                  </Row>
                )}
              </CardContent>
            </Card>
            </LockedSection>
          )}

          {/* CAPA 13: Riesgos */}
          <LockedSection locked={isFree} isLoggedIn={!!user} veredicto={analysis.veredicto}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Riesgos a tener en cuenta</CardTitle>
            </CardHeader>
            <CardContent>
              {(resultadoParaMostrar.riesgos?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin riesgos relevantes detectados.
                </p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {(resultadoParaMostrar.riesgos ?? []).map((r, i) => (
                    <li key={i}>{sanitizeText(r)}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          </LockedSection>

          {/* CAPA 14: Recomendación */}
          <LockedSection locked={isFree} isLoggedIn={!!user} veredicto={analysis.veredicto}>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recomendación</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(resultadoParaMostrar.recomendacion ?? '').split(' | ').filter(Boolean).map((bullet, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-[#16A34A] font-bold mt-0.5">{i + 1}.</span>
                    <span>{sanitizeText(bullet)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          </LockedSection>

          {/* CTA final */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 text-center space-y-3">
            {isPrimerAnalisis ? (
              <div className="text-left max-w-sm mx-auto">
                <PacksOffer producto={analysis.producto} veredicto={analysis.veredicto} />
              </div>
            ) : isFree ? (
              <div className="text-left max-w-sm mx-auto">
                <p className="text-sm font-semibold text-gray-900 text-center mb-3">
                  ¿Querés ver el análisis completo?
                </p>
                <PacksOffer producto={analysis.producto} veredicto={analysis.veredicto} />
                <p className="text-center text-xs text-[#6B7280] mt-3">
                  ¿Validás varios productos por mes?{" "}
                  <a href="/#planes" className="text-[#16A34A] hover:underline font-medium">
                    Mirá el plan Pro →
                  </a>
                </p>
              </div>
            ) : (
              <>
                <p className="text-sm font-semibold text-gray-900">
                  ¿Querés validar otro producto?
                </p>
                <Link href="/analizar">
                  <Button className="rounded-full">+ Nuevo análisis</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </main>
    </>
  );
}

function LockedSection({
  children,
  locked,
  isLoggedIn = true,
  veredicto,
}: {
  children: React.ReactNode;
  locked: boolean;
  isLoggedIn?: boolean;
  veredicto?: string;
}) {
  if (!locked) return <>{children}</>;
  return (
    <div className="relative">
      <div className="blur-sm pointer-events-none select-none opacity-60">
        {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 rounded-lg border border-[#E5E7EB] backdrop-blur-sm">
        <span className="text-2xl mb-2">🔒</span>
        {isLoggedIn ? (
          <>
            <p className="text-sm font-semibold text-[#0A0A0A] mb-1">
              {veredicto === "VIABLE"
                ? "¿Es viable? Ahora desbloqueá quién lo vende y a qué precio"
                : veredicto === "SATURADO"
                ? "Mercado saturado — desbloqueá los productos alternativos con más chances"
                : "Desbloqueá el análisis completo"}
            </p>
            <p className="text-xs text-[#6B7280] mb-3 text-center px-4">
              {veredicto === "VIABLE"
                ? "Top vendedores, precios, keywords y recomendación completa"
                : veredicto === "SATURADO"
                ? "3 nichos relacionados con mejor oportunidad te esperan desbloqueados"
                : "Competencia, márgenes, top vendedores y más"}
            </p>
            <a href="/#planes" className="inline-flex items-center rounded-full bg-[#16A34A] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D] transition-colors">
              Ver planes →
            </a>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-[#0A0A0A] mb-1">
              Creá una cuenta gratis
            </p>
            <p className="text-xs text-[#6B7280] mb-3 text-center px-4">
              Para ver el análisis completo
            </p>
            <Link href="/login" className="inline-flex items-center rounded-full bg-[#16A34A] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#15803D] transition-colors">
              Registrarse gratis →
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b pb-1.5 last:border-0 last:pb-0">
      <span className="text-muted-foreground">{label}</span>
      <span>{children}</span>
    </div>
  );
}
