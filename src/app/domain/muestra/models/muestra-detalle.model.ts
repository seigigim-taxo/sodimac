export interface MuestraDetalle {
  id:                number;
  muestraId:         number;
  productoId:        number;
  sku:               string;
  stockSistema:      number;
  ubicacionEsperada: string | null;
}
