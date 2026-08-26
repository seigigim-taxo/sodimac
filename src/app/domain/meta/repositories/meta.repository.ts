import { InjectionToken } from '@angular/core';

/*
 * Acceso a sod_meta: pares clave/valor de la propia base.
 *
 * Existe para que el estado que debe sobrevivir a un reinicio —y viajar con el
 * archivo de la base— no termine en Capacitor Preferences. Ese fue justamente
 * el problema de la versión de esquema: guardada afuera, restaurar un respaldo
 * dejaba la base vieja y el registro diciendo que estaba al día.
 */
export interface MetaRepository {
  obtener(clave: string): Promise<string | null>;
  guardar(clave: string, valor: string): Promise<void>;
}

/*
 * Fecha local (YYYY-MM-DD) de la última preparación exitosa: la última vez que
 * la PDA bajó datos del servidor.
 *
 * Es lo que responde "los datos que tengo, ¿son de hoy?", y de ahí cuelgan dos
 * comportamientos: forzar la sincronización al entrar y cerrar la sesión cuando
 * el día cambió con la app abierta.
 */
export const CLAVE_ULTIMA_PREPARACION = 'ultima_preparacion';

export const META_REPOSITORY_TOKEN = new InjectionToken<MetaRepository>('MetaRepository');
