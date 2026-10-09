import { InjectionToken } from '@angular/core';

/*
 * Lo que el servidor dice de UN envío (un carga_uid).
 *
 * Es la respuesta a "¿recibiste esto?". Se pregunta a propósito sin reenviar el
 * contenido: un TAG puede tener cientos de lecturas, y subirlas enteras solo para
 * averiguar si ya llegaron es lo peor que se puede hacer justo cuando la
 * conexión está mala, que es cuando se pierden las respuestas.
 */
export interface EstadoCargaServidor {
  cargaUid: string;
  /** ¿El servidor tiene un envío con este identificador? */
  existe: boolean;
  /** RECIBIDO (guardado, sin procesar), PROCESADO o ERROR. null si no existe. */
  estado: 'RECIBIDO' | 'PROCESADO' | 'ERROR' | null;
  /** Cuántas lecturas guardó. null si no existe. */
  totalLecturas: number | null;
  totalUnidades: number | null;
  /*
   * A QUÉ envío corresponde ese uid, tal como lo guardó el servidor. Sirve para
   * comprobar que es el MISMO TAG antes de darlo por enviado: un uid que existe
   * pero pertenece a otro TAG u otra agenda no prueba que el nuestro llegó.
   * null si no existe o si el servidor no lo informó.
   */
  codigoTienda: string | null;
  tagCodigo: string | null;
  iteracion: number | null;
  numeroAgenda: string | null;
}

/*
 * PUERTO — consulta de solo lectura: no guarda nada ni cambia ningún estado, así
 * que se puede repetir sin riesgo.
 *
 * Lanza lo mismo que ApiService: un NetworkError si no hubo respuesta, un
 * ApiError si el servidor contestó con un error (por ejemplo 404 si el endpoint
 * todavía no está desplegado).
 */
export interface EstadoCargasApiRepository {
  consultar(cargaUids: readonly string[]): Promise<EstadoCargaServidor[]>;
}

export const ESTADO_CARGAS_API_REPOSITORY_TOKEN =
  new InjectionToken<EstadoCargasApiRepository>('EstadoCargasApiRepository');
