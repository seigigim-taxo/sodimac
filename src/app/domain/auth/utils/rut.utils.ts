/*
 * Parte un rut normalizado ('998000025') en las dos columnas con que lo guarda
 * SQLite: cuerpo numérico y dígito verificador.
 */
export function partirRut(rutNormalizado: string): { rut: number; rutDv: string } {
  return {
    rut: parseInt(rutNormalizado.slice(0, -1), 10),
    rutDv: rutNormalizado.slice(-1).toUpperCase(),
  };
}

/** Retorna los primeros 6 dígitos del cuerpo del RUT, sin dígito verificador. */
export function getFirstSixDigits(rut: string): string {
  const clean = (rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
  const body = clean.length > 1 ? clean.slice(0, -1) : clean;
  return body.slice(0, 6);
}
