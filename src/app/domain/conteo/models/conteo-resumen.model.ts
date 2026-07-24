import { EstadoConteo } from './estado-conteo.model';

/*
 * Vista agregada de un conteo: el grupo de filas de sod_conteo con la misma
 * tupla (evento, ubicacion, operador, pda, estado). Un reconteo de la misma
 * ubicación genera un grupo EN_CURSO separado del FINALIZADO anterior.
 */
export interface ConteoResumen {
  eventoId:       number;
  ubicacionId:    number;
  operadorId:     number;
  pdaId:          number;
  estado:         EstadoConteo;
  tag:            string | null;
  zonaCodigo:     string;
  zonaNombre:     string | null;
  totalProductos: number;
  totalUnidades:  number;
  fechaUltima:    string;
}
