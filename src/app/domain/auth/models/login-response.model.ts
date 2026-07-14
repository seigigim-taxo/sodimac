export interface LoginResponse {
  success: boolean;
  token?: string;
  user?: {
    id: number;
    name: string;
    rut: string;
  };
  error?: string;
}
