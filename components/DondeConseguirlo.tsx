"use client";

import { MarcaVista } from "@/components/MarcaVista";
import type { BloqueProveedores } from "@/lib/proveedores";

/**
 * Acto 3 — "Donde conseguir este producto". TAB 8 del plan de tabs (11/10/2026).
 *
 * Cierra el loop "ya se que es viable, ahora donde lo compro" con links
 * reales y curados a mano (`lib/proveedores.ts`), no con un rango mayorista
 * inventado por el modelo (ese campo se borro el 21/9).
 *
 * No gateado por plan: no sale de Gemini y es el dato que el tab vino a
 * medir. Cuantos mas lo ven, antes se puede decidir el marketplace.
 *
 * Medicion: `vio_proveedores` cuando entra en pantalla (MarcaVista) y
 * `click_proveedor` por link. El POST va con keepalive y el link abre en
 * pestaña nueva, asi que medir nunca demora ni rompe la navegacion. Sin
 * sesion no se anota nada (el embudo es de usuarios registrados).
 */
export function DondeConseguirlo({ bloque }: { bloque: BloqueProveedores }) {
  const marcarClick = (origen: string) => {
    fetch("/api/eventos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ evento: "click_proveedor", origen }),
      keepalive: true,
    }).catch(() => {});
  };

  return (
    <MarcaVista origen={bloque.categoriaSlug} evento="vio_proveedores">
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">
          Dónde conseguir este producto
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          Búsquedas armadas con{" "}
          <span className="font-medium text-gray-700 break-words">“{bloque.termino}”</span>.
          Nichalo no vende ni avala proveedores: compará precio, mínimo de compra y
          envío antes de pagar.
        </p>
        <div className="space-y-3">
          {bloque.links.map((l) => (
            <a
              key={l.id}
              href={l.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              onClick={() => marcarClick(l.origen)}
              onAuxClick={() => marcarClick(l.origen)}
              className="flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
            >
              <div className="min-w-0">
                <span className="block text-sm font-medium text-gray-900">{l.nombre}</span>
                <span className="block text-xs text-gray-500 mt-0.5">{l.nota}</span>
              </div>
              <span className="shrink-0 text-sm text-gray-400" aria-hidden>
                ↗
              </span>
            </a>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-4">
          Si importás, sumale al precio el envío y los impuestos: ese total es el costo
          que tenés que cargar cuando lo analices.
        </p>
      </div>
    </MarcaVista>
  );
}
