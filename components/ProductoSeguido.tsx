"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VistaDelta } from "@/components/VistaDelta";
import { Button } from "@/components/ui/button";
import type { Delta } from "@/lib/delta";

export interface ProductoSeguidoProps {
  id: string;
  producto: string;
  pais: string;
  last_check_at: string | null;
  mediciones: number;
  delta: Delta | null;
  corriendo: boolean;
  error: string | null;
}

export function ProductoSeguido({ producto: p }: { producto: ProductoSeguidoProps }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const rechequear = async () => {
    setEnviando(true);
    setAviso(null);
    const res = await fetch(`/api/seguimiento/${p.id}/rechequear`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));
    setEnviando(false);
    if (!res.ok) {
      setAviso(body.error ?? "No se pudo iniciar el re-chequeo.");
      return;
    }
    startTransition(() => router.refresh());
  };

  const dejarDeSeguir = async () => {
    setEnviando(true);
    await fetch(`/api/seguimiento/${p.id}`, { method: "DELETE" });
    setEnviando(false);
    startTransition(() => router.refresh());
  };

  const ocupado = enviando || pendiente || p.corriendo;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{p.producto}</h3>
          <p className="text-xs text-gray-500">
            {p.last_check_at
              ? `Última medición: ${new Date(p.last_check_at).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}`
              : "Sin medir todavía"}
            {p.mediciones > 0 && ` · ${p.mediciones} medición${p.mediciones === 1 ? "" : "es"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={rechequear} disabled={ocupado}>
            {p.corriendo ? "Midiendo…" : enviando ? "…" : "Re-chequear"}
          </Button>
          <button
            onClick={dejarDeSeguir}
            disabled={ocupado}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Dejar de seguir
          </button>
        </div>
      </div>

      {aviso && <p className="text-xs text-amber-600">{aviso}</p>}
      {p.error && (
        <p className="text-xs text-red-500">
          La última medición falló: {p.error}
        </p>
      )}

      {p.delta ? (
        <VistaDelta delta={p.delta} />
      ) : (
        // El estado vacio no es un caso raro: al 21/9 es el estado de TODOS los
        // productos seguidos, porque ningun analisis de la base guardo metricas
        // (el TAB 3 desplego la formula el 20/9 y el analisis mas nuevo es del
        // 18/9). Una feature de seguimiento recien nacida no tiene contra que
        // comparar, y fingir un delta seria inventarlo.
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 px-5 py-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            {p.mediciones === 0
              ? "Todavía no hay ninguna medición."
              : "Primera medición tomada."}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {p.mediciones === 0
              ? "Tocá “Re-chequear” para tomar la primera foto del producto."
              : "Hace falta una segunda para poder comparar. Volvé en una semana, o medí de nuevo cuando quieras."}
          </p>
        </div>
      )}
    </div>
  );
}
