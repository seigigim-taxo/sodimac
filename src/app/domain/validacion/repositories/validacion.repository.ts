import { InjectionToken } from '@angular/core';
import { ValidacionBloqueAnalista } from '../../sincronizacion/models/preparacion.model';

/*
 * Entrada para persistir una jornada de validación completa.
 * Se reemplaza por id_agenda para evitar duplicados en resincronización.
 */
export interface JornadaValidacionParaGuardar {
  eventoId: number;
  sucursalId: number;
  idAgenda: number | null;
  numeroAgenda: string | null;
  codigoMuestra: string | null;
  nombreMuestra: string | null;
  fechaJornada: string | null;
  bloques: BloqueValidacionParaGuardar[];
}

export interface BloqueValidacionParaGuardar {
  tipoValidacion: string;
  codigoZona: string | null;
  nombreZona: string | null;
  objetivoPorcentaje: number;
  tagsUsados: number;
  tagsConfirmados: number;
  tagsPendientes: number;
  porcentaje: number;
  cumple: boolean;
  tags: TagValidacionParaGuardar[];
  productos: ProductoValidacionParaGuardar[];
}

export interface TagValidacionParaGuardar {
  idTagBackend: number | null;
  numeroTag: number | null;
  codigoZona: string | null;
  nombreZona: string | null;
  productosTotal: number;
  productosConfirmados: number;
  estadoValidacion: string;
}

export interface ProductoValidacionParaGuardar {
  idTagBackend: number | null;
  numeroTag: number | null;
  idProductoBackend: number | null;
  sku: string;
  descripcion: string | null;
  cantidadInventariada: number;
  cantidadAnalista: number | null;
  estadoValidacion: string;
  flIncorporado: string;
}

export interface GuardarValidacionTagInput {
  tipoValidacion: 'ALTILLOS' | 'PUNTO_VENTA';
  numeroTag: number;
  productos: {
    sku: string;
    idProductoBackend: number | null;
    cantidadAnalista: number;
  }[];
}

export interface ValidacionRepository {
  reemplazarJornada(input: JornadaValidacionParaGuardar): Promise<number>;
  getBloqueActivoPorTipo(tipoValidacion: string): Promise<ValidacionBloqueAnalista | null>;
  guardarValidacionTag(input: GuardarValidacionTagInput): Promise<void>;
}

export const VALIDACION_REPOSITORY_TOKEN = new InjectionToken<ValidacionRepository>('ValidacionRepository');
