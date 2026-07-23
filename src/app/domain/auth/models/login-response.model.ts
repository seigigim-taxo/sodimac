export interface LoginResponse {
  token: string;
  user: {
    nombreCompleto: string;
    apellidoPaterno: string;
    apellidoMaterno: string;
    rut: string;
    rutNormalizado: string;
    cargo: string;
    correo: string;
  };
}
