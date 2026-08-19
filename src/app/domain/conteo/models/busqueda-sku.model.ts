// Resultado de buscar en qué TAG(s) se ha registrado un SKU dentro de un evento.
export interface BusquedaSkuResultado {
  /*
   * El SKU concreto de esta fila. Hace falta desde que la búsqueda es por
   * prefijo: un mismo término puede traer varios SKU distintos, y sin este
   * campo la lista no diría a cuál pertenece cada ubicación.
   */
  sku:        string;
  iteracion:  number;
  tag:        string | null;
  zonaCodigo: string;
  zonaNombre: string | null;
  cantidad:   number;
}
