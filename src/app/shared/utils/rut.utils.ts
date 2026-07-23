/**
 * Utilidades para manejo y validación de RUT chileno.
 * Formato preferido: 12345678-9 (sin puntos, con guión)
 */

/**
 * Elimina puntos y guiones del RUT, dejando solo números y dígito verificador.
 */
export function cleanRut(rut: string): string {
  return (rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase();
}

/**
 * Formatea un RUT limpio al formato 12345678-9.
 * Si el valor no tiene suficientes caracteres, retorna lo ingresado.
 */
export function formatRut(rut: string): string {
  const clean = cleanRut(rut);

  if (clean.length <= 1) {
    return clean;
  }

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();
  return `${body}-${dv}`;
}

/**
 * Formatea un RUT limpio al formato 12.345.678-9 (con puntos y guión).
 */
export function formatRutDisplay(rut: string): string {
  const clean = cleanRut(rut);
  if (clean.length <= 1) return clean;
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();
  return body.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + '-' + dv;
}

/**
 * Valida un RUT chileno mediante el algoritmo módulo 11.
 */
export function validateRut(rut: string): boolean {
  const clean = cleanRut(rut);

  if (!clean || clean.length < 2) {
    return false;
  }

  const body = clean.slice(0, -1);
  const dv = clean.slice(-1).toUpperCase();

  if (!/^\d+$/.test(body) || parseInt(body, 10) <= 0) {
    return false;
  }

  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body.charAt(i), 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const expectedDv = 11 - (sum % 11);
  let expectedChar: string;

  if (expectedDv === 11) {
    expectedChar = '0';
  } else if (expectedDv === 10) {
    expectedChar = 'K';
  } else {
    expectedChar = expectedDv.toString();
  }

  return expectedChar === dv;
}
