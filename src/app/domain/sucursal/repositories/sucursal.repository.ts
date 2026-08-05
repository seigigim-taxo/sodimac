import { InjectionToken } from '@angular/core';
import { Sucursal } from '../models/sucursal.model';

/* Lo mínimo para dar de alta una tienda; el resto de las columnas es opcional. */
export interface SucursalParaGuardar {
  codigoTienda: string;
  nombre: string;
}

export interface SucursalRepository {
  getByUsuario(userId: number): Promise<Sucursal[]>;

  /*
   * Guarda las tiendas y las vincula al operador en una sola operación: una
   * tienda sin vínculo en sod_user_sucursal es invisible para getByUsuario(),
   * así que separarlo en dos métodos invitaría a olvidar el segundo.
   */
  guardarDeUsuario(userId: number, tiendas: SucursalParaGuardar[]): Promise<void>;

  /*
   * Traduce el código de tienda del backend al id local. Todo lo que cuelga de
   * una sucursal (eventos, muestras) necesita este id, no el remoto.
   */
  getIdPorCodigo(codigoTienda: string): Promise<number | null>;
}

export const SUCURSAL_REPOSITORY_TOKEN = new InjectionToken<SucursalRepository>('SucursalRepository');
