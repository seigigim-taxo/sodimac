import { InjectionToken } from '@angular/core';
import { ZonaTipo } from '../models/zona-tipo.model';

export interface ZonaTipoParaGuardar {
  nombre: string;
  descripcion: string | null;
}

export interface ZonaTipoRepository {
  /* Inserta el tipo si no existe (por nombre UNIQUE); devuelve su id local. */
  asegurarTipo(tipo: ZonaTipoParaGuardar): Promise<number>;
  getAll(): Promise<ZonaTipo[]>;
}

export const ZONA_TIPO_REPOSITORY_TOKEN = new InjectionToken<ZonaTipoRepository>('ZonaTipoRepository');
