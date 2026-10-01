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

export interface VersionReportResponse {
  status: string;
  msg: string;
  data: { id: number };
}
