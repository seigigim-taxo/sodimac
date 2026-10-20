import { TestBed } from '@angular/core/testing';
import { SincronizarDatosInicialesUseCase, VIGENCIA_DESCARGA_FALLIDA_MS } from './sincronizar-datos-iniciales.use-case';
import { PREPARACION_API_REPOSITORY_TOKEN, PreparacionApiRepository } from '../../domain/sincronizacion/repositories/preparacion-api.repository';
import { OPERADOR_REPOSITORY_TOKEN } from '../../domain/auth/repositories/operador.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { ZONA_REPOSITORY_TOKEN } from '../../domain/zona/repositories/zona.repository';
import { VALIDACION_REPOSITORY_TOKEN } from '../../domain/validacion/repositories/validacion.repository';
import { PRE_VARIANCE_REPOSITORY_TOKEN } from '../../domain/pre-variance/repositories/pre-variance.repository';
import { RECUENTO_REPOSITORY_TOKEN } from '../../domain/recuento/repositories/recuento.repository';
import { META_REPOSITORY_TOKEN } from '../../domain/meta/repositories/meta.repository';
import { DatosPreparacion } from '../../domain/sincronizacion/models/preparacion.model';
import { Session } from '../../domain/auth/models/session.model';

/*
 * Lo que importa acá es CUÁNDO se vuelve a descargar. La respuesta puede pesar
 * 10 MB: si guardarla falla, repetir el guardado no debería obligar a bajarla
 * de nuevo por 4G. Pero fuera de ese caso siempre hay que ir al servidor, porque
 * quien consulta (¿hay conteo nuevo?) necesita datos frescos.
 */
describe('SincronizarDatosInicialesUseCase — descarga y guardado', () => {
  let useCase: SincronizarDatosInicialesUseCase;
  let api: jasmine.SpyObj<PreparacionApiRepository>;
  let operadorRepo: { guardarPerfil: jasmine.Spy };

  const sesion = (rut = '184961784'): Session => ({ operadorId: 1, rutNormalizado: rut, correo: rut });

  const datos = (marca = 'a'): DatosPreparacion => ({
    usuario: {
      login: '184961784', rut: '18.496.178-4', rutNormalizado: '184961784', nombreCompleto: marca,
      nombres: marca, apellidoPaterno: null, apellidoMaterno: null, cargo: 'INVENTARIADOR',
      tipoUsuario: 'OPERADOR', esUsuarioCliente: false, autenticado: true,
    },
    tiendas: [], jornadas: [], zonas: [], analista: null,
  });

  beforeEach(() => {
    api = jasmine.createSpyObj<PreparacionApiRepository>('PreparacionApiRepository', ['preparar']);
    api.preparar.and.callFake(() => Promise.resolve(datos('del servidor')));

    operadorRepo = { guardarPerfil: jasmine.createSpy('guardarPerfil').and.resolveTo(undefined) };
    const sucursalRepo = { guardarDeUsuario: jasmine.createSpy().and.resolveTo(undefined), getIdPorCodigo: jasmine.createSpy().and.resolveTo(null) };

    TestBed.configureTestingModule({
      providers: [
        SincronizarDatosInicialesUseCase,
        { provide: PREPARACION_API_REPOSITORY_TOKEN, useValue: api },
        { provide: OPERADOR_REPOSITORY_TOKEN, useValue: operadorRepo },
        { provide: SUCURSAL_REPOSITORY_TOKEN, useValue: sucursalRepo },
        { provide: EVENTO_REPOSITORY_TOKEN, useValue: {} },
        { provide: MUESTRA_REPOSITORY_TOKEN, useValue: {} },
        { provide: MUESTRA_DETALLE_REPOSITORY_TOKEN, useValue: {} },
        { provide: ZONA_REPOSITORY_TOKEN, useValue: { reemplazarDeSucursal: jasmine.createSpy().and.resolveTo(undefined) } },
        { provide: VALIDACION_REPOSITORY_TOKEN, useValue: {} },
        { provide: PRE_VARIANCE_REPOSITORY_TOKEN, useValue: {} },
        { provide: RECUENTO_REPOSITORY_TOKEN, useValue: {} },
        { provide: META_REPOSITORY_TOKEN, useValue: { guardar: jasmine.createSpy().and.resolveTo(undefined) } },
      ],
    });
    useCase = TestBed.inject(SincronizarDatosInicialesUseCase);
  });

  const fallaElGuardado = () => operadorRepo.guardarPerfil.and.rejectWith(new Error('FOREIGN KEY constraint failed'));

  it('sin antecedentes, descarga del servidor', async () => {
    const d = await useCase.descargar(sesion());

    expect(api.preparar).toHaveBeenCalledTimes(1);
    expect(d.usuario.nombres).toBe('del servidor');
  });

  it('dos descargas seguidas sin fallos van las dos al servidor (quien consulta necesita datos frescos)', async () => {
    await useCase.descargar(sesion());
    await useCase.descargar(sesion());

    expect(api.preparar).toHaveBeenCalledTimes(2);
  });

  it('si el guardado falla, el reintento NO vuelve a descargar: reutiliza lo bajado', async () => {
    fallaElGuardado();

    const bajada = await useCase.descargar(sesion());
    await expectAsync(useCase.persistir(sesion(), bajada)).toBeRejectedWithError(/FOREIGN KEY/);

    const reintento = await useCase.descargar(sesion());

    expect(api.preparar).toHaveBeenCalledTimes(1);
    expect(reintento).toBe(bajada);
  });

  it('el flujo completo (execute) reintenta sin bajar de nuevo cuando solo falló el guardado', async () => {
    fallaElGuardado();
    await expectAsync(useCase.execute(sesion())).toBeRejected();

    operadorRepo.guardarPerfil.and.resolveTo(undefined);
    const resultado = await useCase.execute(sesion());

    expect(api.preparar).toHaveBeenCalledTimes(1);
    expect(resultado.usuario.nombres).toBe('del servidor');
  });

  it('cuando el guardado sale bien, la reutilización termina: la siguiente descarga va al servidor', async () => {
    fallaElGuardado();
    await expectAsync(useCase.execute(sesion())).toBeRejected();

    operadorRepo.guardarPerfil.and.resolveTo(undefined);
    await useCase.execute(sesion()); // reutiliza y guarda bien
    await useCase.descargar(sesion());

    expect(api.preparar).toHaveBeenCalledTimes(2);
  });

  it('una descarga que falla (la red) no se guarda para reutilizar', async () => {
    api.preparar.and.rejectWith(new Error('Sin conexión con el servidor'));
    await expectAsync(useCase.execute(sesion())).toBeRejected();

    api.preparar.and.callFake(() => Promise.resolve(datos('del servidor')));
    await useCase.execute(sesion());

    expect(api.preparar).toHaveBeenCalledTimes(2);
  });

  it('con otro operador no se reutiliza nada', async () => {
    fallaElGuardado();
    await expectAsync(useCase.execute(sesion('184961784'))).toBeRejected();

    await useCase.descargar(sesion('193850294'));

    expect(api.preparar).toHaveBeenCalledTimes(2);
  });

  describe('vigencia', () => {
    beforeEach(() => jasmine.clock().install());
    afterEach(() => jasmine.clock().uninstall());

    it('pasados 10 minutos desde el fallo se vuelve a descargar', async () => {
      jasmine.clock().mockDate(new Date(2026, 9, 19, 10, 0, 0));
      fallaElGuardado();
      await expectAsync(useCase.execute(sesion())).toBeRejected();

      jasmine.clock().tick(VIGENCIA_DESCARGA_FALLIDA_MS + 1);
      await useCase.descargar(sesion());

      expect(api.preparar).toHaveBeenCalledTimes(2);
    });

    it('al vencer la vigencia suelta la descarga de memoria aunque nadie reintente', async () => {
      jasmine.clock().mockDate(new Date(2026, 9, 19, 10, 0, 0));
      fallaElGuardado();
      await expectAsync(useCase.execute(sesion())).toBeRejected();
      expect((useCase as unknown as { descargaPendiente: unknown }).descargaPendiente).not.toBeNull();

      jasmine.clock().tick(VIGENCIA_DESCARGA_FALLIDA_MS + 1);

      expect((useCase as unknown as { descargaPendiente: unknown }).descargaPendiente).toBeNull();
    });

    it('antes de los 10 minutos todavía se reutiliza', async () => {
      jasmine.clock().mockDate(new Date(2026, 9, 19, 10, 0, 0));
      fallaElGuardado();
      await expectAsync(useCase.execute(sesion())).toBeRejected();

      jasmine.clock().tick(VIGENCIA_DESCARGA_FALLIDA_MS - 1000);
      await useCase.descargar(sesion());

      expect(api.preparar).toHaveBeenCalledTimes(1);
    });
  });
});
