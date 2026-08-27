import { Injectable, inject } from '@angular/core';
import {
  DESCARGA_REPOSITORY_TOKEN,
  INSTALADOR_REPOSITORY_TOKEN,
} from '../../domain/actualizacion/repositories/actualizacion.repository';
import { VersionDisponible } from '../../domain/actualizacion/models/version-disponible.model';

export type ResultadoActualizacion =
  /** El instalador de Android está en pantalla. La app va a cerrarse. */
  | { estado: 'INSTALANDO' }
  /** Falta el permiso: el operador tiene que concederlo en Ajustes. */
  | { estado: 'SIN_PERMISO' }
  /** La descarga llegó incompleta o alterada. Se puede reintentar. */
  | { estado: 'DESCARGA_CORRUPTA' }
  | { estado: 'ERROR'; mensaje: string };

/*
 * Baja el APK, lo verifica e invoca al instalador.
 *
 * El orden de los pasos es el punto: el permiso se consulta ANTES de bajar 28
 * MB, y el hash se verifica ANTES de entregarle nada al sistema. Al revés, el
 * operador esperaría una descarga larga para toparse con un permiso que le
 * falta, o le llegaría al instalador un archivo que nadie miró.
 */
@Injectable({ providedIn: 'root' })
export class DescargarEInstalarUseCase {
  private descarga = inject(DESCARGA_REPOSITORY_TOKEN);
  private instalador = inject(INSTALADOR_REPOSITORY_TOKEN);

  async execute(
    version: VersionDisponible,
    onProgreso?: (porcentaje: number | null) => void,
  ): Promise<ResultadoActualizacion> {
    // Primero el permiso: bajar 28 MB para descubrir después que falta es
    // gastarle al operador varios minutos de su turno.
    if (!(await this.instalador.puedeInstalar())) {
      return { estado: 'SIN_PERMISO' };
    }

    let ruta: string;
    try {
      ruta = await this.descarga.descargar(version.url, (p) => onProgreso?.(p.porcentaje));
    } catch (err) {
      return { estado: 'ERROR', mensaje: mensajeDe(err, 'No se pudo descargar la actualización.') };
    }

    /*
     * La verificación es lo que separa "la descarga falló, reintentá" de un
     * error críptico del instalador de Android. En una tienda con WiFi
     * intermitente, una descarga cortada es el caso frecuente, no el raro.
     */
    try {
      const hash = await this.descarga.hashDe(ruta);
      if (hash !== version.sha256.toLowerCase()) {
        // Se borra: dejar un APK corrupto en disco sólo invita a que un
        // reintento se lo encuentre y falle igual.
        await this.descarga.borrar(ruta);
        return { estado: 'DESCARGA_CORRUPTA' };
      }
    } catch (err) {
      await this.descarga.borrar(ruta);
      return { estado: 'ERROR', mensaje: mensajeDe(err, 'No se pudo verificar la descarga.') };
    }

    try {
      await this.instalador.instalar(ruta);
      return { estado: 'INSTALANDO' };
    } catch (err) {
      // El nativo rechaza con este código si el permiso se revocó entre la
      // consulta de arriba y este momento.
      if (err instanceof Error && err.message.includes('SIN_PERMISO')) {
        return { estado: 'SIN_PERMISO' };
      }
      return { estado: 'ERROR', mensaje: mensajeDe(err, 'No se pudo abrir el instalador.') };
    }
  }
}

function mensajeDe(err: unknown, porDefecto: string): string {
  return err instanceof Error && err.message ? err.message : porDefecto;
}
