import { MercadoPagoConfig, PreApproval, Preference, Payment } from "mercadopago";

export const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

export const preApproval = new PreApproval(mp);
export const preference = new Preference(mp);
export const payment = new Payment(mp);

// Suscripción mensual recurrente. Starter se eliminó del modelo de negocio
// (ver Diario de Decisiones 2026-09-12) — se deja de vender pero no se borra
// del histórico ni de ningún enum de DB (plan es text, no hay enum).
export const PLANES = {
  pro: {
    nombre: "Nichalo Pro",
    precio: 16000,
    moneda: "ARS",
    analisis: 30,
    plan: "pro" as const,
  },
} as const;

// Packs de créditos: pago único, sin vencimiento. NO cambian el plan del
// usuario — solo suman a analisis_restantes (ver purchases.creditos_otorgados).
export const PACKS = {
  pack_3: {
    nombre: "Pack 3 análisis",
    precio: 4500,
    moneda: "ARS",
    creditos: 3,
    pack: "pack_3" as const,
  },
  pack_10: {
    nombre: "Pack 10 análisis",
    precio: 12000,
    moneda: "ARS",
    creditos: 10,
    pack: "pack_10" as const,
  },
} as const;
