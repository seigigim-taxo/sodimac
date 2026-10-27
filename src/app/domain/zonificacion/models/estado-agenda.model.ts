import { EstadoZonificacion } from './estado-zonificacion.model';
import { RangoZonificacion } from './rango-zonificacion.model';

/*
 * Lo que el servidor informa de una agenda en estado.php y en la respuesta de
 * toda escritura (`data.estado`). Es la verdad de la pantalla: la app la aplica
 * tal cual y encima le superpone lo que todavía está en la cola de envío.
 */

export interface AgendaZonificacion {
  idAgenda: number;
  numeroAgenda: string;
  fechaAgenda: string;
  codigoEstado: string;
  /* false si está cerrada o suspendida. */
  operable: boolean;
  /* true si el operador no puede modificarla (sin escritura, o sin asignación). */
  soloLectura: boolean;
}

export interface CabeceraZonificacion {
  /* null mientras la agenda no tiene cabecera (SIN_ZONIFICACION). */
  idZonificacion: number | null;
  estado: EstadoZonificacion;
  fechaModificacion: string | null;
  loginModificacion: string | null;
  fechaConfirmacion: string | null;
}

export interface ResumenZonificacion {
  cantidadZonas: number;
  tagsZonificados: number;
  tagsUsados: number;
  tagsPendientes: number;
  porcentajeTagsContados: number;
  desbalance: boolean;
  zonificacionOk: boolean;
}

export interface TagAnulado {
  numeroTag: number;
  motivo: string;
  fechaAnulacion: string | null;
  loginAnulacion: string | null;
}

/* El servidor entrega el total y solo unos ejemplos: la pantalla muestra el total. */
export interface TagsFuera {
  total: number;
  ejemplos: number[];
}

export interface EstadoAgenda {
  agenda: AgendaZonificacion;
  zonificacion: CabeceraZonificacion;
  resumen: ResumenZonificacion;
  rangos: RangoZonificacion[];
  tagsAnulados: TagAnulado[];
  tagsFuera: TagsFuera;
  horaServidor: string | null;
}

/* Una fila de la lista de agendas (agendas.php). */
export interface AgendaDeLista {
  idAgenda: number;
  numeroAgenda: string;
  fechaAgenda: string;
  tienda: { idTienda: number; codigoTienda: string; nombreTienda: string };
  codigoEstado: string;
  operable: boolean;
  soloLectura: boolean;
  zonificacion: {
    estado: EstadoZonificacion;
    cantidadZonas: number;
    tagsZonificados: number;
    /* TAG ya capturados en el conteo: con esto y sin confirmar, el conteo va por delante de la zonificación. */
    tagsCapturados: number;
  };
}

export interface ListaAgendas {
  hoy: string;
  agendas: AgendaDeLista[];
}
