import { InjectionToken } from '@angular/core';
import { MuestraDetalle } from '../models/muestra-detalle.model';

/*
 * Una línea tal como llega de la sincronización: identifica al producto por
 * `sku`, no por id local. Resolver el producto es trabajo del repositorio —
 * quien llama no tiene por qué conocer sod_producto.
 */
export interface LineaMuestraParaGuardar {
  idMuestraDet: number;
  sku: string;
  codigoBarras: string | null;
  descripcion: string | null;
  stockSistema: number;
}

export interface MuestraDetalleRepository {
  getByMuestra(muestraId: number): Promise<MuestraDetalle[]>;

  /*
   * Deja el detalle de la muestra igual a `lineas`: da de alta los productos
   * que falten y reemplaza las líneas anteriores. Es reemplazo y no merge para
   * que un producto quitado de la muestra desaparezca también acá.
   */
  reemplazarDetalles(muestraId: number, lineas: LineaMuestraParaGuardar[]): Promise<void>;
}

export const MUESTRA_DETALLE_REPOSITORY_TOKEN = new InjectionToken<MuestraDetalleRepository>('MuestraDetalleRepository');
