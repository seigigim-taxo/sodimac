import { InjectionToken } from '@angular/core';
import { OperadorCacheado } from '../models/operador-cacheado.model';

/*
 * Fuera del argumento de guardarPerfil() queda todo lo que no decide quien
 * llama: `id` y `fechaRegistro` los pone SQLite, `rolId` lo resuelve el
 * repositorio a partir de `cargo`, y `nombreCompleto` se arma al leer desde las
 * tres columnas en que se guarda el nombre.
 */
export type OperadorParaGuardar = Omit<
  OperadorCacheado,
  'id' | 'fechaRegistro' | 'rolId' | 'nombreCompleto'
>;

/*
 * Dos escrituras con intenciones distintas, deliberadamente separadas.
 *
 * El login solo necesita el id local del operador; si escribiera el perfil
 * tendría que mandar los campos que no conoce en null y pisaría lo que dejó la
 * sincronización. Con firmas separadas ese error no se puede escribir.
 */
export interface OperadorRepository {
  /* Crea el operador si no existe y devuelve su id local. Nunca actualiza. */
  asegurarOperador(rut: number, rutDv: string, correo: string): Promise<number>;

  /* Escribe el perfil completo. Un null acá sí significa "dejalo vacío". */
  guardarPerfil(operador: OperadorParaGuardar): Promise<void>;

  obtenerPorRut(rut: number, rutDv: string): Promise<OperadorCacheado | null>;
}

export const OPERADOR_REPOSITORY_TOKEN = new InjectionToken<OperadorRepository>('OperadorRepository');
