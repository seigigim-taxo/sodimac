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

  /*
   * Con qué versión de la app se registró esta validación.
   *
   * Mismos campos y mismo criterio que TagFinalizadoPayload: los dos flujos
   * llegan al SGO por el mismo enviar-pendientes, y que uno quedara trazado y
   * el otro no dejaba la mitad del trabajo del analista sin poder atribuirse a
   * una versión.
   */
  version_app: string;
  version_code: number;

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

/*
 * La validación LEÍDA de sod_sincronizacion. Misma razón que
 * TagFinalizadoPayloadAlmacenado: las filas que quedaron pendientes antes de
 * que existiera el campo no traen la versión, y el tipo no puede afirmar que sí.
 */
export type ValidacionAnalistaPayloadAlmacenado =
  Omit<ValidacionAnalistaPayload, 'version_app' | 'version_code'> &
  Partial<Pick<ValidacionAnalistaPayload, 'version_app' | 'version_code'>>;
