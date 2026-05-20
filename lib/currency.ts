const CURRENCY_MAP: Record<string, { code: string; symbol: string; name: string }> = {
  AR: { code: "ARS", symbol: "$", name: "Peso argentino" },
  MX: { code: "MXN", symbol: "$", name: "Peso mexicano" },
  CO: { code: "COP", symbol: "$", name: "Peso colombiano" },
};

export function getCurrencyForCountry(pais: string) {
  return CURRENCY_MAP[pais] ?? { code: "USD", symbol: "US$", name: "Dólar" };
}

export async function getExchangeRate(fromCurrency: string): Promise<number> {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await res.json();
    return data.rates[fromCurrency] ?? 1;
  } catch {
    const fallback: Record<string, number> = {
      ARS: 1400,
      MXN: 17,
      COP: 4200,
    };
    return fallback[fromCurrency] ?? 1;
  }
}
