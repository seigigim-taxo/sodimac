/*
 * Resultado de buscar en qué TAG(s) se ha registrado un SKU dentro de la jornada
 * de inventario. Lleva la iteración porque un mismo TAG puede aparecer en varias
 * rondas con cantidades distintas, y "en qué ronda" es parte de la respuesta.
 */
export interface BusquedaSkuResultado {
  iteracion:  number;
  tag:        string | null;
  zonaCodigo: string;
  zonaNombre: string | null;
  cantidad:   number;
}
