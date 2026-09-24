import type { PuntoInteres } from "@/lib/tendencias";

/**
 * Serie de interes de Google, dibujada como SVG plano.
 *
 * Sin `"use client"`, sin libreria de charts y sin estado: es un `<path>`
 * calculado en el servidor. Mismo criterio que el `<details>` nativo del
 * TAB 4.1 — la pagina de tendencias tiene que ser indexable y liviana, y
 * meter Chart.js para catorce puntos de una serie normalizada seria pagar
 * JavaScript por algo que el servidor puede resolver en texto.
 *
 * NO LLEVA EJE Y A PROPOSITO, Y NO ES PEREZA
 *
 * Los valores de Google son 0-100 normalizados DENTRO de Argentina y de esta
 * consulta: el 100 es "el momento de mayor busqueda de este termino", no una
 * cantidad. Poner numeros invitaria a compararlos entre productos, que es
 * justamente lo que el dato no permite. Se muestra la forma, que es lo unico
 * que significa algo.
 */
export function SparklineInteres({ puntos }: { puntos: PuntoInteres[] }) {
  if (puntos.length < 8) return null;

  const ancho = 320;
  const alto = 48;
  const valores = puntos.map((p) => p.valor);
  const max = Math.max(...valores, 1);

  const coords = valores.map((v, i) => {
    const x = (i / (valores.length - 1)) * ancho;
    const y = alto - (v / max) * (alto - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const linea = `M ${coords.join(" L ")}`;
  const area = `${linea} L ${ancho},${alto} L 0,${alto} Z`;

  const primera = puntos[0]?.fecha ?? "";
  const ultima = puntos[puntos.length - 1]?.fecha ?? "";

  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="w-full h-12 overflow-visible"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Interés de búsqueda entre ${primera} y ${ultima}`}
      >
        <path d={area} fill="currentColor" className="text-green-600/10" />
        <path
          d={linea}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-green-600"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
        <span>{primera}</span>
        <span>{ultima}</span>
      </div>
    </div>
  );
}
