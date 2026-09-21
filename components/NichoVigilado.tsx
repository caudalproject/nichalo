"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { VistaDelta } from "@/components/VistaDelta";
import { Button } from "@/components/ui/button";
import type { Delta } from "@/lib/delta";

export interface NichoProps {
  id: string;
  producto: string;
  pais: string;
  last_check_at: string | null;
  mediciones: number;
  delta: Delta | null;
  corriendo: boolean;
  error: string | null;
}

export function NichoVigilado({ nicho }: { nicho: NichoProps }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const rechequear = async () => {
    setEnviando(true);
    setAviso(null);
    const res = await fetch(`/api/seguimiento/${nicho.id}/rechequear`, {
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

  const dejarDeVigilar = async () => {
    setEnviando(true);
    await fetch(`/api/seguimiento/${nicho.id}`, { method: "DELETE" });
    setEnviando(false);
    startTransition(() => router.refresh());
  };

  const ocupado = enviando || pendiente || nicho.corriendo;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{nicho.producto}</h3>
          <p className="text-xs text-gray-500">
            {nicho.last_check_at
              ? `Última medición: ${new Date(nicho.last_check_at).toLocaleDateString("es-AR", { day: "numeric", month: "long" })}`
              : "Sin medir todavía"}
            {nicho.mediciones > 0 && ` · ${nicho.mediciones} medición${nicho.mediciones === 1 ? "" : "es"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={rechequear} disabled={ocupado}>
            {nicho.corriendo ? "Midiendo…" : enviando ? "…" : "Re-chequear"}
          </Button>
          <button
            onClick={dejarDeVigilar}
            disabled={ocupado}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Dejar de vigilar
          </button>
        </div>
      </div>

      {aviso && <p className="text-xs text-amber-600">{aviso}</p>}
      {nicho.error && (
        <p className="text-xs text-red-500">
          La última medición falló: {nicho.error}
        </p>
      )}

      {nicho.delta ? (
        <VistaDelta delta={nicho.delta} />
      ) : (
        // El estado vacio no es un caso raro: al 21/9 es el estado de TODOS los
        // nichos, porque ningun analisis de la base guardo metricas (el TAB 3
        // desplego la formula el 20/9 y el analisis mas nuevo es del 18/9).
        // Una feature de seguimiento recien nacida no tiene contra que comparar,
        // y fingir un delta seria inventarlo.
        <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 px-5 py-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            {nicho.mediciones === 0
              ? "Todavía no hay ninguna medición."
              : "Primera medición tomada."}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {nicho.mediciones === 0
              ? "Tocá “Re-chequear” para tomar la primera foto del nicho."
              : "Hace falta una segunda para poder comparar. Volvé en una semana, o medí de nuevo cuando quieras."}
          </p>
        </div>
      )}
    </div>
  );
}
