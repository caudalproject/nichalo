"use client";

import { usePais } from "@/components/PreciosPais";
import { PackToggleCard } from "@/components/PackToggleCard";

/**
 * Los packs se venden solo en Argentina por ahora (ver brief-rediseno-precios,
 * punto 2). El primer render usa PAIS_DEFAULT = "AR" (mismo trade-off ya
 * aceptado en PreciosPais.tsx: la seccion de precios esta muy abajo, nadie la
 * ve antes de que hidrate), asi que el HTML estatico siempre arranca
 * mostrando la card de packs y la cambia por el mensaje en el efecto si el
 * pais real no es AR. No hay salto de layout para AR (la mayoria del
 * trafico), y el salto para MX/CO ocurre fuera del viewport inicial.
 */
export function PacksZone() {
  const pais = usePais();

  if (pais !== "AR") {
    return (
      <div className="h-full rounded-lg border border-[#E5E7EB] bg-white p-6 flex items-center">
        <p className="text-sm text-[#6B7280] text-center w-full">
          Los packs de análisis están disponibles por ahora solo en Argentina.
        </p>
      </div>
    );
  }

  return <PackToggleCard />;
}
