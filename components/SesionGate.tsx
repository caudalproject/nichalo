"use client";

import type { ReactNode } from "react";
import { useSesionCliente } from "@/lib/useSesionCliente";

/**
 * Corte de la landing por sesion (auditoria 13/9, problema 9: el usuario
 * logueado seguia viendo testimonios, planes y FAQ vendiendole algo que ya
 * compro).
 *
 * Por que client-side y no un redirect en middleware: `/planes` redirige al
 * ancla `/#planes` de la landing, asi que sacar al logueado de `/` le corta
 * el camino de upgrade (ver el comentario en middleware.ts). La landing se
 * sigue sirviendo para todos; lo que cambia es que secciones se renderizan.
 *
 * Por que no rompe el prerender: la landing es 100% estatica y
 * `useSesionCliente()` arranca en el estado anonimo, asi que el HTML
 * generado en build contiene TODAS las secciones de venta. Ese es el caso
 * mayoritario (trafico de Meta Ads) y el que le importa al SEO. El logueado
 * ve el colapso de secciones despues de hidratar, siempre por debajo del
 * fold — el hero de arriba ya resuelve su propio estado sin salto de layout.
 */

/** Solo para visitantes sin sesion. */
export function SoloAnonimo({ children }: { children: ReactNode }) {
  const { clientEmail } = useSesionCliente();
  if (clientEmail != null) return null;
  return <>{children}</>;
}

/**
 * Se oculta solo para quien ya esta en Pro. Free y packs siguen viendo los
 * planes: es su unico camino de upgrade dentro del producto.
 */
export function SoloSinPro({ children }: { children: ReactNode }) {
  const { clientEmail, plan } = useSesionCliente();
  if (clientEmail != null && plan === "pro") return null;
  return <>{children}</>;
}

/** Inverso de SoloAnonimo: solo para quien tiene sesion. */
export function SoloLogueado({ children }: { children: ReactNode }) {
  const { clientEmail } = useSesionCliente();
  if (clientEmail == null) return null;
  return <>{children}</>;
}
