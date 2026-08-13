export interface Zona {
  id: number;
  sucursalId: number;
  nombre: string;
  descripcion: string | null;
  tagDesde: number | null;
  tagHasta: number | null;
}
