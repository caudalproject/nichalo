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
  busqueda,
  reintento,
}: {
  confianza: Confianza | null | undefined;
  stats: Pick<PrecioStats, "precio_minimo" | "precio_maximo"> | null | undefined;
  formatear: (n: number) => string;
  /**
   * Con que se scrapeo REALMENTE. Antes existia una prop `sugerencia` para
   * proponer "un termino mas especifico", pero el unico caller nunca la pasaba
   * — era codigo muerto — y ademas proponia algo que el sistema no sabia: la
   * sugerencia util no es otra palabra inventada, es decirle al usuario con que
   * se busco para que EL la corrija. Eso es lo que muestra esto.
   */
  busqueda?: { termino: string; desdeFoto: boolean } | null;
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
          {busqueda && (
            <p className={`text-sm ${esBaja ? "text-amber-800" : "text-[#6B7280]"}`}>
              Buscamos en Mercado Libre con{" "}
              <strong className="font-semibold">“{busqueda.termino}”</strong>
              {busqueda.desdeFoto ? " (lo derivamos de tu foto)" : ""}. Si eso no
              describe exactamente tu producto, cambiá el término al reintentar —
              es lo que más mueve la aguja.
            </p>
          )}
          {/* Dos lineas distintas y en este orden: primero "no era el
              producto" (la causa que el usuario puede corregir cambiando el
              termino) y despues "fuera de rango" (limpieza estadistica, que no
              depende de el). Juntarlas en una sola frase las volvia ruido. */}
          {(confianza.n_irrelevantes ?? 0) > 0 && (
            <p
              className={`text-xs ${
                esBaja ? "text-amber-700" : "text-[#6B7280]"
              }`}
            >
              Descartamos {confianza.n_irrelevantes}{" "}
              {confianza.n_irrelevantes === 1 ? "publicación" : "publicaciones"}{" "}
              que no eran este producto
              {confianza.muestra_irrelevante && confianza.muestra_irrelevante.length > 0
                ? ` (por ejemplo: “${confianza.muestra_irrelevante[0]}”)`
                : ""}
              . Los números de abajo se calcularon sin ellas.
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
