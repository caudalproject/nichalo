import { MercadoPagoConfig, PreApproval } from "mercadopago";

export const mp = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

export const preApproval = new PreApproval(mp);

export const PLANES = {
  starter: {
    nombre: "Nichalo Starter",
    precio: 17000,
    moneda: "ARS",
    analisis: 10,
    plan: "starter" as const,
  },
  pro: {
    nombre: "Nichalo Pro",
    precio: 41000,
    moneda: "ARS",
    analisis: 30,
    plan: "pro" as const,
  },
} as const;
