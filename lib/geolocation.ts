// Modulo puro: sin `next/headers`, sin `use client`.
// Se importa igual desde Server Components y desde el browser, asi que la
// landing puede quedar estatica (○) y resolver el pais del lado cliente.
//
// El pais lo detecta el middleware (edge) y lo deja en la cookie PAIS_COOKIE.

export type PaisDetectado = "AR" | "MX" | "CO";

export const PAIS_COOKIE = "pais";
export const PAIS_DEFAULT: PaisDetectado = "AR";

// Starter (suscripción) se eliminó del modelo de negocio (ver Diario de
// Decisiones 2026-09-12) — reemplazado por packs de créditos sin
// vencimiento, vendidos solo en ARS por ahora. Pro bajó de $41.000 a
// $16.000 ARS/mes con el nuevo modelo. Los precios MX/CO de Pro quedan sin
// actualizar (pendiente definir conversión) hasta tener cifras confirmadas.
const PRECIOS: Record<PaisDetectado, { pro: string; moneda: string }> = {
  AR: { pro: "$16.000", moneda: "ARS" },
  MX: { pro: "$510", moneda: "MXN" },
  CO: { pro: "$120.000", moneda: "COP" },
};

const MONEDA_LARGA: Record<PaisDetectado, string> = {
  AR: "pesos argentinos (ARS)",
  MX: "pesos mexicanos (MXN)",
  CO: "pesos colombianos (COP)",
};

/** Normaliza un ISO-3166 alpha-2 arbitrario a los tres paises soportados. */
export function normalizarPais(raw: string | null | undefined): PaisDetectado {
  const code = raw?.trim().toUpperCase();
  if (code === "MX") return "MX";
  if (code === "CO") return "CO";
  return PAIS_DEFAULT;
}

export function getPreciosPorPais(pais: PaisDetectado) {
  return PRECIOS[pais];
}

export function getMonedaLarga(pais: PaisDetectado) {
  return MONEDA_LARGA[pais];
}
