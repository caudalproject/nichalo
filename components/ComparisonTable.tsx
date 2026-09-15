"use client";

import { Check, X } from "lucide-react";
import { usePais } from "@/components/PreciosPais";

// `sub` se renderiza como segunda linea chica. Existe por mobile: el valor
// "3 o 10, sin vencimiento" en una sola linea forzaba un min-content de ~110px
// en esa columna y empujaba la columna Pro fuera de pantalla a 393px.
type Valor = string | { v: string; sub: string };

const ROWS: { label: string; free: Valor; packs: Valor; pro: Valor }[] = [
  { label: "Análisis", free: "1", packs: { v: "3 o 10", sub: "sin vencimiento" }, pro: "30/mes" },
  { label: "Publicaciones", free: "30", packs: "50", pro: "100" },
  { label: "Imagen del producto", free: "yes", packs: "yes", pro: "yes" },
  { label: "Análisis avanzado", free: "no", packs: "no", pro: "yes" },
  { label: "Precio sugerido", free: "yes", packs: "yes", pro: "yes" },
  { label: "Secciones completas", free: "1er análisis", packs: "yes", pro: "yes" },
];

function Cell({ value }: { value: Valor }) {
  if (typeof value !== "string") {
    return (
      <>
        {value.v}
        <span className="block text-[10px] leading-tight text-[#9CA3AF]">
          {value.sub}
        </span>
      </>
    );
  }
  if (value === "yes")
    return <Check className="inline-block text-green-600" size={16} />;
  if (value === "no") return <X className="inline-block text-gray-400" size={16} />;
  return <>{value}</>;
}

/**
 * Los packs solo se venden en Argentina (ver PacksZone). Mostrar la columna
 * "Packs" en la tabla comparativa para MX/CO prometía algo que esas cards ya
 * no ofrecen — se saca la columna entera para esos paises, no solo el precio.
 *
 * Mobile (15/9): a 393px la tabla medía 405px contra un contenedor de 327, así
 * que la columna Pro —la que se está tratando de vender— quedaba fuera de
 * pantalla y solo aparecía scrolleando en horizontal. Nadie scrollea una tabla
 * de lado. Se achicó el padding y la tipografía en mobile y se partió el valor
 * largo de Packs en dos líneas; el `overflow-x-auto` queda como red de
 * seguridad, no como la forma prevista de leerla.
 */
export function ComparisonTable() {
  const pais = usePais();
  const conPacks = pais === "AR";

  return (
    <div className="mt-16 max-w-3xl mx-auto overflow-x-auto rounded-xl border border-[#E5E7EB] bg-white">
      <table className="w-full text-xs md:text-sm">
        <thead>
          <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB]">
            <th className="text-left py-3 px-2 md:px-5 font-medium text-[#6B7280] w-[34%] md:w-[40%]"></th>
            <th className="text-center py-3 px-1.5 md:px-4 font-medium text-[#6B7280]">Free</th>
            {conPacks && (
              <th className="text-center py-3 px-1.5 md:px-4 font-medium text-[#6B7280]">Packs</th>
            )}
            <th className="text-center py-3 px-1.5 md:px-4 font-semibold text-[#0A0A0A] bg-[#F0FDF4] border-x border-[#16A34A]/25">
              Pro
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#E5E7EB]">
          {ROWS.map((row) => (
            <tr key={row.label}>
              <td className="py-3 px-2 md:px-5 text-[#0A0A0A]">{row.label}</td>
              <td className="py-3 px-1.5 md:px-4 text-center text-[#6B7280]">
                <Cell value={row.free} />
              </td>
              {conPacks && (
                <td className="py-3 px-1.5 md:px-4 text-center text-[#6B7280]">
                  <Cell value={row.packs} />
                </td>
              )}
              <td className="py-3 px-1.5 md:px-4 text-center font-medium text-[#0A0A0A] bg-[#F0FDF4] border-x border-[#16A34A]/25">
                <Cell value={row.pro} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
