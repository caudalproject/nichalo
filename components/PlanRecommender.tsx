"use client";

export type PlanRecommendation = "uno" | "dos_tres" | "muchos";

interface Option {
  value: PlanRecommendation;
  label: string;
  reason: string;
}

// Unidad: "cuántos productos vas a validar", no "publicaciones analizadas" —
// eso último nadie lo sabe de sí mismo antes de usar la herramienta. Cuántos
// productos piensa comparar antes de decidir, sí lo sabe.
const OPTIONS: Option[] = [
  {
    value: "uno",
    label: "Uno, quiero probar",
    reason: "Con Free validás tu primer producto gratis, sin tarjeta.",
  },
  {
    value: "dos_tres",
    label: "Dos o tres",
    reason: "Con 3 te alcanza para comparar antes de decidir.",
  },
  {
    value: "muchos",
    label: "Muchos, es mi laburo",
    reason: "Con Pro no vas a frenar por crédito — 30 análisis por mes.",
  },
];

interface Props {
  selected: PlanRecommendation | null;
  onSelect: (value: PlanRecommendation | null) => void;
}

// Estado de cliente puro: no toca precios ni planes, solo resalta la card
// correspondiente (ver PricingSection) y muestra la razón. Convierte la
// landing de "comparar 4 opciones" (tarea cara) en "responder una pregunta
// que el usuario ya sabe contestar" (tarea barata) — mismo mecanismo que el
// slider de Resend, adaptado a una unidad que el comprador conoce de sí
// mismo.
export function PlanRecommender({ selected, onSelect }: Props) {
  const active = OPTIONS.find((o) => o.value === selected) ?? null;

  return (
    <div className="mt-8 mx-auto max-w-xl text-center">
      <p className="text-sm font-medium text-[#0A0A0A] mb-3">
        ¿Cuántos productos vas a validar?
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            aria-pressed={selected === opt.value}
            onClick={() => onSelect(selected === opt.value ? null : opt.value)}
            className={`rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              selected === opt.value
                ? "border-[#16A34A] bg-[#16A34A] text-white"
                : "border-[#E5E7EB] text-[#0A0A0A] hover:border-[#16A34A]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-[#16A34A] font-medium min-h-[1.25rem]">
        {active?.reason ?? ""}
      </p>
    </div>
  );
}
