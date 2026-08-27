import { TestBed } from '@angular/core/testing';
import { DescargarEInstalarUseCase } from './descargar-e-instalar.use-case';
import {
  DESCARGA_REPOSITORY_TOKEN,
  INSTALADOR_REPOSITORY_TOKEN,
} from '../../domain/actualizacion/repositories/actualizacion.repository';
import { VersionDisponible } from '../../domain/actualizacion/models/version-disponible.model';

/*
 * El orden de los pasos es lo que se prueba acá, porque es lo que separa una
 * actualización que funciona en una tienda con mala señal de una que le hace
 * perder el turno al operador:
 *
 *   - el permiso se consulta ANTES de bajar 28 MB;
 *   - el hash se verifica ANTES de entregarle nada al instalador de Android.
 *
 * Nada de esto se puede comprobar en el equipo sin desinstalar y reinstalar a
 * mano cada vez.
 */

const VERSION: VersionDisponible = {
  versionCode: 4,
  versionName: '1.0.2',
  url:         'http://servidor/apk/sodimac-1.0.2.apk',
  sha256:      'f91f3fabb8ca8086edc76d68c4228ff657f839ac712a5630b732bb91174f9cd6',
  obligatoria: false,
};

const RUTA = '/data/cache/actualizacion.apk';

describe('DescargarEInstalarUseCase', () => {
  let uc: DescargarEInstalarUseCase;
  let descarga: {
    descargar: jasmine.Spy; hashDe: jasmine.Spy; borrar: jasmine.Spy;
  };
  let instalador: {
    versionInstalada: jasmine.Spy; puedeInstalar: jasmine.Spy;
    abrirAjustesInstalacion: jasmine.Spy; instalar: jasmine.Spy;
  };

  beforeEach(() => {
    descarga = {
      descargar: jasmine.createSpy('descargar').and.resolveTo(RUTA),
      hashDe:    jasmine.createSpy('hashDe').and.resolveTo(VERSION.sha256),
      borrar:    jasmine.createSpy('borrar').and.resolveTo(undefined),
    };
    instalador = {
      versionInstalada:        jasmine.createSpy('versionInstalada').and.resolveTo(3),
      puedeInstalar:           jasmine.createSpy('puedeInstalar').and.resolveTo(true),
      abrirAjustesInstalacion: jasmine.createSpy('abrirAjustesInstalacion').and.resolveTo(undefined),
      instalar:                jasmine.createSpy('instalar').and.resolveTo(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        DescargarEInstalarUseCase,
        { provide: DESCARGA_REPOSITORY_TOKEN,   useValue: descarga },
        { provide: INSTALADOR_REPOSITORY_TOKEN, useValue: instalador },
      ],
    });
    uc = TestBed.inject(DescargarEInstalarUseCase);
  });

  it('el camino feliz llega al instalador', async () => {
    const r = await uc.execute(VERSION);

    expect(r.estado).toBe('INSTALANDO');
    expect(descarga.descargar).toHaveBeenCalledWith(VERSION.url, jasmine.any(Function));
    expect(instalador.instalar).toHaveBeenCalledWith(RUTA);
  });

  describe('el permiso se consulta antes de descargar', () => {
    beforeEach(() => instalador.puedeInstalar.and.resolveTo(false));

    it('avisa que falta', async () => {
      expect((await uc.execute(VERSION)).estado).toBe('SIN_PERMISO');
    });

    /*
     * Lo importante no es que devuelva SIN_PERMISO, sino que NO haya bajado los
     * 28 MB. Al revés, el operador espera varios minutos de su turno para
     * toparse recién ahí con un permiso que le falta.
     */
    it('y no gasta la descarga', async () => {
      await uc.execute(VERSION);

      expect(descarga.descargar).not.toHaveBeenCalled();
    });
  });

  describe('verificación del hash', () => {
    /*
     * El caso frecuente en una tienda, no el raro: WiFi que se corta y deja un
     * archivo incompleto. Sin esta verificación le llega al instalador de
     * Android, que muestra un error críptico sin decir que la descarga falló.
     */
    it('un hash distinto no llega al instalador', async () => {
      descarga.hashDe.and.resolveTo('0'.repeat(64));

      const r = await uc.execute(VERSION);

      expect(r.estado).toBe('DESCARGA_CORRUPTA');
      expect(instalador.instalar).not.toHaveBeenCalled();
    });

    // Dejar el archivo corrupto sólo invita a que el reintento se lo encuentre.
    it('y el archivo corrupto se borra', async () => {
      descarga.hashDe.and.resolveTo('0'.repeat(64));

      await uc.execute(VERSION);

      expect(descarga.borrar).toHaveBeenCalledWith(RUTA);
    });

    it('compara sin distinguir mayúsculas', async () => {
      descarga.hashDe.and.resolveTo(VERSION.sha256.toUpperCase().toLowerCase());

      expect((await uc.execute(VERSION)).estado).toBe('INSTALANDO');
    });
  });

  describe('fallos', () => {
    it('una descarga que revienta no llega al instalador', async () => {
      descarga.descargar.and.rejectWith(new Error('Sin conexión'));

      const r = await uc.execute(VERSION);

      expect(r.estado).toBe('ERROR');
      expect(instalador.instalar).not.toHaveBeenCalled();
    });

    /*
     * El permiso puede revocarse entre la consulta inicial y la instalación.
     * Se reconoce por el código que devuelve el plugin nativo, para poder
     * mandarlo a Ajustes en vez de mostrarle un error genérico.
     */
    it('si el permiso se revocó en el medio, se trata como SIN_PERMISO', async () => {
      instalador.instalar.and.rejectWith(new Error('SIN_PERMISO'));

      expect((await uc.execute(VERSION)).estado).toBe('SIN_PERMISO');
    });
  });
});
