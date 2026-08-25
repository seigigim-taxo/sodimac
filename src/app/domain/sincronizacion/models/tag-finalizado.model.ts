import { MedioCaptura } from '../../conteo/models/medio-captura.model';

/*
 * Un código usado en la línea, cómo entró y cuántas unidades le corresponden.
 *
 * Va agrupado por (código, medio): diez escaneos del mismo EAN son una entrada
 * con la suma, no diez entradas. La PDA sí guarda el detalle captura por
 * captura — acá se manda el agregado que el SGO necesita.
 *
 * `cantidad` es el movimiento neto de unidades de ese par y PUEDE SER NEGATIVA
 * o cero: quitar unidades agrega un movimiento negativo en vez de borrar la
 * captura anterior. La suma de todas las lecturas da cantidad_fisica.
 *
 * `codigo_lectura` es NULO para los ajustes con los botones +/-, que mueven
 * unidades sin que el operador lea nada.
 *
 * IMPORTANTE para el reporte: "¿se escaneó este código?" se responde por la
 * PRESENCIA del par (código, medio), no por el signo de `cantidad`. Un código
 * escaneado y después retractado suma cero y sigue siendo un código escaneado.
 */
export interface TagFinalizadoLecturaPayload {
  codigo_lectura: string | null;
  medio_captura: MedioCaptura;
  cantidad: number;
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
