"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface Props {
  pack: "pack_3" | "pack_10";
  variant?: "default" | "outline";
  label: string;
  className?: string;
}

export function PackCheckoutButton({ pack, variant = "default", label, className }: Props) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleClick() {
    setLoading(true);
    try {
      const res = await fetch("/api/pagos/crear-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack }),
      });

      if (res.status === 401) {
        router.push(`/login?redirect=/`);
        return;
      }

      const data = await res.json();
      if (data.init_point) {
        window.location.href = data.init_point;
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      className={className ?? "w-full rounded-md"}
      variant={variant}
      onClick={handleClick}
      disabled={loading}
    >
      {loading ? "Redirigiendo..." : label}
    </Button>
  );
}
