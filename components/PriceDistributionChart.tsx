"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { DistribucionPrecio } from "@/lib/supabase";

interface Props {
  data: DistribucionPrecio[];
  precioSugerido?: number;
}

function isInRange(rango: string, precio: number): boolean {
  if (rango.includes("+")) {
    const min = parseFloat(rango.replace("+", ""));
    return Number.isFinite(min) && precio >= min;
  }
  const parts = rango.split("-").map(parseFloat);
  if (parts.length !== 2 || !parts.every(Number.isFinite)) return false;
  return precio >= parts[0] && precio < parts[1];
}

export function PriceDistributionChart({ data, precioSugerido }: Props) {
  const filtered = (data ?? []).filter((d) => d.cantidad > 0);
  if (filtered.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={filtered} margin={{ top: 4, right: 8, left: -16, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="rango"
          tick={{ fontSize: 12 }}
          label={{ value: "Rango USD", position: "insideBottom", offset: -2, fontSize: 11 }}
        />
        <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
        <Tooltip
          formatter={(value) => [value, "Publicaciones"]}
          labelFormatter={(label) => `Rango: $${label} USD`}
        />
        <Bar dataKey="cantidad" radius={[4, 4, 0, 0]}>
          {filtered.map((entry, i) => {
            const highlight =
              precioSugerido != null && isInRange(entry.rango, precioSugerido);
            return (
              <Cell
                key={i}
                fill={highlight ? "hsl(142 76% 36%)" : "hsl(var(--primary))"}
              />
            );
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
