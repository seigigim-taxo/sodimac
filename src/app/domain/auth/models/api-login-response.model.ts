export interface ApiLoginUser {
  id: number;
  name: string;
  rut: string;
  rol: string;
  correo: string;
}

export interface ApiLoginData {
  token: string;
  user: ApiLoginUser;
}

export interface ApiLoginResponse {
  status: 'OK' | 'ERROR';
  msg: string;
  data?: ApiLoginData;
}
