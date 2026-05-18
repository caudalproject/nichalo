"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard not available — silent fail
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleShare}>
      {copied ? "✓ Link copiado" : "Compartir análisis"}
    </Button>
  );
}
