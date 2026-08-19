export interface OperadorCacheado {
  id: number;
  rolId: number;
  /* Nombre del rol (sod_rol.nombre). Es el `cargo` que devuelve el backend. */
  cargo: string | null;
  rut: number;
  rutDv: string;
  nombres: string | null;
  apellidoPaterno: string | null;
  apellidoMaterno: string | null;
  /* Derivado al leer: sod_user guarda el nombre en partes, no completo. */
  nombreCompleto: string | null;
  correo: string;
  fechaRegistro: string;
}
