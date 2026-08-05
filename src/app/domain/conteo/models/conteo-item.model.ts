import { EstadoConteo } from './estado-conteo.model';

/* Una línea contada: pertenece a una ronda (conteoId) y a un TAG (ubicacionId). */
export interface ConteoItem {
  id:             number;
  conteoId:       number;
  ubicacionId:    number;
  productoId:     number;
  sku:            string;
  descripcion:    string | null;
  cantidadFisica: number;
  estado:         EstadoConteo;
  /* Número de la ronda a la que pertenece; viene del JOIN con sod_conteo. */
  iteracion:      number;
  fechaHora:      string;
}
