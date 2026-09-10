import { EstadoConteo } from './estado-conteo.model';

/*
 * Línea de trazabilidad por SKU dentro de un evento: una fila por cada
 * producto contado en una iteración/TAG/zona determinada. Vista de solo
 * lectura para el historial detallado.
 */
export interface ConteoTrazabilidadItem {
  iteracion:       number;
  conteoId:        number;
  tag:             string | null;
  zonaCodigo:      string;
  zonaNombre:      string | null;
  sku:             string;
  descripcion:     string | null;
  stockSistema:    number | null;
  cantidadFisica:  number;
  estado:          EstadoConteo;
  fechaHora:       string;
}
