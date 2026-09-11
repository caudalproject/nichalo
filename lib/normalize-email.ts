/**
 * Normaliza un email de Gmail para detectar alias de la misma casilla.
 * Gmail ignora los puntos en el local-part y todo lo que va despues de un "+".
 * `j.uan+test@gmail.com` === `juan@gmail.com`.
 *
 * Solo aplica la normalizacion agresiva a gmail.com/googlemail.com — el resto
 * de los proveedores no tiene esta semantica y tocarla generaria falsos positivos.
 */
export function normalizeEmail(email: string): string {
  const trimmed = email.trim().toLowerCase();
  const atIndex = trimmed.lastIndexOf("@");
  if (atIndex === -1) return trimmed;

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);

  if (domain !== "gmail.com" && domain !== "googlemail.com") {
    return trimmed;
  }

  const withoutPlus = local.split("+")[0];
  const withoutDots = withoutPlus.replace(/\./g, "");
  return `${withoutDots}@gmail.com`;
}
