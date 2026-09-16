import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AnalysisResult } from "@/lib/supabase";

/**
 * Lo que produce el "Analisis avanzado Pro", con nombre propio.
 *
 * Auditoria 13/9, problema 8: la card de Pro listaba cuatro PREGUNTAS del
 * formulario ("de donde importarlo", "cuanto necesitas") como si fueran
 * beneficios. Eran inputs, no outputs.
 *
 * El experimento de `scripts/experimento-datos-pro.mjs` mostro que el
 * contenido si se generaba — el modelo calculaba cuantas unidades entraban en
 * el presupuesto — pero salia dentro de `analisis_costo_proveedor.evaluacion`,
 * un campo que el usuario free tambien recibe. Nadie podia saber que eso lo
 * habia conseguido por contestar el formulario largo.
 *
 * Cada input tiene ahora su seccion con titulo. Cuatro preguntas, cuatro
 * bloques visibles: esa es la diferencia entre vender un formulario y vender
 * un resultado.
 */
export function AnalisisAvanzado({
  datos,
  formatUsd,
}: {
  datos: AnalysisResult["analisis_avanzado"];
  formatUsd: (usd: number) => string;
}) {
  if (!datos) return null;

  const { primera_compra, importacion, mix_variantes, plan_canal } = datos;

  return (
    <Card className="border-[#0A0A0A]/10">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Análisis avanzado</CardTitle>
          <Badge variant="outline" className="border-[#0A0A0A]/20 text-[10px] uppercase tracking-wide">
            Pro
          </Badge>
        </div>
        <p className="text-xs text-[#6B7280]">
          Calculado con los datos que cargaste en el formulario avanzado.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {primera_compra && (
          <section className="space-y-1.5">
            <h3 className="text-sm font-semibold text-[#0A0A0A]">Tu primera compra</h3>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-mono text-2xl font-bold text-[#0A0A0A]">
                {primera_compra.unidades.toLocaleString("es-AR")}
              </span>
              <span className="text-sm text-[#6B7280]">
                unidades por {formatUsd(primera_compra.inversion_usd)}
                {primera_compra.costo_unitario_usd > 0 &&
                  ` · ${formatUsd(primera_compra.costo_unitario_usd)} c/u`}
              </span>
            </div>
            {primera_compra.detalle && (
              <p className="text-sm leading-relaxed text-[#6B7280]">{primera_compra.detalle}</p>
            )}
          </section>
        )}

        {importacion && (
          <section className="space-y-1.5 border-t border-gray-50 pt-4">
            <h3 className="text-sm font-semibold text-[#0A0A0A]">Costos reales de importación</h3>
            <dl className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 sm:block">
                <dt className="text-xs text-[#6B7280]">Costos extra</dt>
                <dd className="text-[#0A0A0A]">{importacion.costos_extra}</dd>
              </div>
              {importacion.tiempo_estimado && (
                <div className="flex justify-between gap-2 sm:block">
                  <dt className="text-xs text-[#6B7280]">Tiempo estimado</dt>
                  <dd className="text-[#0A0A0A]">{importacion.tiempo_estimado}</dd>
                </div>
              )}
            </dl>
            {importacion.detalle && (
              <p className="text-sm leading-relaxed text-[#6B7280]">{importacion.detalle}</p>
            )}
          </section>
        )}

        {mix_variantes && mix_variantes.length > 0 && (
          <section className="space-y-2 border-t border-gray-50 pt-4">
            <h3 className="text-sm font-semibold text-[#0A0A0A]">Mix de variantes</h3>
            <ul className="space-y-1.5">
              {mix_variantes.map((v) => (
                <li key={v.variante} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 min-w-[3rem] shrink-0 font-mono text-xs font-semibold text-[#0A0A0A]">
                    {v.proporcion}
                  </span>
                  <span className="min-w-0">
                    <strong className="font-medium text-[#0A0A0A]">{v.variante}</strong>
                    {v.razon && <span className="text-[#6B7280]"> — {v.razon}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {plan_canal && (
          <section className="space-y-1.5 border-t border-gray-50 pt-4">
            <h3 className="text-sm font-semibold text-[#0A0A0A]">
              {plan_canal.titulo || "Plan de lanzamiento"}
            </h3>
            <p className="text-sm leading-relaxed text-[#6B7280]">{plan_canal.detalle}</p>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
