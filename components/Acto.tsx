/**
 * Los tres actos de la pagina de resultado y el plegable que los acompana.
 * TAB 4.1 del plan de tabs (21/9/2026).
 *
 * POR QUE EXISTE
 *
 * La pagina de resultado venia siendo 14 tarjetas del mismo peso visual, una
 * abajo de la otra, numeradas "CAPA 1..14" en los comentarios pero sin ninguna
 * jerarquia que el usuario pudiera ver. Todo gritaba igual, entonces nada
 * gritaba. El rediseno la ordena en tres preguntas, en el orden en que una
 * persona que esta por gastar plata se las hace:
 *
 *   1. Veredicto   — ¿va o no va?
 *   2. Los numeros — ¿cuanta plata es?
 *   3. Que hacer   — ¿y entonces que hago?
 *
 * Lo que no contesta ninguna de las tres se pliega DENTRO del acto al que
 * pertenece, no en un cajon de sastre al final. Plegado != borrado: la
 * consigna del tab es "menos scroll, no menos informacion", y un <details>
 * cerrado cuesta 56px en vez de una pantalla entera sin perder un solo dato.
 *
 * ADVERTENCIA PARA EL QUE VENGA DESPUES
 *
 * Que se pliega y que no NO esta validado con usuarios. Las 12 entrevistas del
 * TAB 2 cerraron con 0 de 15 respuestas, asi que no existe un solo dato real
 * sobre que seccion se mira primero y cual se saltea. Cada decision de plegado
 * de este rediseno es INTUICION, esta anotada como tal en la nota de sesion
 * (`2026-09-21-tab4.1-rediseno.md`) y queda pendiente de verificar contra una
 * sesion observada. Si algun dia hay un usuario mirando la pantalla y dice que
 * abre siempre un bloque plegado, gana el usuario y el bloque se despliega.
 */

export function Acto({
  numero,
  titulo,
  pregunta,
  children,
}: {
  numero: number;
  titulo: string;
  pregunta: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div className="flex items-baseline gap-3 pt-4">
        <span
          aria-hidden
          className="flex h-6 w-6 shrink-0 translate-y-0.5 items-center justify-center rounded-full bg-[#0A0A0A] font-mono text-[11px] font-bold text-white tabular-nums"
        >
          {numero}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-[#0A0A0A]">
            {titulo}
          </h2>
          <p className="text-xs text-gray-400">{pregunta}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * Bloque plegado. `<details>` nativo a proposito: la pagina de resultado es un
 * Server Component y este es el unico patron de mostrar/ocultar que no obliga
 * a bajar JavaScript ni a marcar el archivo como "use client". Ademas abre con
 * Ctrl+F del navegador, asi que lo plegado sigue siendo encontrable — que es
 * justamente la diferencia entre plegar y esconder.
 *
 * El `list-none` y el `::-webkit-details-marker` van los dos: Safari de iOS
 * ignora el primero y dibuja el triangulito gris igual. Sin eso, en el iPhone
 * aparecen dos indicadores (el del sistema y el nuestro).
 */
export function Plegable({
  titulo,
  nota,
  children,
}: {
  titulo: string;
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <summary className="flex min-h-[56px] cursor-pointer select-none list-none items-center justify-between gap-3 px-4 py-3.5 sm:px-6 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-medium text-gray-900">{titulo}</span>
          {nota && <span className="mt-0.5 block text-xs text-gray-400">{nota}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-xs text-gray-400">
          <span className="group-open:hidden">Ver</span>
          <span className="hidden group-open:inline">Cerrar</span>
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            fill="none"
            className="h-4 w-4 transition-transform group-open:rotate-180"
          >
            <path
              d="M6 8l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </summary>
      <div className="space-y-4 border-t border-gray-50 px-4 py-4 sm:px-6">{children}</div>
    </details>
  );
}
