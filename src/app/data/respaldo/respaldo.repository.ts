import { Injectable, inject } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { strToU8, zipSync } from 'fflate';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME } from '../../core/database/sodimac.schema';
import { RespaldoCreado } from '../../domain/respaldo/models/respaldo-creado.model';
import { RespaldoRepository } from '../../domain/respaldo/repositories/respaldo.repository';

/*
 * Documentos del equipo: en Android es /storage/emulated/0/Documents, la
 * carpeta pública que se ve desde cualquier explorador de archivos y al
 * conectar la PDA por USB. Es lo más parecido a dejarlo "a la vista" que
 * permite Android, que no tiene escritorio.
 *
 * Se eligió por sobre Directory.External —que apunta a Android/data/<paquete>—
 * porque esa está oculta para el operador y Android la borra al desinstalar la
 * app, que para un respaldo es justo lo que no se quiere.
 *
 * Desde Android 11 la app solo puede tocar acá los archivos que ella misma
 * creó. Alcanza: crea el respaldo y no necesita leer nada ajeno.
 */
const DIRECTORIO = Directory.Documents;
const CARPETA = 'Sodimac respaldos';

@Injectable({ providedIn: 'root' })
export class FilesystemRespaldoRepository implements RespaldoRepository {
  private sqlite = inject(SqliteConnectionService);

  async respaldarBaseLocal(): Promise<RespaldoCreado> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('El respaldo solo está disponible en la PDA, no en el navegador.');
    }

    const fecha = new Date();
    const sql = await this.sqlite.exportarSql(SODIMAC_DB_NAME);

    /*
     * El .sql va dentro del zip con su propio nombre para que, al abrirlo desde
     * un PC, se vea qué base es y de cuándo — el nombre del zip puede cambiar si
     * alguien lo renombra al copiarlo.
     */
    const nombreSql = `${SODIMAC_DB_NAME}-${marcaDeTiempo(fecha)}.sql`;
    const zip = zipSync({ [nombreSql]: strToU8(sql) }, { level: 6 });

    const archivo = `${SODIMAC_DB_NAME}-${marcaDeTiempo(fecha)}.zip`;
    const ruta = `${CARPETA}/${archivo}`;

    await Filesystem.writeFile({
      path: ruta,
      data: aBase64(zip),
      directory: DIRECTORIO,
      // Sin esto falla la primera vez: la carpeta de respaldos todavía no existe.
      recursive: true,
    });

    /*
     * No alcanza con que writeFile no lance: interesa que el archivo esté en
     * disco y completo. Se relee su tamaño y se compara con el del zip — si el
     * almacenamiento está lleno o la escritura quedó a medias, el operador tiene
     * que enterarse ahora y no el día que necesite restaurar.
     */
    const info = await Filesystem.stat({ directory: DIRECTORIO, path: ruta });
    if (info.size !== zip.length) {
      throw new Error(
        `El respaldo quedó incompleto: se escribieron ${info.size} de ${zip.length} bytes. ` +
        'Revisa el espacio disponible en el equipo.'
      );
    }

    const { uri } = await Filesystem.getUri({ directory: DIRECTORIO, path: CARPETA });

    return {
      archivo,
      carpeta: decodeURIComponent(uri).replace(/^file:\/\//, ''),
      bytes: info.size,
      fecha,
    };
  }
}

/* Ordenable alfabéticamente y sin caracteres que molesten en un nombre de archivo. */
function marcaDeTiempo(fecha: Date): string {
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return (
    `${fecha.getFullYear()}${dosDigitos(fecha.getMonth() + 1)}${dosDigitos(fecha.getDate())}` +
    `-${dosDigitos(fecha.getHours())}${dosDigitos(fecha.getMinutes())}${dosDigitos(fecha.getSeconds())}`
  );
}

/*
 * Filesystem recibe binario como base64. Se convierte por bloques porque
 * String.fromCharCode con el arreglo entero desborda la pila apenas el respaldo
 * pasa de unos pocos cientos de KB — y con la muestra cargada los pasa.
 */
function aBase64(bytes: Uint8Array): string {
  const BLOQUE = 0x8000;
  let binario = '';
  for (let i = 0; i < bytes.length; i += BLOQUE) {
    binario += String.fromCharCode(...bytes.subarray(i, i + BLOQUE));
  }
  return btoa(binario);
}
