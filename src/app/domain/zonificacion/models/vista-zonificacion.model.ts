import { EstadoZonificacion } from './estado-zonificacion.model';
import { OperacionEnCola } from './operacion-zonificacion.model';
import { IdRango } from './rango-zonificacion.model';

/*
 * Lo que ve el operador de una agenda: el último estado conocido del servidor
 * con encima lo que hizo y todavía no salió (la cola de envío).
 *
 * Es la fuente de las pantallas Y de las reglas: un rango nuevo se valida
 * contra los que ya están pendientes, no solo contra los que el servidor tiene.
 */

export interface RangoEnVista {
  /* Id del servidor si ya se envió; clave local mientras el rango espera salir. */
  id: IdRango;
  /* null mientras el servidor no le haya dado su id. */
  idServidor: number | null;
  codigoZona: string;
  nombreZona: string;
  tagDesde: number;
  tagHasta: number;
  referenciaUbicacion: string | null;
  /* TAG del rango menos los anulados que caen dentro. */
  cantidad: number;
  /* true si es nuevo o editado y aún no llegó al servidor. */
  pendiente: boolean;
  /* La operación en la cola que lo creó o editó, para poder cambiarla sin generar otra. */
  operacionUid: string | null;
}

export interface TagAnuladoEnVista {
  numeroTag: number;
  motivo: string;
  pendiente: boolean;
}

export interface VistaZonificacion {
  /* Estado efectivo: CONFIRMADA si hay un confirmar pendiente, BORRADOR si hay un reabrir pendiente. */
  estado: EstadoZonificacion;
  confirmacionPendiente: boolean;
  reaperturaPendiente: boolean;
  rangos: RangoEnVista[];
  tagsAnulados: TagAnuladoEnVista[];
  /* Operaciones que siguen esperando salir. */
  pendientes: OperacionEnCola[];
  /* Operaciones que el servidor rechazó para siempre; esperan a que el operador las descarte. */
  rechazadas: OperacionEnCola[];
}
