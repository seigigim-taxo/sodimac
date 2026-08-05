/*
 * Rol con que queda todo operador que no traiga un cargo reconocible desde el
 * backend. Se referencia por NOMBRE y no por id: el id depende del orden en que
 * el seed inserta las filas de sod_rol, y ese orden no es un contrato.
 *
 * Debe coincidir con una fila sembrada en sodimac.schema.ts.
 */
export const ROL_POR_DEFECTO = 'Operador de Inventario';
