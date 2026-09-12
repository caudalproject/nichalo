"use client";

import { useEffect, useState } from "react";
import {
  PAIS_COOKIE,
  PAIS_DEFAULT,
  getMonedaLarga,
  getPreciosPorPais,
  normalizarPais,
  type PaisDetectado,
} from "@/lib/geolocation";

/**
 * Lee el pais que el middleware dejo en la cookie.
 *
 * El primer render (servidor y cliente) usa PAIS_DEFAULT, asi que el HTML
 * prerenderizado y la hidratacion coinciden. El ajuste al pais real ocurre en
 * el efecto. Es aceptable porque la seccion de precios esta muy abajo en la
 * pagina: nadie la ve antes de que hidrate.
 */
function usePais(): PaisDetectado {
  const [pais, setPais] = useState<PaisDetectado>(PAIS_DEFAULT);

  useEffect(() => {
    const match = document.cookie.match(
      new RegExp("(?:^|;\\s*)" + PAIS_COOKIE + "=([^;]*)")
    );
    if (!match) return;
    setPais(normalizarPais(decodeURIComponent(match[1])));
  }, []);

  return pais;
}

export function PrecioPlan({ plan }: { plan: "pro" }) {
  const pais = usePais();
  return <>{getPreciosPorPais(pais)[plan]}</>;
}

export function MonedaPais() {
  const pais = usePais();
  return <>{getMonedaLarga(pais)}</>;
}
