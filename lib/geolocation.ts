// Modulo puro: sin `next/headers`, sin `use client`.
// Se importa igual desde Server Components y desde el browser, asi que la
// landing puede quedar estatica (○) y resolver el pais del lado cliente.
//
// El pais lo detecta el middleware (edge) y lo deja en la cookie PAIS_COOKIE.

export type PaisDetectado = "AR" | "MX" | "CO";

export const PAIS_COOKIE = "pais";
export const PAIS_DEFAULT: PaisDetectado = "AR";

const PRECIOS: Record<PaisDetectado, { starter: string; pro: string; moneda: string }> = {
  AR: { starter: "$17.000", pro: "$41.000", moneda: "ARS" },
  MX: { starter: "$210", pro: "$510", moneda: "MXN" },
  CO: { starter: "$50.000", pro: "$120.000", moneda: "COP" },
};

const MONEDA_LARGA: Record<PaisDetectado, string> = {
  AR: "pesos argentinos (ARS)",
  MX: "pesos mexicanos (MXN)",
  CO: "pesos colombianos (COP)",
};

const NOTA_STARTER: Record<PaisDetectado, string> = {
  AR: "~$1.700 ARS por análisis",
  MX: "~$21 MXN por análisis",
  CO: "~$5.000 COP por análisis",
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

export function getNotaStarter(pais: PaisDetectado) {
  return NOTA_STARTER[pais];
}
