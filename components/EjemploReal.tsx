import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EJEMPLO_REAL, FEATURED_RESULT_ID } from "@/lib/ejemplo-real";

/**
 * Seccion "#ejemplo" — reemplaza a la vieja "Esto es lo que vas a ver", que
 * repetia por cuarta vez el mock del cargador inalambrico.
 *
 * No repite la card del hero: muestra la CONTINUACION del mismo informe real
 * (competencia, margen, riesgos), asi el analisis aparece una sola vez y este
 * bloque agrega informacion en vez de volver a decir lo mismo.
 *
 * El bloque borroso del final ya no contradice al Free. Antes decia
 * "Competencia, margenes y recomendaciones completas" con un candado, cuando
 * la card de Free promete "primer analisis completo — sin restricciones"
 * (auditoria 13/9, problema 7). Ahora dice lo que el codigo realmente hace:
 * el primer analisis de una cuenta free se ve entero (`isPrimerAnalisis` en
 * app/resultado/[id]/page.tsx), y el bloqueo empieza en el segundo.
 */
export function EjemploReal() {
  return (
    <section id="ejemplo" className="container py-20 scroll-mt-16">
      <div className="mx-auto max-w-3xl text-center mb-10">
        <h2 className="text-3xl font-bold text-[#0A0A0A]">
          Mirá un análisis real, entero
        </h2>
        <p className="mt-3 text-[#6B7280]">
          No es una maqueta: es un análisis que corrió Nichalo, público y
          verificable.
        </p>
      </div>

      <div className="mx-auto max-w-3xl">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-6 md:px-8 md:py-8">
            <p className="text-xs text-gray-400 mb-6">
              {EJEMPLO_REAL.producto} · {EJEMPLO_REAL.pais} ·{" "}
              {EJEMPLO_REAL.publicacionesAnalizadas} publicaciones ·{" "}
              <span className="text-green-700 font-medium">
                score {EJEMPLO_REAL.score} · {EJEMPLO_REAL.veredicto}
              </span>
            </p>

            {/* Competencia */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Competencia
            </p>
            <div className="grid grid-cols-3 gap-2 md:gap-3 mb-4">
              {[
                { label: "Precio mínimo", value: EJEMPLO_REAL.precioMinimo },
                { label: "Precio promedio", value: EJEMPLO_REAL.precioPromedio },
                { label: "Precio máximo", value: EJEMPLO_REAL.precioMaximo },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-center"
                >
                  <div className="text-xs text-gray-500 leading-tight">{m.label}</div>
                  <div className="mt-1 text-sm md:text-base font-bold text-gray-900">
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            <div className="space-y-1.5 mb-8">
              {EJEMPLO_REAL.distribucion.map((d) => (
                <div key={d.rango} className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500 w-28 md:w-32 shrink-0">{d.rango}</span>
                  <span
                    className="h-2 rounded-full bg-green-500/70"
                    style={{ width: `${d.cantidad * 22}px` }}
                  />
                  <span className="text-gray-400">{d.cantidad}</span>
                </div>
              ))}
            </div>

            {/* Margen — el unico lugar de la landing donde aparece, con el
                costo al lado para que el numero se pueda auditar. */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Tu margen con este costo
            </p>
            <div className="rounded-xl border border-gray-100 divide-y divide-gray-100 mb-8">
              {[
                { label: "Tu costo por unidad", value: EJEMPLO_REAL.costo },
                { label: "Precio sugerido de venta", value: EJEMPLO_REAL.precioSugerido },
                { label: "Comisión de Mercado Libre", value: `− ${EJEMPLO_REAL.comisionMl}` },
              ].map((r) => (
                <div key={r.label} className="flex justify-between px-4 py-2.5 text-sm">
                  <span className="text-gray-500">{r.label}</span>
                  <span className="font-medium text-gray-900">{r.value}</span>
                </div>
              ))}
              <div className="flex justify-between px-4 py-2.5 text-sm bg-green-50/60">
                <span className="font-medium text-gray-900">Ganancia por unidad</span>
                <span className="font-bold text-green-700">
                  {EJEMPLO_REAL.ganancia}{" "}
                  <span className="font-normal text-green-700/70">
                    ({EJEMPLO_REAL.margenPorcentaje})
                  </span>
                </span>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-8">
              El precio sugerido no garantiza ganancia: comisión de ML, envío e
              impuestos consumen el margen.
            </p>

            {/* Riesgos — textuales del analisis real */}
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Riesgos detectados
            </p>
            <ul className="space-y-2">
              {EJEMPLO_REAL.riesgos.map((r) => (
                <li key={r} className="flex items-start gap-2.5 text-sm text-gray-700">
                  <span className="text-amber-500 mt-0.5 shrink-0">▲</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Lo que falta del informe. Blur solido + skeletons: antes el blur
            dejaba el texto medio legible y parecia un error de render. */}
        <div className="relative overflow-hidden mt-3">
          <div
            className="blur-[5px] pointer-events-none select-none bg-white rounded-2xl border border-gray-100 p-6 md:p-8 space-y-5"
            aria-hidden
          >
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Recomendación
              </p>
              <div className="space-y-2">
                <div className="h-3 bg-gray-300 rounded w-full" />
                <div className="h-3 bg-gray-300 rounded w-11/12" />
                <div className="h-3 bg-gray-300 rounded w-3/4" />
                <div className="h-3 bg-gray-300 rounded w-5/6" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Productos con mejor oportunidad
              </p>
              <div className="space-y-2">
                <div className="h-3 bg-gray-300 rounded w-5/6" />
                <div className="h-3 bg-gray-300 rounded w-2/3" />
                <div className="h-3 bg-gray-300 rounded w-3/4" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Diferenciadores y oportunidad
              </p>
              <div className="space-y-2">
                <div className="h-3 bg-gray-300 rounded w-full" />
                <div className="h-3 bg-gray-300 rounded w-4/5" />
                <div className="h-3 bg-gray-300 rounded w-11/12" />
                <div className="h-3 bg-gray-300 rounded w-3/5" />
              </div>
            </div>
          </div>

          {/* Overlay liviano + tarjeta solida para el copy. Un velo parejo y
              opaco sobre todo el bloque (se probo con white/70 y white/85)
              borra los skeletons y deja una caja blanca vacia — justo lo
              contrario de lo que este bloque tiene que transmitir. Asi el
              contenido tapado se ve alrededor y el mensaje igual se lee. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/30 rounded-2xl px-4">
            <div className="w-full max-w-sm rounded-xl border border-gray-200 bg-white px-5 py-5 text-center shadow-lg">
              <p className="text-sm font-semibold text-gray-900 mb-1">
                Tu primer análisis lo ves completo
              </p>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                La recomendación y los productos alternativos entran en el
                análisis gratis. Se bloquean del segundo en adelante, no en el
                primero.
              </p>
              <Link href="/login">
                <Button className="rounded-full bg-[#16A34A] hover:bg-[#15803D] text-white px-6">
                  Empezar gratis →
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-sm">
          <a
            href={`/resultado/${FEATURED_RESULT_ID}`}
            className="text-[#16A34A] hover:underline font-medium"
          >
            Mirá este análisis real, sin registrarte →
          </a>
        </p>
      </div>
    </section>
  );
}
