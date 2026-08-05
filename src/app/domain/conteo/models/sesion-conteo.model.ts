/*
 * Identidad de la sesión de conteo activa: el TAG que el operador trabaja
 * dentro de una ronda. El estado no se guarda aparte — vive en la columna
 * estado de sod_conteo_detalle: una sesión "existe" mientras haya (o pueda
 * haber) líneas EN_CURSO para esta tupla.
 */
export interface SesionConteo {
  conteoId:    number;
  ubicacionId: number;
  operadorId:  number;
  pdaId:       number;
}
