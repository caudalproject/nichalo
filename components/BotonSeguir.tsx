"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * La puerta de entrada al seguimiento (TAB 5). Vive en la pagina de resultado
 * porque el momento en que alguien quiere seguir un producto es justo despues
 * de ver que el producto le interesa — no en un menu aparte.
 *
 * Solo se muestra al dueno del analisis: un link compartido lo puede abrir
 * cualquiera (decision del TAB 4), pero seguir es una accion de cuenta.
 */
export function BotonSeguir({ analysisId }: { analysisId: string }) {
  const router = useRouter();
  const [estado, setEstado] = useState<"idle" | "enviando" | "listo" | "error">(
    "idle"
  );
  const [mensaje, setMensaje] = useState<string | null>(null);

  const seguir = async () => {
    setEstado("enviando");
    const res = await fetch("/api/seguimiento", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ analysis_id: analysisId }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEstado("error");
      setMensaje(body.error ?? "No se pudo agregar.");
      return;
    }
    setEstado("listo");
    router.refresh();
  };

  if (estado === "listo") {
    return (
      <div className="rounded-xl border border-[#16A34A]/20 bg-[#16A34A]/5 px-4 py-3">
        <p className="text-sm font-medium text-gray-900">
          Listo, lo estás siguiendo.
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          Falta una segunda medición para poder comparar.{" "}
          <a href="/seguimiento" className="font-medium text-[#16A34A] hover:underline">
            Ver mis productos
          </a>
        </p>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={seguir}
        disabled={estado === "enviando"}
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:border-[#16A34A]/40 hover:bg-[#16A34A]/[0.03] disabled:opacity-60"
      >
        <span className="text-sm font-medium text-gray-900">
          {estado === "enviando" ? "Agregando…" : "Seguir este producto"}
        </span>
        <span className="mt-0.5 block text-xs text-gray-500">
          Volvé a medirlo cuando quieras y mirá qué cambió: quién entró, cómo se
          movieron los precios.
        </span>
      </button>
      {estado === "error" && (
        <p className="mt-1.5 text-xs text-red-500">{mensaje}</p>
      )}
    </div>
  );
}
