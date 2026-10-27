import { ErrorZonificacion } from './error-zonificacion.model';
import { EstadoAgenda } from './estado-agenda.model';

/*
 * Las acciones del operador que escriben en el servidor. Cada una es una
 * operación con su propio `operacion_uid`.
 */
export type TipoOperacionZonificacion = 'GUARDAR_RANGO' | 'ELIMINAR_RANGO' | 'ANULAR_TAG' | 'CONFIRMAR' | 'REABRIR';

/* Quién y desde dónde: va en TODA petición (también en las de lectura). */
export interface IdentidadOperador {
  operadorLogin: string;
  operadorRut: string;
  pdaCodigo: string;
  versionApp: string;
}

/* Lo que se manda al servidor. `datos` es el objeto "datos" del contrato, ya en su forma de red. */
export interface SolicitudOperacion {
  operacionUid: string;
  tipo: TipoOperacionZonificacion;
  idAgenda: number;
  numeroAgenda: string;
  datos: Record<string, unknown>;
  /* `YYYY-MM-DD HH:MM:SS`, hora local de la PDA. */
  fechaHoraLocal: string;
  identidad: IdentidadOperador;
}

/*
 * APLICADA: el servidor la hizo ahora. YA_APLICADA: la había hecho antes (un
 * reintento tras perder la respuesta); el resultado es el mismo y no se duplica.
 * Para la app son lo mismo: la operación terminó y sale de la cola.
 */
export interface ResultadoOperacion {
  resultado: 'APLICADA' | 'YA_APLICADA';
  operacionUid: string;
  /* Solo en guardar y eliminar rango. */
  idZonificacionDet: number | null;
  /* Solo en anular TAG. */
  numeroTag: number | null;
  estado: EstadoAgenda;
}

/* Una operación esperando salir (PENDIENTE) o rechazada para siempre (RECHAZADO). */
export type EstadoEnvio = 'PENDIENTE' | 'RECHAZADO';

export interface OperacionEnCola {
  id: number;
  operacionUid: string;
  idAgenda: number;
  numeroAgenda: string;
  tipo: TipoOperacionZonificacion;
  /* Clave local del rango mientras el servidor no le haya dado su id. */
  claveRango: string | null;
  datos: Record<string, unknown>;
  operadorLogin: string;
  operadorRut: string;
  fechaHoraLocal: string;
  estado: EstadoEnvio;
  error: ErrorZonificacion | null;
  mensajeError: string | null;
  intentos: number;
  fechaCreacion: string;
  fechaUltimoIntento: string | null;
}
