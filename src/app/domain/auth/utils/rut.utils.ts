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
 * Extrae los primeros 6 dígitos numéricos del RUT (sin dígito verificador).
 * Se usa para comparar con la contraseña.
 */
export function getFirstSixDigits(rut: string): string {
  const clean = cleanRut(rut);
  // Ignorar el dígito verificador si está presente
  const body = clean.length > 1 ? clean.slice(0, -1) : clean;
  return body.slice(0, 6);
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
