import { TestBed } from '@angular/core/testing';
import { EnviarPendientesFacade } from './enviar-pendientes.facade';
import { EnviarPendientesUseCase, ResultadoEnviarPendientes } from '../../application/sincronizacion/enviar-pendientes.use-case';

const RESULTADO: ResultadoEnviarPendientes = {
  enviados: 1, conError: 0, total: 1, confirmadosTags: ['7001'], reintentables: 0, cortadoPorRed: false,
};

describe('EnviarPendientesFacade', () => {
  let facade: EnviarPendientesFacade;
  let uc: jasmine.SpyObj<EnviarPendientesUseCase>;

  beforeEach(() => {
    uc = jasmine.createSpyObj('EnviarPendientesUseCase', ['execute']);
    uc.execute.and.resolveTo(RESULTADO);
    TestBed.configureTestingModule({
      providers: [EnviarPendientesFacade, { provide: EnviarPendientesUseCase, useValue: uc }],
    });
    facade = TestBed.inject(EnviarPendientesFacade);
  });

  describe('enviarAutomatico (los reintentos solos)', () => {
    it('manda la tanda cortando al primer fallo de red', async () => {
      await facade.enviarAutomatico();

      expect(uc.execute).toHaveBeenCalledOnceWith({ cortarAlFalloDeRed: true });
    });

    it('devuelve el resultado y lo deja guardado', async () => {
      expect(await facade.enviarAutomatico()).toEqual(RESULTADO);
      expect(facade.ultimoResultado()).toEqual(RESULTADO);
    });

    it('si ya hay un envío en marcha, no se encima: devuelve null y no envía', async () => {
      let terminar!: (r: ResultadoEnviarPendientes) => void;
      uc.execute.and.returnValue(new Promise((ok) => { terminar = ok; }));
      const primero = facade.enviar();

      expect(await facade.enviarAutomatico()).toBeNull();
      expect(uc.execute).toHaveBeenCalledTimes(1);

      terminar(RESULTADO);
      await primero;
    });

    it('mientras corre figura como enviando, y al terminar deja de estarlo', async () => {
      let terminar!: (r: ResultadoEnviarPendientes) => void;
      uc.execute.and.returnValue(new Promise((ok) => { terminar = ok; }));

      const corriendo = facade.enviarAutomatico();
      expect(facade.enviando()).toBeTrue();

      terminar(RESULTADO);
      await corriendo;
      expect(facade.enviando()).toBeFalse();
    });

    it('si falla, el error sube y deja de figurar como enviando', async () => {
      uc.execute.and.rejectWith(new Error('boom'));

      await expectAsync(facade.enviarAutomatico()).toBeRejectedWithError('boom');
      expect(facade.enviando()).toBeFalse();
    });

    it('un fallo automático no pone un error a la vista del operador', async () => {
      uc.execute.and.rejectWith(new Error('boom'));

      await facade.enviarAutomatico().catch(() => undefined);

      expect(facade.error()).toBeNull();
    });
  });

  describe('enviar (el botón del menú)', () => {
    it('sigue probando con todos: no corta al primer fallo de red', async () => {
      await facade.enviar();

      expect(uc.execute).toHaveBeenCalledOnceWith();
    });
  });
});
