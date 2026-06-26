"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export function UpgradeBanner() {
  const [loadingPlan, setLoadingPlan] = useState<"starter" | "pro" | null>(null);
  const router = useRouter();

  async function handleUpgrade(plan: "starter" | "pro") {
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/pagos/crear-suscripcion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
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
      setLoadingPlan(null);
    }
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-amber-800">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="text-sm font-medium">
          Usaste tu análisis gratis. Para seguir validando productos antes de invertir en stock, elegí un plan.
        </span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:shrink-0">
        <Button
          size="sm"
          className="bg-[#16A34A] hover:bg-[#15803D] text-white"
          onClick={() => handleUpgrade("starter")}
          disabled={loadingPlan !== null}
        >
          {loadingPlan === "starter" ? "Redirigiendo..." : "Starter — $17.000/mes"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-amber-300 text-amber-800 hover:bg-amber-100"
          onClick={() => handleUpgrade("pro")}
          disabled={loadingPlan !== null}
        >
          {loadingPlan === "pro" ? "Redirigiendo..." : "Pro — $41.000/mes"}
        </Button>
      </div>
    </div>
  );
}
