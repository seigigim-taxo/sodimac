export interface ApiLoginUser {
  nombre_completo: string;
  apellido_paterno: string;
  apellido_materno: string;
  rut: string;
  rut_normalizado: string;
  rol: string;
  correo: string;
}

export interface ApiLoginData {
  token: string;
  user: ApiLoginUser;
}
