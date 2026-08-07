// Resultado de buscar en qué TAG(s) se ha registrado un SKU dentro de un evento.
export interface BusquedaSkuResultado {
  iteracion:  number;
  tag:        string | null;
  zonaCodigo: string;
  zonaNombre: string | null;
  cantidad:   number;
}
