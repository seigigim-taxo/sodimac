import { MedioCaptura } from '../../conteo/models/medio-captura.model';

/*
 * Un código usado en la línea y cómo entró. Sin cantidad ni fecha: es el
 * conjunto de combinaciones distintas, no un log de escaneos (formato acordado
 * con el SGO).
 */
export interface TagFinalizadoLecturaPayload {
  codigo_lectura: string;
  medio_captura: MedioCaptura;
}

export interface TagFinalizadoDetallePayload {
  detalle_uid: string;
  codigo_lectura: string | null;
  sku: string;
  codigo_barras: string | null;
  descripcion: string | null;
  stock_sistema: number | null;
  cantidad_fisica: number;
  fecha_hora: string;
  lecturas: TagFinalizadoLecturaPayload[];
}

export interface TagFinalizadoPayload {
  carga_uid: string;
  codigo_tienda: string;
  fecha_programada: string;
  iteracion: number;
  tag_codigo: string;
  zona_nombre: string;
  zona_descripcion: string | null;
  operador_rut: string;
  operador_login: string;
  pda_codigo: string;
  codigo_muestra: string | null;
  id_agenda: number | null;
  numero_agenda: string | null;
  ubicacion_codigo: string;
  detalles: TagFinalizadoDetallePayload[];
}

export interface TagFinalizadoResponse {
  carga_uid: string;
  carga_id: number;
  total_productos: number;
  total_unidades: number;
}
