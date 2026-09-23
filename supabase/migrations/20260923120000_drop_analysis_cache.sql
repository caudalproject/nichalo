-- Elimina el cache de analisis (23/9/2026).
--
-- Motivo: desde que la foto del producto es obligatoria (21/9), el lookup de
-- app/api/analizar/route.ts vivia adentro de un `if (!imagenBase64)` que ya no
-- se cumple nunca. No podia pegar, pero el worker seguia escribiendo una fila
-- por analisis.
--
-- No se re-habilita metiendo la imagen en la clave a proposito: dos fotos
-- distintas del "mismo" producto son dos productos distintos para quien las
-- sube (otra marca, otra potencia, otro tamaño), y servir el analisis de uno a
-- otro — en silencio, porque la regla del proyecto es que el cache no se
-- anuncia — es el error que el trabajo del 23/9 esta tratando de eliminar.

DROP TABLE IF EXISTS public.analysis_cache;
