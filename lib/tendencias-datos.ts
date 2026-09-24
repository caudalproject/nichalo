import type { DatosTendencias } from "@/lib/tendencias";
import crudo from "@/data/tendencias.json";

/**
 * Punto unico de entrada a los datos de tendencias.
 *
 * El `as unknown as` es deliberado y esta acotado aca a proposito. TypeScript
 * infiere el tipo del JSON desde su contenido literal, asi que un barrido
 * donde un producto quedo sin datos infiere `subiendo: never[]` y deja de ser
 * asignable al tipo real. El shape lo garantiza
 * `scripts/barrer-tendencias.mjs`, que es el unico que escribe ese archivo.
 *
 * Centralizarlo tiene el punto de que la aseveracion vive en UN lugar
 * comentado, en vez de repetirse en cada pagina que importe el JSON —
 * que es como estas cosas terminan divergiendo.
 */
export const TENDENCIAS = crudo as unknown as DatosTendencias;
