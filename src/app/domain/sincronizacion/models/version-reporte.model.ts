export type TipoReporteVersion = 'DETECCION' | 'CONFIRMACION_INSTALACION';

export interface VersionReportPayload {
  carga_uid: string;
  tipo_reporte: TipoReporteVersion;
  version_instalada_codigo: number;
  version_instalada_nombre: string;
  version_destino_codigo: number;
  version_destino_nombre: string;
  operador_rut: string;
  operador_correo: string;
  pda_codigo: string;
  pda_marca: string | null;
  pda_modelo: string | null;
  tienda_codigo: string;
  tienda_nombre: string;
  fecha_reporte: string;
}

/*
 * Lo que queda DESPUES del unwrap de ApiService: el servidor contesta
 * { status, msg, data: { id } } y post() ya devuelve solo `data`.
 * Modelarla con el envoltorio completo hacía que `response.data.id` fuera
 * undefined.id — un TypeError que convertía cada envío exitoso en ERROR,
 * y la confirmación de instalación se reintentaba para siempre sin cerrarse.
 */
export interface VersionReportResponse {
  id: number;
}
