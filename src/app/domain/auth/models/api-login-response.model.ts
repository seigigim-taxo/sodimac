export interface ApiLoginUser {
  rut: string;
  rut_normalizado: string;
  correo: string;
}

export interface ApiLoginData {
  user: ApiLoginUser;
}
