import { TestBed } from '@angular/core/testing';
import { EnviarPendientesUseCase } from './enviar-pendientes.use-case';
import { SINCRONIZACION_REPOSITORY_TOKEN } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { OperacionSync, SincronizacionSync } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { ApiService } from '../../core/http/api.service';

function pendiente(operacion: OperacionSync, extras: Partial<SincronizacionSync> = {}): SincronizacionSync {
  return {
    id: 1,
    eventoId: null,
    pdaId: 1,
    tipo: 'CARGA_DESDE_PDA',
    operacion,
    perfil: 'OPERADOR',
    iteracion: 1,
    conteoId: null,
    ubicacionId: null,
    operadorId: 1,
    cargaUid: `uid-${operacion}`,
    payloadJson: '{"x":1}',
    estado: 'PENDIENTE',
    error: null,
    intentos: 0,
    fechaHora: '2026-10-02 10:00:00',
    fechaUltimoIntento: null,
    fechaEnvio: null,
    registrosProcesados: null,
    ...extras,
  };
}

describe('EnviarPendientesUseCase', () => {
  let uc: EnviarPendientesUseCase;
  let listarPendientes: jasmine.Spy;
  let marcarEnviado: jasmine.Spy;
  let marcarError: jasmine.Spy;
  let post: jasmine.Spy;

  beforeEach(() => {
    listarPendientes = jasmine.createSpy('listarPendientes').and.resolveTo([]);
    marcarEnviado = jasmine.createSpy('marcarEnviado').and.resolveTo(undefined);
    marcarError = jasmine.createSpy('marcarError').and.resolveTo(undefined);
    post = jasmine.createSpy('post').and.callFake(async (path: string) => {
      if (path.includes('reporte-version')) return { id: 55 };
      if (path.includes('validacion-analista')) return { id_conteo_2: 7, total_productos: 3, total_unidades: 9 };
      return { carga_uid: 'x', carga_id: 1, total_productos: 2, total_unidades: 4 };
    });

    TestBed.configureTestingModule({
      providers: [
        EnviarPendientesUseCase,
        {
          provide: SINCRONIZACION_REPOSITORY_TOKEN,
          useValue: { listarPendientes, marcarEnviado, marcarError },
        },
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: { marcarSincronizado: jasmine.createSpy('marcarSincronizado') } },
        { provide: ApiService, useValue: { post } },
      ],
    });
    uc = TestBed.inject(EnviarPendientesUseCase);
  });

  it('sin opciones envía todo lo pendiente, como hasta ahora', async () => {
    listarPendientes.and.resolveTo([
      pendiente('TAG_FINALIZADO'),
      pendiente('VALIDACION_OPERACIONAL'),
      pendiente('VERSION_REPORTE'),
    ]);

    const resultado = await uc.execute();

    expect(resultado).toEqual({ enviados: 3, conError: 0, total: 3 });
    expect(post).toHaveBeenCalledTimes(3);
    expect(marcarEnviado).toHaveBeenCalledTimes(3);
  });

  /*
   * El reintento automático de Inicio (soloVersiones) es para los reportes
   * de versión, que nadie mira y se pierden si quedan en ERROR. Los TAG y
   * las validaciones no se mandan a escondidas: su envío sigue siendo a
   * pulso desde el menú, como hasta ahora.
   */
  it('con soloVersiones solo envía los reportes de versión', async () => {
    listarPendientes.and.resolveTo([
      pendiente('TAG_FINALIZADO'),
      pendiente('VALIDACION_OPERACIONAL'),
      pendiente('VERSION_REPORTE'),
    ]);

    const resultado = await uc.execute({ soloVersiones: true });

    expect(resultado).toEqual({ enviados: 1, conError: 0, total: 1 });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.calls.mostRecent().args[0]).toContain('reporte-version.php');
    expect(marcarEnviado).toHaveBeenCalledTimes(1);
    expect(marcarEnviado).toHaveBeenCalledWith('uid-VERSION_REPORTE', 55);
  });

  it('con soloVersiones y nada pendiente, no toca la red', async () => {
    const resultado = await uc.execute({ soloVersiones: true });

    expect(resultado).toEqual({ enviados: 0, conError: 0, total: 0 });
    expect(post).not.toHaveBeenCalled();
  });

  it('si el envío falla, marca la fila como ERROR para el próximo reintento', async () => {
    listarPendientes.and.resolveTo([pendiente('VERSION_REPORTE')]);
    post.and.rejectWith(new Error('Sin conexión'));

    const resultado = await uc.execute({ soloVersiones: true });

    expect(resultado).toEqual({ enviados: 0, conError: 1, total: 1 });
    expect(marcarError).toHaveBeenCalledWith('uid-VERSION_REPORTE', 'Sin conexión');
  });
});
