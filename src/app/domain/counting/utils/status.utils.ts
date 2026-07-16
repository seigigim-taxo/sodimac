export type CountingStatus = 'in-progress' | 'finalized';

/**
 * Valida y normaliza el estado de una sesión de conteo.
 * Si el estado es desconocido, retorna 'in-progress' como valor por defecto.
 */
export function validateStatus(raw: unknown): CountingStatus {
  if (raw === 'in-progress' || raw === 'finalized') {
    return raw;
  }
  console.warn('[CountingDomain] Unknown status, defaulting to in-progress:', raw);
  return 'in-progress';
}
