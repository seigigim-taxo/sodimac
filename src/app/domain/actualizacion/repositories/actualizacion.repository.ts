import { InjectionToken } from '@angular/core';
import { VersionDisponible } from '../models/version-disponible.model';

/*
 * Las tres piezas de la autoactualización, separadas porque tienen naturalezas
 * distintas: una consulta HTTP, una descarga nativa y el instalador del
 * sistema. Mantenerlas aparte permite probar la lógica de decisión sin nada de
 * Android de por medio.
 */

/** Le pregunta al servidor cuál es la última versión publicada. */
export interface ActualizacionApiRepository {
  consultarUltimaVersion(): Promise<VersionDisponible | null>;
}

export const ACTUALIZACION_API_REPOSITORY_TOKEN =
  new InjectionToken<ActualizacionApiRepository>('ACTUALIZACION_API_REPOSITORY_TOKEN');

export interface DescargaProgreso {
  /** 0..100, o null mientras el servidor no informe el tamaño total. */
  porcentaje: number | null;
}

/*
 * Baja el APK y lo deja en disco.
 *
 * La descarga es NATIVA, no del WebView: son ~28 MB y, sobre todo, así no pasa
 * por las reglas de origen. La carpeta del APK en el servidor no tiene headers
 * de CORS y no los necesita justamente por esto.
 */
export interface DescargaRepository {
  descargar(url: string, onProgreso?: (p: DescargaProgreso) => void): Promise<string>;
  /** SHA-256 en minúsculas del archivo en esa ruta. */
  hashDe(ruta: string): Promise<string>;
  borrar(ruta: string): Promise<void>;
}

export const DESCARGA_REPOSITORY_TOKEN =
  new InjectionToken<DescargaRepository>('DESCARGA_REPOSITORY_TOKEN');

/*
 * El instalador del sistema. Es la única parte que no se puede escribir en
 * TypeScript — ver ActualizadorPlugin.java.
 */
export interface InstaladorRepository {
  /** Versión instalada, para comparar contra la del servidor. */
  versionInstalada(): Promise<number>;
  /** Si el operador ya concedió "instalar apps desconocidas". */
  puedeInstalar(): Promise<boolean>;
  /** Lleva al operador a la pantalla de Ajustes de ese permiso. */
  abrirAjustesInstalacion(): Promise<void>;
  /** Entrega el APK al instalador. Si acepta, el sistema cierra la app. */
  instalar(ruta: string): Promise<void>;
}

export const INSTALADOR_REPOSITORY_TOKEN =
  new InjectionToken<InstaladorRepository>('INSTALADOR_REPOSITORY_TOKEN');
