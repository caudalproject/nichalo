import { Card, CardContent } from "@/components/ui/card";
import { PackCheckoutButton } from "@/components/PackCheckoutButton";

interface Props {
  title?: string;
  className?: string;
}

// Oferta de packs de créditos: pago único, sin vencimiento. Se muestra en el
// momento exacto en que un usuario se queda sin análisis — no hace falta
// bajar hasta la landing a buscarla.
export function PacksOffer({ title = "Seguí validando productos", className }: Props) {
  return (
    <Card className={`border-[#E5E7EB] ${className ?? ""}`}>
      <CardContent className="p-4">
        <p className="text-sm font-semibold text-[#0A0A0A]">{title}</p>
        <p className="mt-0.5 text-xs text-[#6B7280]">
          Comprá un pack de análisis. Sin vencimiento, se usan cuando quieras.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-[#E5E7EB] p-3">
            <p className="text-sm font-medium text-[#0A0A0A]">Pack 3 — $4.500</p>
            <p className="text-xs text-[#6B7280] mb-2">3 análisis, sin vencimiento</p>
            <PackCheckoutButton pack="pack_3" variant="outline" label="Comprar Pack 3" />
          </div>
          <div className="rounded-md border border-[#16A34A]/30 bg-[#F0FDF4] p-3">
            <p className="text-sm font-medium text-[#0A0A0A]">Pack 10 — $12.000</p>
            <p className="text-xs text-[#6B7280] mb-2">10 análisis, sin vencimiento</p>
            <PackCheckoutButton pack="pack_10" label="Comprar Pack 10" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
