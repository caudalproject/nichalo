"use client";

import { useEffect, useState } from "react";

type SupabaseBrowser = ReturnType<
  typeof import("@/lib/supabase")["createSupabaseBrowserClient"]
>;

// El SDK de Supabase pesa ~85 kB. Se carga bajo demanda y una sola vez,
// compartido entre todos los componentes que consuman este hook (Navbar,
// HeroSection, ...).
let supabasePromise: Promise<SupabaseBrowser> | null = null;

function getSupabase(): Promise<SupabaseBrowser> {
  if (!supabasePromise) {
    supabasePromise = import("@/lib/supabase").then((m) =>
      m.createSupabaseBrowserClient()
    );
  }
  return supabasePromise;
}

/**
 * Hay cookie de sesion de Supabase? Evita bajar el SDK para el visitante
 * anonimo, que es el caso comun en la landing. Supabase parte el token en
 * `sb-<ref>-auth-token.0`, `.1`, ... cuando no entra en una cookie.
 */
function haySesionEnCookies(): boolean {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)sb-[^=;]*-auth-token(?:\.\d+)?=/.test(document.cookie);
}

export interface SesionCliente {
  clientEmail: string | null;
  clientName: string | null;
  plan: string;
  analisisRestantes: number;
}

const ESTADO_INICIAL: SesionCliente = {
  clientEmail: null,
  clientName: null,
  plan: "free",
  analisisRestantes: 0,
};

type Listener = (s: SesionCliente) => void;

// Singleton a nivel de modulo: si Navbar y HeroSection montan este hook en la
// misma carga de la landing (ninguno recibe datos del servidor ahi), el SDK,
// `auth.getUser()` y el query a `users(plan, creditos_ciclo, creditos_pack)`
// se disparan UNA sola vez y ambos componentes se suscriben al mismo
// resultado. No hay fetch duplicado por tener dos consumidores del hook.
let estado: SesionCliente = ESTADO_INICIAL;
let fetchCompleto: Promise<void> | null = null;
const listeners = new Set<Listener>();

function notificar() {
  listeners.forEach((l) => l(estado));
}

function hidratarCompleto(): Promise<void> {
  if (fetchCompleto) return fetchCompleto;
  fetchCompleto = (async () => {
    if (!haySesionEnCookies()) return;
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.getUser();
      const u = data.user;
      if (error || !u) return;

      const { data: perfil } = await supabase
        .from("users")
        .select("plan, creditos_ciclo, creditos_pack")
        .eq("id", u.id)
        .maybeSingle();

      estado = {
        clientEmail: u.email ?? null,
        clientName:
          u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
        plan: perfil?.plan ?? "free",
        analisisRestantes: (perfil?.creditos_ciclo ?? 0) + (perfil?.creditos_pack ?? 0),
      };
      notificar();
    } catch (err) {
      console.error("[sesion-cliente] error hidratando sesion:", err);
    }
  })();
  return fetchCompleto;
}

export interface DatosDeServidor {
  email?: string | null;
  plan?: string;
  analisisRestantes?: number;
}

/**
 * Sesion de cliente compartida entre Navbar y HeroSection.
 *
 * - Paginas que ya resolvieron la sesion en el servidor (dashboard, analizar,
 *   resultado) pasan `datosDeServidor`: el hook confia en ese plan/analisis y
 *   solo reconcilia el nombre via `auth.getUser()`, sin repetir el query de
 *   perfil.
 * - La landing (100% estatica, sin props de servidor) usa el flujo completo
 *   de arriba, compartido via singleton entre Navbar y HeroSection.
 * - Durante la hidratacion (y para el visitante anonimo real) devuelve el
 *   estado inicial: sin sesion.
 */
export function useSesionCliente(
  datosDeServidor?: DatosDeServidor
): SesionCliente {
  const tieneDatosDeServidor = datosDeServidor?.email != null;
  const [sesion, setSesion] = useState<SesionCliente>(() =>
    tieneDatosDeServidor
      ? {
          clientEmail: datosDeServidor!.email ?? null,
          clientName: null,
          plan: datosDeServidor!.plan ?? "free",
          analisisRestantes: datosDeServidor!.analisisRestantes ?? 0,
        }
      : estado
  );

  useEffect(() => {
    let cancelado = false;

    if (tieneDatosDeServidor) {
      if (!haySesionEnCookies()) return;
      (async () => {
        try {
          const supabase = await getSupabase();
          const { data, error } = await supabase.auth.getUser();
          const u = data.user;
          if (cancelado || error || !u) return;
          setSesion((prev) => ({
            ...prev,
            clientEmail: u.email ?? prev.clientEmail,
            clientName:
              u.user_metadata?.full_name ?? u.user_metadata?.name ?? null,
          }));
        } catch (err) {
          console.error("[sesion-cliente] error hidratando nombre:", err);
        }
      })();
      return () => {
        cancelado = true;
      };
    }

    const listener: Listener = (s) => {
      if (!cancelado) setSesion(s);
    };
    listeners.add(listener);
    setSesion(estado);
    hidratarCompleto();

    return () => {
      cancelado = true;
      listeners.delete(listener);
    };
  }, [tieneDatosDeServidor]);

  return sesion;
}
