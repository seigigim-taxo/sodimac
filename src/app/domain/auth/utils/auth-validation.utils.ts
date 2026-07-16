import { cleanRut, getFirstSixDigits, validateRut } from './rut.utils';

/**
 * Valida las credenciales de login según las reglas de negocio.
 * Para demo: contraseña = primeros 6 dígitos del RUT.
 */
export function validateCredentials(rut: string, password: string): { valid: boolean; error?: string } {
  const clean = cleanRut(rut);

  if (!validateRut(clean)) {
    return { valid: false, error: 'RUT inválido' };
  }

  const expectedPassword = getFirstSixDigits(clean);

  if (password !== expectedPassword) {
    return { valid: false, error: 'Contraseña incorrecta' };
  }

  return { valid: true };
}
