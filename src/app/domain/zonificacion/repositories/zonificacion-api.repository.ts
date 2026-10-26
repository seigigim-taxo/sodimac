import { CatalogoZonificacion } from '../models/catalogo-zonificacion.model';
import { EstadoAgenda, ListaAgendas } from '../models/estado-agenda.model';
import { IdentidadOperador, ResultadoOperacion, SolicitudOperacion } from '../models/operacion-zonificacion.model';

/*
 * Cliente de los endpoints de zonificación del WS (contrato v1).
 *
 * Los fallos se lanzan, no se devuelven: ApiError cuando el servidor contestó
 * (con su `status`, `codigo` y `datos`) y NetworkError cuando no hubo respuesta.
 * Quién decide si un fallo es definitivo o se reintenta es la capa de
 * aplicación, con `esErrorDefinitivo` y la regla de que un NetworkError nunca
 * descarta nada: puede haber llegado.
 */
export interface ZonificacionApiRepository {
  obtenerCatalogo(): Promise<CatalogoZonificacion>;

  listarAgendas(identidad: IdentidadOperador): Promise<ListaAgendas>;

  obtenerEstado(identidad: IdentidadOperador, idAgenda: number, numeroAgenda: string): Promise<EstadoAgenda>;

  enviar(solicitud: SolicitudOperacion): Promise<ResultadoOperacion>;
}
