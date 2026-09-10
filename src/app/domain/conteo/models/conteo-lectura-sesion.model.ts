import { MedioCaptura } from './medio-captura.model';

/*
 * Una lectura de la sesión de TAG en curso, con lo que la lista de la pantalla
 * de conteo necesita para renderizarla y para operar sobre ella.
 *
 * A diferencia de ConteoLectura (el log puro), trae la identidad de la fila
 * (`lecturaId`) y de su detalle padre (`detalleId`, `productoId`): un +/- o un
 * borrado en la lista actúan sobre ESTA lectura, y hay que ajustar su detalle
 * para no romper el invariante SUM(lecturas) == cantidad_fisica.
 */
export interface ConteoLecturaSesion {
  lecturaId:     number;
  detalleId:     number;
  productoId:    number;
  sku:           string;
  descripcion:   string | null;
  codigoLectura: string | null;
  medioCaptura:  MedioCaptura;
  /* Movimiento de unidades de esta captura, con signo. */
  cantidad:      number;
  fechaHora:     string;
}
