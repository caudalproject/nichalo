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
  return text
    .replace(/\b[a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)+:\s*\S+/gi, "")
    .replace(/\bsold(?:_?[Qq]uantity)?:\s*\d+/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sellerDisplayName(nombre: string, index: number): string {
  if (!nombre || nombre.includes("http") || nombre.includes("/") || nombre.includes(".com")) {
    return `Vendedor #${index + 1}`;
  }
  return nombre;
}

function formatLocalPrice(value: number, currencyCode: string | undefined): string {
  if (!currencyCode) return formatCurrency(value, "USD");
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
          .select("plan, analisis_restantes")
          .eq("id", user.id)
          .maybeSingle()
      ).data
    : null;

  const result = analysis.resultado_json as AnalysisResult;
  const styles = veredictoStyles(analysis.veredicto);

  const costo = Number(analysis.costo_estimado);
  const moneda = result.moneda;
  const tasaCambio = result.tasa_cambio ?? 1400;
  const precioVentaLocal = result.margen.precio_sugerido_venta;
  const precioVentaUsd = moneda ? (tasaCambio > 0 ? precioVentaLocal / tasaCambio : 0) : precioVentaLocal;
  const margenBruto = precioVentaUsd > 0 ? ((precioVentaUsd - costo) / precioVentaUsd) * 100 : 0;
  const roi = costo > 0 ? ((precioVentaUsd - costo) / costo) * 100 : 0;
  const fecha = new Date(analysis.created_at).toLocaleString("es-AR", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const publicaciones =
    result.publicaciones_analizadas ?? result.competencia?.cantidad_vendedores ?? 0;

  const hasChart = result.competencia?.distribucion_precios?.length > 0;
  const hasTopVendedores = result.competencia?.top_vendedores?.length > 0;
  const hasKeywords = result.competencia?.palabras_clave_titulos?.length > 0;
  const hasDiferenciadores = result.diferenciadores_oportunidad?.length > 0;

  return (
    <>
      <Navbar
        email={user?.email}
        analisisRestantes={profile?.analisis_restantes}
        plan={profile?.plan}
      />
      <main className="container py-10">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard"
              className="text-sm text-muted-foreground hover:underline"
            >
              ← Volver al dashboard
            </Link>
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
          <Card className={cn("border-2 shadow-sm rounded-lg", styles.pillBorder, styles.pillBg)}>
            <CardContent className="p-8 text-center">
              <div className="text-5xl">{styles.emoji}</div>
              <div className={cn("mt-3 text-4xl font-extrabold tracking-tight", styles.title)}>
                {analysis.veredicto}
              </div>
              <p className={cn("mt-1 text-sm font-medium", styles.pillText)}>
                {styles.headline}
              </p>
              <div className="mt-6 inline-flex items-baseline gap-2 rounded-full bg-white/70 px-5 py-2 shadow-sm">
                <span className="text-sm text-muted-foreground">Score</span>
                <span className="text-3xl font-bold">{analysis.score}</span>
                <span className="text-sm text-muted-foreground">/ 100</span>
              </div>
              <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
                {SCORE_PILLS.map((pill) => {
                  const active = analysis.score >= pill.min && analysis.score <= pill.max;
                  return (
                    <span
                      key={pill.label}
                      className={cn(
                        "rounded-full border px-3 py-0.5 text-xs font-semibold",
                        active ? pill.active : pill.base
                      )}
                    >
                      {pill.label} · {pill.sublabel}
                    </span>
                  );
                })}
              </div>
              <h2 className="mt-6 text-lg font-semibold">{analysis.producto}</h2>
              <p className="text-sm text-muted-foreground">
                {PAIS_LABEL[analysis.pais] ?? analysis.pais} · Costo{" "}
                {formatCurrency(Number(analysis.costo_estimado), "USD")} · {fecha}
              </p>
              {publicaciones > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Análisis basado en {publicaciones} publicaciones de Mercado Libre
                </p>
              )}
            </CardContent>
          </Card>

          {/* CAPA 2: Resumen ejecutivo */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Precio promedio", value: formatLocalPrice(result.competencia.precio_promedio, moneda) },
              { label: "Margen bruto", value: `${margenBruto.toFixed(1)}%` },
              { label: "Vendedores relevados", value: String(result.competencia.cantidad_vendedores) },
              { label: "Precio sugerido", value: formatLocalPrice(result.margen.precio_sugerido_venta, moneda) },
            ].map((m) => (
              <div key={m.label} className="rounded-lg border border-[#E5E7EB] bg-white p-4 text-center">
                <div className="text-xs text-[#6B7280]">{m.label}</div>
                <div className="mt-1 text-xl font-bold text-[#0A0A0A]">{m.value}</div>
              </div>
            ))}
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
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Competencia</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Row label="Vendedores relevados">
                  {result.competencia.cantidad_vendedores}
                </Row>
                <Row label="Precio mínimo">
                  {formatLocalPrice(result.competencia.precio_minimo, moneda)}
                </Row>
                <Row label="Precio promedio">
                  {formatLocalPrice(result.competencia.precio_promedio, moneda)}
                </Row>
                <Row label="Precio máximo">
                  {formatLocalPrice(result.competencia.precio_maximo, moneda)}
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
                    <span>{formatLocalPrice(result.margen.precio_sugerido_venta, moneda)}</span>
                  </div>
                  <p className="mt-1 text-xs text-[#6B7280]">
                    {moneda
                      ? `≈ ${formatCurrency(precioVentaUsd, "USD")} · Percentil según perfil con margen mínimo garantizado`
                      : "Calculado en el percentil 30 del mercado con margen mínimo garantizado"}
                  </p>
                </div>
                <Row label="Comisión ML estimada">
                  {formatCurrency(result.margen.comision_ml_estimada)}
                </Row>
                <Row label="Ganancia estimada">
                  <strong>{formatCurrency(result.margen.ganancia_estimada)}</strong>
                </Row>
                <Row label="Margen bruto">
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
                </Row>
                <Row label="ROI">
                  <Badge
                    variant={
                      roi >= 30
                        ? "success"
                        : roi >= 15
                          ? "warning"
                          : "destructive"
                    }
                  >
                    {roi.toFixed(1)}%
                  </Badge>
                </Row>
                {result.margen.costo_evaluacion && (
                  <Row label="Costo ingresado">
                    <Badge className={costoBadgeClasses(result.margen.costo_evaluacion)}>
                      {costoLabel(result.margen.costo_evaluacion)}
                    </Badge>
                  </Row>
                )}
              </CardContent>
            </Card>
          </div>

          {/* CAPA 7: Top vendedores */}
          {hasTopVendedores && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Top vendedores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3 sm:grid-cols-3">
                  {result.competencia.top_vendedores.slice(0, 3).map((v, i) => {
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
          )}

          {/* CAPA 8: Distribución de precios */}
          {hasChart && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Distribución de precios</CardTitle>
              </CardHeader>
              <CardContent>
                <PriceDistributionChart
                  data={result.competencia.distribucion_precios}
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
          )}

          {/* CAPA 9: Palabras clave */}
          {hasKeywords && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Palabras clave en títulos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.competencia.palabras_clave_titulos.map((kw, i) => (
                    <Badge key={i} variant="outline" className="text-sm">
                      {kw}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* CAPA 10: Tendencia + Estacionalidad */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Tendencia y demanda</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm">{sanitizeText(result.tendencia)}</p>
              </CardContent>
            </Card>

            {result.estacionalidad && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Estacionalidad</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{sanitizeText(result.estacionalidad)}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* CAPA 11: Oportunidades de diferenciación */}
          {hasDiferenciadores && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Oportunidades de diferenciación</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {result.diferenciadores_oportunidad.map((d, i) => (
                    <Badge
                      key={i}
                      className="bg-green-100 text-[#16A34A] border-green-200 hover:bg-green-100"
                    >
                      {sanitizeText(d)}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* CAPA 12: Análisis de costo vs proveedores */}
          {result.analisis_costo_proveedor && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Análisis de costo vs. proveedores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label="Rango mayorista estimado (importación)">
                  <span className="font-medium">
                    {result.analisis_costo_proveedor.rango_mayorista_estimado}
                  </span>
                </Row>
                {result.margen.costo_evaluacion && (
                  <Row label="Evaluación del costo">
                    <Badge className={costoBadgeClasses(result.margen.costo_evaluacion)}>
                      {costoLabel(result.margen.costo_evaluacion)}
                    </Badge>
                  </Row>
                )}
                <p className="text-muted-foreground">
                  {sanitizeText(result.analisis_costo_proveedor.evaluacion)}
                </p>
              </CardContent>
            </Card>
          )}

          {/* CAPA 13: Riesgos */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Riesgos a tener en cuenta</CardTitle>
            </CardHeader>
            <CardContent>
              {result.riesgos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Sin riesgos relevantes detectados.
                </p>
              ) : (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {result.riesgos.map((r, i) => (
                    <li key={i}>{sanitizeText(r)}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* CAPA 14: Recomendación */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Recomendación</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium">{sanitizeText(result.recomendacion)}</p>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
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
