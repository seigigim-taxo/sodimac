import { EstadoConteo } from './estado-conteo.model';

/*
 * Vista agregada de una sesión de TAG: el grupo de líneas de
 * sod_conteo_detalle con la misma tupla (conteo, ubicacion, operador, pda,
 * estado). Recontar el mismo TAG en otra ronda genera un grupo distinto,
 * porque cambia el conteoId.
 *
 * `eventoId` viene del JOIN con la ronda: el resumen se muestra siempre en el
 * contexto de un evento, y tenerlo acá evita que cada consumidor lo resuelva.
 */
export interface ConteoResumen {
  conteoId:       number;
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
  iteracion:      number;
  fechaUltima:    string;
}
