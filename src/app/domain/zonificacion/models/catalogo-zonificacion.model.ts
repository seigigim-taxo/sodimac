/*
 * Catálogo de zonas que entrega catalogo.php. Es propio de zonificación: no
 * reemplaza al de zonas del conteo (`domain/zona`), que llega hasta 9999 con
 * tipo OTRO y lo usa el conteo.
 */
export interface ZonaZonificacion {
  idRegla: number;
  codigoZona: string;
  nombre: string;
  tagDesde: number;
  tagHasta: number;
  orden: number;
  /* Código que la app manda al capturar un TAG. Nunca VENTAS_ADICIONALES. */
  codigoTipoUbicacion: string | null;
  idTipoUbicacion: number | null;
}

/* Umbrales nulos = sin límite. */
export interface ParametrosZonificacion {
  cantidadAdvertencia: number | null;
  cantidadMaxima: number | null;
  motivoLargoMinimo: number;
  referenciaLargoMaximo: number;
}

export interface CatalogoZonificacion {
  version: string;
  zonas: ZonaZonificacion[];
  parametros: ParametrosZonificacion;
}
