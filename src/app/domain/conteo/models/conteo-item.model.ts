import { EstadoConteo } from './estado-conteo.model';

export interface ConteoItem {
  id:             number;
  eventoId:       number;
  ubicacionId:    number;
  productoId:     number;
  sku:            string;
  descripcion:    string | null;
  cantidadFisica: number;
  estado:         EstadoConteo;
  iteracion:      number;
  fechaHora:      string;
}
