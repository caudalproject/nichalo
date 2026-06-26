"use client";

import {
  BarChart,
  Bar,
  ResponsiveContainer,
  Cell,
} from "recharts";

const DEMO_DATA = [
  { rango: "1", cantidad: 6 },
  { rango: "2", cantidad: 14 },
  { rango: "3", cantidad: 22 },
  { rango: "4", cantidad: 9 },
  { rango: "5", cantidad: 4 },
];

const HIGHLIGHTED_INDEX = 2;

export function MiniPriceDistributionChart() {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <BarChart data={DEMO_DATA} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Bar dataKey="cantidad" radius={[3, 3, 0, 0]}>
          {DEMO_DATA.map((_, i) => (
            <Cell
              key={i}
              fill={i === HIGHLIGHTED_INDEX ? "#16A34A" : "#D1D5DB"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
