/*
 * Lo mínimo que las reglas necesitan saber de un rango ya guardado o aún
 * pendiente de envío. El `id` es el del servidor (`id_zonificacion_det`) cuando
 * el rango ya se envió, y una clave local mientras no: el servidor entrega el id
 * recién en la respuesta del guardado.
 */
export type IdRango = number | string;

export interface RangoActivo {
  id: IdRango;
  tagDesde: number;
  tagHasta: number;
}

/* Un rango tal como lo muestra el resumen (estado.php). */
export interface RangoZonificacion extends RangoActivo {
  orden: number;
  codigoZona: string;
  nombreZona: string;
  codigoTipoUbicacion: string | null;
  referenciaUbicacion: string | null;
  qtyZonificado: number;
  qtyUsado: number;
  qtyPendiente: number;
  porcentajeCierre: number;
  desbalance: boolean;
}
