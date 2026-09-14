"use client";

import { useEffect, useRef } from "react";
import { EJEMPLO_REAL, FEATURED_RESULT_ID } from "@/lib/ejemplo-real";

declare function fbq(...args: unknown[]): void;

/**
 * La card del hero. Reemplaza al viejo HeroMock (producto inventado, score 78)
 * por el analisis real destacado — ver lib/ejemplo-real.ts.
 *
 * Las dos metricas que se muestran son deliberadamente las dos verificables:
 * cuantas publicaciones se scrapearon y a que precio promedio estan. Un
 * visitante que vende en ML puede buscar el producto y comprobarlas en diez
 * segundos. El margen (71,9%) NO va aca a proposito: es un numero derivado,
 * no chequeable desde afuera, y en el hero se lee como inventado — que es
 * exactamente el problema que esta pagina venia teniendo. El margen aparece
 * una sola vez, mas abajo, en EjemploReal, con el costo al lado.
 */
export function HeroResultadoReal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          if (typeof fbq !== "undefined") {
            fbq("track", "ViewContent");
          }
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="mt-8 mx-auto max-w-sm text-left">
      <div className="bg-white rounded-2xl border border-gray-100 shadow-md overflow-hidden">
        {/* Barra verde superior */}
        <div className="h-1.5 w-full bg-green-500" />

        <div className="px-4 py-4">
          {/* Badge + label */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xs font-semibold tracking-widest uppercase px-2.5 py-0.5 rounded-full bg-green-50 text-green-700">
              {EJEMPLO_REAL.veredicto}
            </span>
            <span className="text-xs text-gray-400">Mercado con oportunidad real</span>
          </div>

          {/* Score */}
          <div className="flex items-baseline gap-1.5 mb-3">
            <span className="text-5xl font-black leading-none text-green-500">
              {EJEMPLO_REAL.score}
            </span>
            <span className="text-lg text-gray-300 font-light">/100</span>
          </div>

          {/* Producto */}
          <p className="text-sm font-semibold text-gray-900 mb-0.5">
            {EJEMPLO_REAL.producto}
          </p>
          <p className="text-xs text-gray-400 mb-3">
            {EJEMPLO_REAL.pais} · {EJEMPLO_REAL.publicacionesAnalizadas} publicaciones
            analizadas
          </p>

          {/* Metricas — las dos verificables (ver comentario arriba) */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-center">
              <div className="text-xs text-gray-500 leading-tight">
                Publicaciones analizadas
              </div>
              <div className="mt-1 text-base font-bold text-gray-900">
                {EJEMPLO_REAL.publicacionesAnalizadas}
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-center">
              <div className="text-xs text-gray-500 leading-tight">
                Precio promedio del mercado
              </div>
              <div className="mt-1 text-base font-bold text-gray-900">
                {EJEMPLO_REAL.precioPromedio}
              </div>
            </div>
          </div>

          {/* Resumen — textual del analisis real */}
          <div className="rounded-xl border border-gray-100 p-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Resumen
            </p>
            <p className="text-xs text-gray-700 leading-relaxed">
              {EJEMPLO_REAL.resumen}
            </p>
          </div>
        </div>
      </div>

      <p className="mt-2 text-center text-xs text-gray-400">
        Análisis real hecho con Nichalo ·{" "}
        <a
          href={`/resultado/${FEATURED_RESULT_ID}`}
          className="text-[#16A34A] hover:underline"
        >
          abrirlo →
        </a>
      </p>
    </div>
  );
}
