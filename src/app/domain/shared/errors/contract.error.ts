/*
 * El backend respondió, pero con una forma que la app no puede usar: falta un
 * campo, o vino con otro tipo.
 *
 * Existe para separarlo de [NetworkError]. Sin esta distinción, un contrato roto
 * se ve igual que una falla de conexión: el operador lee "sin conexión",
 * reintenta, y nadie se entera de que el endpoint cambió.
 */
export class ContractError extends Error {
  constructor(
    /* Ruta del campo, ej. "data.usuario.rut_normalizado". */
    readonly campo: string,
    detalle: string
  ) {
    super(`Respuesta inesperada del servidor en "${campo}": ${detalle}`);
    this.name = 'ContractError';
  }
}
