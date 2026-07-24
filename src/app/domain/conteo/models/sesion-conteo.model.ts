/*
 * Identidad de la sesión de conteo activa. El estado ya no se guarda aparte:
 * vive en la columna estado de sod_conteo — una sesión "existe" mientras haya
 * (o pueda haber) filas EN_CURSO para esta tupla.
 */
export interface SesionConteo {
  eventoId:    number;
  ubicacionId: number;
  operadorId:  number;
  pdaId:       number;
}
