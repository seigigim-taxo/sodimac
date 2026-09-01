import { TestBed } from '@angular/core/testing';
import { AppInfoService, LECTOR_INFO_APP } from './app-info.service';
import { APP_VERSION } from './version';

/*
 * De esto depende que una carga del SGO se pueda atribuir a una versión.
 *
 * Lo que más importa acá no es el camino feliz sino los degradados: este
 * servicio se llama al armar el payload de un TAG, así que nunca puede hacer
 * fallar un envío por no haber podido leer un número.
 */
describe('AppInfoService', () => {
  function crear(lector: () => Promise<{ version: string; build: string }>): AppInfoService {
    TestBed.configureTestingModule({
      providers: [AppInfoService, { provide: LECTOR_INFO_APP, useValue: lector }],
    });
    return TestBed.inject(AppInfoService);
  }

  it('lee la versión del sistema, no la constante del código', async () => {
    const servicio = crear(async () => ({ version: '1.0.9', build: '13' }));

    const v = await servicio.version();

    expect(v.nombre).toBe('1.0.9');
    expect(v.codigo).toBe(13);
  });

  // Instalar una actualización mata la app, así que dentro de un mismo proceso
  // la versión no cambia: preguntarla una vez alcanza.
  it('consulta el sistema una sola vez', async () => {
    const lector = jasmine.createSpy('lector').and.resolveTo({ version: '1.0.9', build: '13' });
    const servicio = crear(lector);

    await servicio.version();
    await servicio.version();
    await servicio.version();

    expect(lector).toHaveBeenCalledTimes(1);
  });

  /*
   * Dos TAGs pendientes armando su payload a la vez entran las dos antes de que
   * la primera lectura resuelva. Cacheando el valor --y no la promesa-- las dos
   * consultaban el plugin; el test secuencial de arriba no lo detectaba.
   */
  it('llamadas simultaneas consultan el sistema una sola vez', async () => {
    let resolver: (v: { version: string; build: string }) => void = () => {};
    const pendiente = new Promise<{ version: string; build: string }>((r) => { resolver = r; });
    const lector = jasmine.createSpy('lector').and.returnValue(pendiente);
    const servicio = crear(lector);

    const a = servicio.version();
    const b = servicio.version();
    resolver({ version: '1.0.9', build: '13' });

    expect((await a).codigo).toBe(13);
    expect((await b).codigo).toBe(13);
    expect(lector).toHaveBeenCalledTimes(1);
  });

  /*
   * El degradado que importa. Si el plugin falla se responde con la constante
   * en vez de propagar: un TAG contado no se puede quedar sin enviar porque no
   * se supo decir con qué versión se contó.
   */
  it('si el sistema no responde, cae en la constante y no lanza', async () => {
    const servicio = crear(async () => { throw new Error('sin plugin'); });

    const v = await servicio.version();

    expect(v.nombre).toBe(APP_VERSION);
    expect(v.codigo).toBe(0);
  });

  // En el navegador App.getInfo() no existe y lanza. Es el mismo camino que el
  // de un plugin caído, y por eso el servicio no distingue entre los dos.
  it('en web cae en la constante, igual que ante cualquier falla', async () => {
    const servicio = crear(async () => { throw new Error('Not implemented on web'); });

    expect((await servicio.version()).nombre).toBe(APP_VERSION);
  });

  describe('datos que no sirven', () => {
    it('un build que no es entero da 0, no NaN', async () => {
      const servicio = crear(async () => ({ version: '1.0.9', build: 'beta' }));

      expect((await servicio.version()).codigo).toBe(0);
    });

    it('una versión vacía cae en la constante', async () => {
      const servicio = crear(async () => ({ version: '', build: '13' }));

      const v = await servicio.version();

      expect(v.nombre).toBe(APP_VERSION);
      // El código sí se leyó: se degrada campo por campo, no todo junto.
      expect(v.codigo).toBe(13);
    });
  });
});
