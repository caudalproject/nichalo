import { headers } from "next/headers";

export type PaisDetectado = "AR" | "MX" | "CO";

const PRECIOS: Record<PaisDetectado, { starter: string; pro: string; moneda: string }> = {
  AR: { starter: "$17.000", pro: "$41.000", moneda: "ARS" },
  MX: { starter: "$210", pro: "$510", moneda: "MXN" },
  CO: { starter: "$50.000", pro: "$120.000", moneda: "COP" },
};

export function getPaisFromHeaders(): PaisDetectado {
  const headersList = headers();
  const country =
    headersList.get("x-vercel-ip-country") ??
    headersList.get("cf-ipcountry") ??
    "AR";
  if (country === "MX") return "MX";
  if (country === "CO") return "CO";
  return "AR";
}

export function getPreciosPorPais(pais: PaisDetectado) {
  return PRECIOS[pais];
}
