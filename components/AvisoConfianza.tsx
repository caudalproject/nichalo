import Link from "next/link";
import type { Confianza, PrecioStats } from "@/lib/confianza";
import { explicarConfianza } from "@/lib/confianza";

/**
 * Aviso de confianza baja/media.
 *
 * Va ARRIBA de los numeros, no al final. Antes el warning de dispersion vivia
 * despues de cinco secciones de output seguro de si mismo (resumen, titulo
 * sugerido, etc.), asi que el lector ya habia internalizado el veredicto
 * cuando llegaba la advertencia. Si los datos son malos, esa es la primera
 * cosa que hay que saber, no una nota al pie.
 *
 * El tono es deliberadamente no-defensivo: dice que salio mal, por que, y que
 * hacer al respecto. Un disclaimer generico ("los resultados son estimativos")
 * destruye confianza sin dar nada a cambio; este explica el mecanismo.
 */
export function AvisoConfianza({
  confianza,
  stats,
  formatear,
  sugerencia,
  reintento,
}: {
  confianza: Confianza | null | undefined;
  stats: Pick<PrecioStats, "precio_minimo" | "precio_maximo"> | null | undefined;
  formatear: (n: number) => string;
  /** Termino de busqueda mas especifico, si aplica. */
  sugerencia?: string | null;
  /**
   * Oferta de reintento sin costo. Solo se pasa cuando el analisis es del
   * usuario logueado, tiene confianza baja y todavia no genero un reintento.
   */
  reintento?: { href: string } | null;
}) {
  if (!confianza || confianza.nivel === "alta" || !stats) return null;

  const texto = explicarConfianza(confianza, stats, formatear);
  if (!texto) return null;

  const esBaja = confianza.nivel === "baja";

  return (
    <div
      className={`rounded-xl border px-4 py-3.5 ${
        esBaja
          ? "border-amber-300 bg-amber-50"
          : "border-[#E5E7EB] bg-[#F9FAFB]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-base">{esBaja ? "⚠️" : "ℹ️"}</span>
        <div className="min-w-0 space-y-1.5">
          <p
            className={`text-sm font-semibold ${
              esBaja ? "text-amber-900" : "text-[#0A0A0A]"
            }`}
          >
            {esBaja
              ? "Los datos de este análisis no son confiables"
              : "Este análisis tiene menos respaldo del habitual"}
          </p>
          <p
            className={`text-sm leading-relaxed ${
              esBaja ? "text-amber-800" : "text-[#6B7280]"
            }`}
          >
            {texto.charAt(0).toUpperCase() + texto.slice(1)}.
          </p>
          {esBaja && (
            <p className="text-sm leading-relaxed text-amber-800">
              Por eso, más abajo el margen y el ROI aparecen sin destacar y el
              veredicto es más conservador: preferimos no darte un número que
              parezca preciso cuando no lo es.
            </p>
          )}
          {sugerencia && (
            <p className="text-sm text-amber-800">
              Probá de nuevo con un término más específico, por ejemplo{" "}
              <strong className="font-semibold">“{sugerencia}”</strong>.
            </p>
          )}
          {confianza.n_descartados > 0 && (
            <p
              className={`text-xs ${
                esBaja ? "text-amber-700" : "text-[#6B7280]"
              }`}
            >
              Descartamos {confianza.n_descartados}{" "}
              {confianza.n_descartados === 1 ? "publicación" : "publicaciones"}{" "}
              fuera de rango antes de calcular los promedios.
            </p>
          )}
          {/* Si le dijimos que sus datos no servian, el reintento va por
              nuestra cuenta. Cobrarselo seria el verdadero golpe a la
              credibilidad: le avisamos que el resultado no servia y le
              descontamos un credito igual. Cuesta ~$102 ARS. */}
          {reintento && (
            <div className="pt-1">
              <Link
                href={reintento.href}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#0A0A0A] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0A0A0A]/85"
              >
                Reintentar sin gastar tu crédito
              </Link>
              <p className="mt-1.5 text-xs text-amber-700">
                Este análisis no te sirvió, así que el reintento va por nuestra
                cuenta. Una vez por análisis.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
