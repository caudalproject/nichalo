"use client";

import { Check, X } from "lucide-react";
import { usePais } from "@/components/PreciosPais";

const ROWS = [
  { label: "Análisis", free: "1", packs: "3 o 10, sin vencimiento", pro: "30/mes" },
  { label: "Publicaciones", free: "30", packs: "50", pro: "100" },
  { label: "Imagen del producto", free: "yes", packs: "yes", pro: "yes" },
  { label: "Análisis avanzado", free: "no", packs: "no", pro: "yes" },
  { label: "Precio sugerido", free: "yes", packs: "yes", pro: "yes" },
  { label: "Secciones completas", free: "1er análisis", packs: "yes", pro: "yes" },
] as const;

function Cell({ value }: { value: string }) {
  if (value === "yes") return <Check className="inline-block text-green-600" size={18} />;
  if (value === "no") return <X className="inline-block text-gray-400" size={18} />;
  return <>{value}</>;
}

/**
 * Los packs solo se venden en Argentina (ver PacksZone). Mostrar la columna
 * "Packs" en la tabla comparativa para MX/CO prometía algo que esas cards ya
 * no ofrecen — se saca la columna entera para esos paises, no solo el precio.
 */
export function ComparisonTable() {
  const pais = usePais();
  const conPacks = pais === "AR";

  return (
    <div className="mt-16 max-w-3xl mx-auto overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
            <th className="text-left py-3 px-5 font-medium text-[#6B7280] w-[40%]"></th>
            <th className="text-center py-3 px-4 font-medium text-[#6B7280]">Free</th>
            {conPacks && (
              <th className="text-center py-3 px-4 font-medium text-[#6B7280]">Packs</th>
            )}
            <th className="text-center py-3 px-4 font-semibold text-[#0A0A0A] bg-[#F0FDF4] border-x border-[#16A34A]/25">
              Pro
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E7EB]">
          {ROWS.map((row) => (
            <tr key={row.label}>
              <td className="py-3 px-5 text-[#0A0A0A]">{row.label}</td>
              <td className="py-3 px-4 text-center text-[#6B7280]">
                <Cell value={row.free} />
              </td>
              {conPacks && (
                <td className="py-3 px-4 text-center text-[#6B7280]">
                  <Cell value={row.packs} />
                </td>
              )}
              <td className="py-3 px-4 text-center font-medium text-[#0A0A0A] bg-[#F0FDF4] border-x border-[#16A34A]/25">
                <Cell value={row.pro} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
