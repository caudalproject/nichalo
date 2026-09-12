"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { PacksOffer } from "@/components/PacksOffer";

export function UpgradeBanner() {
  const [loadingPro, setLoadingPro] = useState(false);
  const router = useRouter();

  async function handleUpgradePro() {
    setLoadingPro(true);
    try {
      const res = await fetch("/api/pagos/crear-suscripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro" }),
      });

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      const data = await res.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } finally {
      setLoadingPro(false);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
      <div className="flex items-center gap-2 text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">
          Usaste tu análisis gratis. Para seguir validando productos antes de invertir en stock:
        </span>
      </div>
      <PacksOffer title="Packs de créditos" className="border-amber-200" />
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          className="border-amber-300 text-amber-800 hover:bg-amber-100"
          onClick={handleUpgradePro}
          disabled={loadingPro}
        >
          {loadingPro ? "Redirigiendo..." : "O pasate a Pro — 30/mes por $16.000"}
        </Button>
      </div>
    </div>
  );
}
