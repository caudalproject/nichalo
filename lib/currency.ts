// Decisión 2026-09-13 (ver Diario de Decisiones): Nichalo solo opera en
// Argentina — MX/CO ya estaban deshabilitados en el selector de
// AnalizarForm.tsx ("próximamente") y las 34 análisis históricas son 100%
// AR. Se saca USD como moneda puente: todo el pipeline (costo tipeado por
// el usuario, precios scrapeados, margen calculado por Gemini, display en
// /resultado/[id]) queda en pesos argentinos sin ninguna conversión de
// moneda real. Esto elimina de raíz dos bugs encontrados el mismo día:
// (1) Gemini a veces omitía la división por la tasa al calcular margen,
// mezclando ARS y USD crudos; (2) el frontend de /resultado/[id] multiplicaba
// otra vez por la tasa al mostrar ganancia_estimada, duplicando cualquier
// error de (1).
//
// Se mantienen las firmas de estas dos funciones (siguen usadas en
// AnalizarForm.tsx, lib/gemini.ts y lib/inngest-functions.ts) para no tener
// que tocar esos archivos: ahora siempre resuelven a ARS / tasa 1, así que
// toda conversión aguas abajo se vuelve un no-op.
export function getCurrencyForCountry(_pais: string) {
  return { code: "ARS", symbol: "$", name: "Peso argentino" };
}

export async function getExchangeRate(_fromCurrency: string): Promise<number> {
  return 1;
}
