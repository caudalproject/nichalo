"use client";
import { useEffect, useState } from "react";

interface Props {
  score: number;
  veredicto: "VIABLE" | "MARGINAL" | "SATURADO";
}

export function ScoreDisplay({ score, veredicto }: Props) {
  const [displayed, setDisplayed] = useState(0);

  useEffect(() => {
    const duration = 1000;
    const steps = 40;
    const increment = score / steps;
    let current = 0;
    let step = 0;

    const timer = setInterval(() => {
      step++;
      current = Math.min(Math.round(increment * step), score);
      setDisplayed(current);
      if (step >= steps) clearInterval(timer);
    }, duration / steps);

    return () => clearInterval(timer);
  }, [score]);

  const colorClass =
    veredicto === "VIABLE"
      ? "text-[#16A34A]"
      : veredicto === "MARGINAL"
      ? "text-[#F59E0B]"
      : "text-[#DC2626]";

  return (
    <div className="flex items-baseline gap-2">
      <span className={`text-7xl font-bold font-mono leading-none ${colorClass}`}>
        {displayed}
      </span>
      <span className="text-2xl text-gray-300 font-light">/100</span>
    </div>
  );
}
