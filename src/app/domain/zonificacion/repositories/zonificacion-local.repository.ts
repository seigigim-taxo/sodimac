import { CatalogoZonificacion } from '../models/catalogo-zonificacion.model';
import { ErrorZonificacion } from '../models/error-zonificacion.model';
import { EstadoAgenda, ListaAgendas } from '../models/estado-agenda.model';
import { OperacionEnCola, TipoOperacionZonificacion } from '../models/operacion-zonificacion.model';

/* Una copia guardada en el teléfono, con el momento en que se descargó. */
export interface CopiaLocal<T> {
  valor: T;
  /* `YYYY-MM-DD HH:MM:SS`, hora local. */
  fechaDescarga: string;
}

export interface NuevaOperacion {
  operacionUid: string;
  idAgenda: number;
  numeroAgenda: string;
  tipo: TipoOperacionZonificacion;
  /* Clave local del rango, solo para operaciones sobre un rango que aún no tiene id del servidor. */
  claveRango: string | null;
  datos: Record<string, unknown>;
  operadorLogin: string;
  operadorRut: string;
  fechaHoraLocal: string;
}

/*
 * Lo que la app recuerda de zonificación en SQLite: las copias que permiten
 * trabajar sin red y la cola de envío. Ver las tablas sod_zonificacion_* en
 * core/database/sodimac.schema.ts.
 */
export interface ZonificacionLocalRepository {
  guardarCatalogo(catalogo: CatalogoZonificacion): Promise<void>;
  obtenerCatalogo(): Promise<CopiaLocal<CatalogoZonificacion> | null>;

  guardarListaAgendas(operadorLogin: string, lista: ListaAgendas): Promise<void>;
  obtenerListaAgendas(operadorLogin: string): Promise<CopiaLocal<ListaAgendas> | null>;

  guardarEstado(estado: EstadoAgenda): Promise<void>;
  obtenerEstado(idAgenda: number): Promise<CopiaLocal<EstadoAgenda> | null>;

  /* La operación entra PENDIENTE. Un operacion_uid repetido es un error de programación: la base lo rechaza. */
  encolar(operacion: NuevaOperacion): Promise<OperacionEnCola>;
  obtenerOperacion(id: number): Promise<OperacionEnCola | null>;
  /* Primero en entrar, primero en salir. Sin `idAgenda`, las de todas las agendas. */
  listarPendientes(idAgenda?: number): Promise<OperacionEnCola[]>;
  listarRechazadas(idAgenda?: number): Promise<OperacionEnCola[]>;
  contarPendientes(): Promise<number>;
  contarRechazadas(): Promise<number>;
  /* Editar un rango que aún no salió cambia su contenido en la cola; el operacion_uid no se toca. */
  actualizarDatos(id: number, datos: Record<string, unknown>): Promise<void>;
  /* Anota un intento fallido que se reintentará (error transitorio). */
  registrarIntentoFallido(id: number): Promise<void>;
  /* Rechazo definitivo del servidor: no se reintenta. */
  marcarRechazada(id: number, error: ErrorZonificacion, mensaje: string | null): Promise<void>;
  /* El servidor la aplicó, o el operador descartó un rechazo. */
  eliminar(id: number): Promise<void>;
}
