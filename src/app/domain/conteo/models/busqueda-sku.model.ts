// Resultado de buscar en qué TAG(s) se ha registrado un SKU.
export interface BusquedaSkuResultado {
  /*
   * De qué conteo es esta fila. Viaja siempre, aunque la búsqueda esté acotada
   * a un evento: sin él, buscar fuera de un evento devolvería filas que no se
   * pueden distinguir entre sí — el mismo TAG y la misma zona se repiten de un
   * conteo al siguiente.
   */
  eventoNombre: string;
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
