import { formatearValor } from "@/lib/delta";
import type { Delta, CambioNumerico } from "@/lib/delta";

/**
 * La vista del delta. TAB 5 (21/9/2026).
 *
 * Hereda las dos decisiones del DesgloseScore del TAB 4, por el mismo motivo:
 *
 * 1. LO QUE NO SE PUDO MEDIR SE DECLARA. Un campo que Mercado Libre no publica
 *    se muestra como "sin dato", nunca como un delta de 0. Decir "0%" cuando el
 *    dato no existe es afirmar que el mercado no cambio, que es una mentira
 *    mas cara que el silencio. Hasta el fix del 21/9 en lib/apify.ts, tres de
 *    estas filas mentian asi.
 *
 * 2. NO VA GATEADO POR PLAN. Que se vende con esto lo decide el TAB 6.
 */

// El formateo se mudo a lib/delta.ts en el TAB 5.1: el mail semanal escribe los
// mismos numeros y no pueden divergir de los de esta pantalla.
const fmt = formatearValor;

/** Verde si el cambio favorece al que quiere vender, rojo si lo perjudica.
 *  El color sale de `bueno_si`, no del signo: mas vendedores es un numero que
 *  sube y una noticia que empeora. */
function tono(c: CambioNumerico): string {
  if (!c.material || c.direccion === "igual" || c.bueno_si === "neutro")
    return "text-gray-500";
  const bueno = c.bueno_si === c.direccion;
  return bueno ? "text-[#16A34A]" : "text-red-500";
}

function Flecha({ d }: { d: CambioNumerico["direccion"] }) {
  if (d === "igual") return <span className="text-gray-300">→</span>;
  return <span>{d === "sube" ? "↑" : "↓"}</span>;
}

export function VistaDelta({ delta }: { delta: Delta }) {
  const conDato = delta.cambios.filter((c) => !c.sin_dato);
  const sinDato = delta.cambios.filter((c) => c.sin_dato);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="px-4 sm:px-6 pt-5 pb-4 border-b border-gray-50">
        <h2 className="text-base font-semibold text-gray-900">{delta.titular}</h2>
        <p className="mt-1 text-xs text-gray-500">
          Comparado con la medición del{" "}
          {new Date(delta.desde).toLocaleDateString("es-AR", {
            day: "numeric",
            month: "long",
          })}
          . Todo medido sobre las publicaciones reales, sin inteligencia
          artificial de por medio.
        </p>
      </div>

      {/* Vendedores primero: es el cambio que mueve una decision. */}
      {delta.vendedores && (
        <div className="px-4 sm:px-6 py-4 border-b border-gray-50">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium text-gray-900">
              Quién compite
            </span>
            <span className="font-mono text-xs text-gray-400 tabular-nums">
              {delta.vendedores.antes} → {delta.vendedores.ahora} vendedores
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {delta.vendedores.nuevos.slice(0, 8).map((v) => (
              <span
                key={v}
                className="rounded-full bg-red-50 px-2.5 py-1 text-xs text-red-600"
              >
                + {v}
              </span>
            ))}
            {delta.vendedores.salieron.slice(0, 8).map((v) => (
              <span
                key={v}
                className="rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-400 line-through"
              >
                {v}
              </span>
            ))}
            {delta.vendedores.nuevos.length === 0 &&
              delta.vendedores.salieron.length === 0 && (
                <span className="text-xs text-gray-400">
                  Los mismos {delta.vendedores.se_mantienen} vendedores que la
                  vez pasada.
                </span>
              )}
          </div>
        </div>
      )}

      <div className="divide-y divide-gray-50">
        {conDato.map((c) => (
          <div
            key={c.id}
            className="px-4 sm:px-6 py-3 flex items-baseline justify-between gap-3"
          >
            <span className="text-sm text-gray-700">{c.etiqueta}</span>
            <span className="font-mono text-xs tabular-nums whitespace-nowrap">
              <span className="text-gray-400">{fmt(c.antes, c.formato)}</span>{" "}
              <span className={tono(c)}>
                <Flecha d={c.direccion} /> {fmt(c.ahora, c.formato)}
                {c.material && c.delta_pct !== null && (
                  <span className="ml-1">
                    ({c.delta_pct > 0 ? "+" : ""}
                    {Math.round(c.delta_pct * 100)}%)
                  </span>
                )}
              </span>
            </span>
          </div>
        ))}
      </div>

      {/* El score, aparte y con su condicion escrita. */}
      <div className="px-4 sm:px-6 py-3.5 border-t border-gray-50 bg-gray-50/50">
        {delta.score.comparable ? (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-gray-700">Score del producto</span>
            <span className="font-mono text-xs tabular-nums">
              <span className="text-gray-400">{delta.score.antes}</span>{" "}
              <span
                className={
                  (delta.score.delta ?? 0) > 0
                    ? "text-[#16A34A]"
                    : (delta.score.delta ?? 0) < 0
                      ? "text-red-500"
                      : "text-gray-500"
                }
              >
                → {delta.score.ahora}
              </span>
            </span>
          </div>
        ) : (
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-600">
              Score no comparable.
            </span>{" "}
            {delta.score.motivo}
          </p>
        )}
      </div>

      {sinDato.length > 0 && (
        <div className="px-4 sm:px-6 py-3 border-t border-gray-50">
          <p className="text-xs text-gray-400">
            Sin dato del scrape:{" "}
            {sinDato.map((c) => c.etiqueta.toLowerCase()).join(", ")}. Mercado
            Libre no publica estos campos en los resultados de búsqueda, así que
            no se puede decir si cambiaron.
          </p>
        </div>
      )}
    </div>
  );
}
