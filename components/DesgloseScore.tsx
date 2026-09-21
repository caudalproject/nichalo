import type { AnalysisResult } from "@/lib/supabase";

/**
 * De que se compone el score. TAB 4 del plan de tabs (21/9/2026).
 *
 * POR QUE EXISTE
 *
 * La objecion real del usuario contra Nichalo es "en 3 minutos busco yo las
 * publicaciones en Mercado Libre". Contra eso, un numero grande solo no hace
 * nada: un 62 sin aritmetica atras se lee exactamente igual que un 62
 * inventado por un modelo de lenguaje — que es, literalmente, lo que era hasta
 * el 20/9 (45 puntos de variacion con el mismo scrape, ver `lib/score.ts`).
 *
 * Este bloque muestra los componentes con su peso y con la metrica cruda de la
 * que salen. Es el subproducto mas barato del TAB 3 y el mas alto en
 * percepcion de rigor, y por eso va ARRIBA, no plegado al fondo.
 *
 * DOS DECISIONES A PROPOSITO:
 *
 * 1. LOS COMPONENTES OMITIDOS SE MUESTRAN. Es contraintuitivo: declarar "esto
 *    no lo pude medir" parece debilidad. Es lo contrario. Un vendedor con
 *    experiencia detecta un dato inventado en veinte segundos, y cuando
 *    detecta uno descree de todos. Decir que Mercado Libre no publica las
 *    unidades vendidas de esta categoria es la prueba de que el resto de los
 *    numeros si se midieron.
 *
 * 2. NO SE MUESTRA BLUREADO NI GATEADO POR PLAN. Es el generador de confianza
 *    gratis del producto. Taparlo es cobrar por la unica parte que convence al
 *    que todavia no pago.
 */

function pct(puntos: number, maximo: number): number {
  if (maximo <= 0) return 0;
  return Math.max(0, Math.min(100, (puntos / maximo) * 100));
}

/** Verde/amarillo/rojo segun cuanto del maximo se llevo el componente. */
function barraColor(p: number): string {
  if (p >= 70) return "bg-[#16A34A]";
  if (p >= 40) return "bg-yellow-400";
  return "bg-red-400";
}

export function DesgloseScore({
  detalle,
  score,
}: {
  detalle: NonNullable<AnalysisResult["score_detalle"]> | null | undefined;
  score: number;
}) {
  // Analisis anteriores al 20/9: no tienen desglose porque el score lo derivaba
  // el modelo. No hay nada honesto que mostrar, entonces no se muestra nada.
  if (!detalle || !detalle.componentes?.length) return null;

  const { componentes, omitidos, puntos_obtenidos, puntos_posibles } = detalle;

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-50">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-base font-semibold text-gray-900">
            De qué se compone el {score}
          </h2>
          <span className="font-mono text-xs text-gray-400 tabular-nums">
            {puntos_obtenidos} de {puntos_posibles} puntos medibles
          </span>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Calculado en código sobre las publicaciones reales. Mismos datos, mismo
          número, siempre.
        </p>
      </div>

      <div className="divide-y divide-gray-50">
        {componentes.map((c) => {
          const p = pct(c.puntos, c.maximo);
          return (
            <div key={c.id} className="px-4 sm:px-6 py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-gray-900">{c.nombre}</span>
                <span className="font-mono text-sm text-gray-900 tabular-nums shrink-0">
                  {c.puntos}
                  <span className="text-gray-300">/{c.maximo}</span>
                </span>
              </div>

              <div className="mt-2 h-1 w-full rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${barraColor(p)}`}
                  style={{ width: `${p}%` }}
                />
              </div>

              {/* La metrica cruda es lo que el usuario no puede sacar en 3
                  minutos mirando Mercado Libre. Va visible, no plegada. */}
              <p className="mt-2 text-xs text-gray-600">{c.metrica}</p>
              <p className="mt-0.5 text-xs text-gray-400">{c.lectura}</p>
            </div>
          );
        })}
      </div>

      {omitidos?.length > 0 && (
        <div className="px-4 sm:px-6 py-3.5 bg-gray-50/60 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 mb-1.5">
            No computado — sin datos para medirlo
          </p>
          <ul className="space-y-1">
            {omitidos.map((o) => (
              <li key={o.id} className="text-xs text-gray-400">
                <span className="text-gray-500">{o.nombre}:</span> {o.motivo}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-gray-400">
            Estos bloques no suman cero: salen del total. El score se calcula
            sobre los {puntos_posibles} puntos que sí se pudieron medir.
          </p>
        </div>
      )}

      {detalle.techo_aplicado != null && (
        <div className="px-4 sm:px-6 py-3 border-t border-yellow-200 bg-yellow-50/70">
          <p className="text-xs text-[#854D0E]">
            <strong className="font-semibold">
              Techo de {detalle.techo_aplicado} aplicado
            </strong>{" "}
            {detalle.motivo_techo ? `— ${detalle.motivo_techo}.` : "."}{" "}
            {detalle.score_bruto > detalle.techo_aplicado && (
              <>Sin ese límite el cálculo daba {detalle.score_bruto}.</>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
