/** Retorna los primeros 6 dígitos del cuerpo del RUT, sin dígito verificador. */
export function getFirstSixDigits(rut: string): string {
  const clean = (rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
  const body = clean.length > 1 ? clean.slice(0, -1) : clean;
  return body.slice(0, 6);
}
