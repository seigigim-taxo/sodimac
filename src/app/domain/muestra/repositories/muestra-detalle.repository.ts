import { InjectionToken } from '@angular/core';
import { MuestraDetalle } from '../models/muestra-detalle.model';

/*
 * Código de lectura válido para un producto, para lookup de scan.
 * Devuelto por getCodigosByMuestra().
 */
export interface CodigoProductoMuestra {
  codigoLectura: string;
  productoId: number;
  descripcion: string | null;
  /*
   * SKU y código de barras DEL PRODUCTO (sod_producto), no de esta fila —
   * `codigoLectura` es solo lo que hace match al escanear, sea cual sea; esto
   * es lo que el feedback visual necesita para mostrar el otro código además
   * del que se usó, si el producto lo tiene.
   */
  sku: string;
  codigoBarras: string | null;
}

/*
 * Código de lectura válido para un producto. Se persiste en sod_producto_detalle.
 */
export interface CodigoProductoParaGuardar {
  codigoLectura: string;
  tipoCodigo: string | null;
  codigoBarras: string | null;
}

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
  codigos: CodigoProductoParaGuardar[];
}

export interface MuestraDetalleRepository {
  getByMuestra(muestraId: number): Promise<MuestraDetalle[]>;

  /*
   * Cuántas líneas tiene la muestra, sin traerlas. Existe porque contar con
   * getByMuestra(...).length lleva cada línea por el puente de Capacitor solo
   * para quedarse con un número: con una muestra de 23.000 productos eso deja
   * la pantalla sin responder.
   */
  contarByMuestra(muestraId: number): Promise<number>;

  /*
   * Devuelve todos los códigos de lectura (sod_producto_detalle) de los
   * productos que pertenecen a la muestra indicada. Se usa para construir
   * el mapa de scan: código de lectura → productoId.
   */
  getCodigosByMuestra(muestraId: number): Promise<CodigoProductoMuestra[]>;

  /*
   * Deja el detalle de la muestra igual a `lineas`: da de alta los productos
   * que falten y reemplaza las líneas anteriores. Es reemplazo y no merge para
   * que un producto quitado de la muestra desaparezca también acá.
   */
  reemplazarDetalles(muestraId: number, lineas: LineaMuestraParaGuardar[]): Promise<void>;
}

export const MUESTRA_DETALLE_REPOSITORY_TOKEN = new InjectionToken<MuestraDetalleRepository>('MuestraDetalleRepository');
