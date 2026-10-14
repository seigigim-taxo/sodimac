import { InjectionToken } from '@angular/core';

/*
 * Lo que resulta de registrar un TAG: no siempre es "una fila nueva y listo".
 */
export interface ResultadoUbicacion {
  /*
   * La ubicación sobre la que se va a contar — nueva, o una reabierta. Si es
   * un TAG FINALIZADO que se reabrió, la pantalla de conteo lo nota sola:
   * IniciarSesionConteoUseCase encuentra las líneas ya EN_CURSO y `recovered`
   * sale true. No hace falta un campo aparte acá para eso.
   */
  ubicacionId: number;
  /*
   * Un TAG SINCRONIZADO —inmutable— que coincide en zona+código+tag dentro de
   * la misma ronda, o null si no hay ninguno. Nunca se reabre ni se toca: es
   * solo la referencia de lo que ya se contó ahí, para mostrar de lectura en
   * la pantalla de conteo del TAG NUEVO que se acaba de crear.
   */
  ubicacionSincronizadaId: number | null;
  /*
   * Si la referencia de arriba es un TAG que el servidor ya tiene o pudo
   * haber recibido, por qué no se pudo reabrir: 'ENVIADO' (lo tiene) o
   * 'EN_DUDA' (no se pudo confirmar). La pantalla lo usa para avisarle al
   * operador por qué ve un TAG nuevo en vez de seguir el anterior. null si no
   * hay referencia.
   */
  referenciaBloqueada: 'ENVIADO' | 'EN_DUDA' | null;
}

export interface UbicacionRepository {
  insert(
    zonaId: number, codigo: string, tag: string,
    conteoId: number, operadorId: number, pdaId: number
  ): Promise<ResultadoUbicacion>;
}

export const UBICACION_REPOSITORY_TOKEN = new InjectionToken<UbicacionRepository>('UbicacionRepository');
