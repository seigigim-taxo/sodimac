import { EstadoConteo } from './estado-conteo.model';

/*
 * Línea de trazabilidad por lectura dentro de un evento: una fila por cada
 * lectura individual de sod_conteo_lectura. Vista de solo lectura para el
 * historial detallado.
 */
export interface ConteoTrazabilidadItem {
  lecturaId:       number;
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
