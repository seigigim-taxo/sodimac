export interface ErrorReport {
  // Usuario
  rut: string;
  nombreCompleto?: string;
  correo: string;
  tipoUsuario: string;

  // App
  versionApp: string;
  fechaHora: string;

  // Tienda
  codigoTienda: string;
  nombreTienda: string;

  // Dispositivo
  dispositivo: string;
  plataforma: string;
  sistemaOperativo: string;

  // Reporte
  descripcion: string;
  screenshotPath: string;
  tipoReporte: 'MANUAL' | 'AUTOMATICO';
  pantallaActual: string;
  errorStack?: string;
}

export interface ErrorReportRecord extends ErrorReport {
  id?: number;
  enviado: number;
  intentos: number;
  estado: 'PENDIENTE' | 'ENVIADO' | 'ERROR';
  fechaCreacion: string;
}
