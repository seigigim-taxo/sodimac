export interface ValidacionAnalistaItemPayload {
  id_producto: number;
  sku: string;
  decision: 'CONFIRMAR' | 'MODIFICAR';
  cantidad: number;
  detalle_uid: string;
  fecha_hora: string;
}

export interface ValidacionAnalistaPayload {
  carga_uid: string;
  id_agenda: number;
  numero_agenda: string | null;
  codigo_tienda: string;
  fecha_programada: string;
  pda_codigo: string;
  operador_rut: string;
  login: string;
  modo: 'TAG';
  tipo: 'ALTILLO' | 'PDV';
  id_tag: number;
  numero_tag: number;
  motivo: string;
  items: ValidacionAnalistaItemPayload[];
}

export interface ValidacionAnalistaResponse {
  id_conteo_2: number;
  total_productos: number;
  total_unidades: number;
}

export interface GuardarSyncValidacionInput {
  eventoId: number | null;
  pdaId: number;
  cargaUid: string;
  payload: ValidacionAnalistaPayload;
}
