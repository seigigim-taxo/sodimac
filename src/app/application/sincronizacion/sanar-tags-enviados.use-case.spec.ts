import { TestBed } from '@angular/core/testing';
import { SanarTagsEnviadosUseCase } from './sanar-tags-enviados.use-case';
import { SincronizarConteoUseCase } from './sincronizar-conteo.use-case';
import { SINCRONIZACION_REPOSITORY_TOKEN, SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { SincronizacionSync } from '../../domain/sincronizacion/models/sincronizacion-sync.model';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';

/*
 * El caso del TAG 7001: el servidor lo tiene (la cola dice ENVIADO) pero la PDA lo
 * seguía mostrando FINALIZADO. Se repara sin red, por el mismo camino que el botón
 * "Sincronizar", que no marca nada si el TAG cambió después de enviarse.
 */
const fila = (extra: Partial<SincronizacionSync> = {}): SincronizacionSync => ({
  id: 1, eventoId: 10, pdaId: 1, tipo: 'CARGA_DESDE_PDA', operacion: 'TAG_FINALIZADO', perfil: 'OPERADOR',
  iteracion: 1, conteoId: 10, ubicacionId: 228, operadorId: 1, cargaUid: 'UID-1',
  payloadJson: '{}', estado: 'ENVIADO', error: null, intentos: 1,
  fechaHora: '2026-10-05 10:19:38', fechaUltimoIntento: null, fechaEnvio: null, registrosProcesados: 3,
  ...extra,
});

const resumen = (extra: Partial<ConteoResumen> = {}): ConteoResumen => ({
  conteoId: 10, eventoId: 10, ubicacionId: 228, operadorId: 1, pdaId: 1,
  estado: 'FINALIZADO' as EstadoConteo, tag: '7001', zonaCodigo: 'OTRO', zonaNombre: 'Pto. vta. otros',
  totalProductos: 1, totalUnidades: 3, iteracion: 1, fechaUltima: '2026-10-05 10:19:34',
  ...extra,
});

describe('SanarTagsEnviadosUseCase', () => {
  let useCase: SanarTagsEnviadosUseCase;
  let repo: jasmine.SpyObj<SincronizacionRepository>;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;
  let sincronizar: jasmine.SpyObj<SincronizarConteoUseCase>;

  beforeEach(() => {
    repo = jasmine.createSpyObj('SincronizacionRepository', ['listarEnviadosPorSanar']);
    repo.listarEnviadosPorSanar.and.resolveTo([fila()]);
    conteoRepo = jasmine.createSpyObj('ConteoRepository', ['getResumenes']);
    conteoRepo.getResumenes.and.resolveTo([resumen()]);
    sincronizar = jasmine.createSpyObj('SincronizarConteoUseCase', ['execute']);
    sincronizar.execute.and.resolveTo();
    spyOn(console, 'warn');

    TestBed.configureTestingModule({
      providers: [
        SanarTagsEnviadosUseCase,
        { provide: SINCRONIZACION_REPOSITORY_TOKEN, useValue: repo },
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: conteoRepo },
        { provide: SincronizarConteoUseCase, useValue: sincronizar },
      ],
    });
    useCase = TestBed.inject(SanarTagsEnviadosUseCase);
  });

  it('marca el TAG por el camino de siempre y cuenta uno', async () => {
    expect(await useCase.execute()).toBe(1);
    expect(sincronizar.execute).toHaveBeenCalledOnceWith(resumen());
  });

  it('sin nada que sanar, no consulta resúmenes ni toca nada', async () => {
    repo.listarEnviadosPorSanar.and.resolveTo([]);

    expect(await useCase.execute()).toBe(0);
    expect(conteoRepo.getResumenes).not.toHaveBeenCalled();
    expect(sincronizar.execute).not.toHaveBeenCalled();
  });

  it('pide los resúmenes con el operador y la PDA del envío', async () => {
    repo.listarEnviadosPorSanar.and.resolveTo([fila({ operadorId: 7, pdaId: 3 })]);
    conteoRepo.getResumenes.and.resolveTo([resumen({ operadorId: 7, pdaId: 3 })]);

    await useCase.execute();

    expect(conteoRepo.getResumenes).toHaveBeenCalledOnceWith(7, 3);
  });

  it('el mismo operador y PDA se consultan una sola vez, aunque tenga varios TAGs', async () => {
    repo.listarEnviadosPorSanar.and.resolveTo([fila(), fila({ cargaUid: 'UID-2', ubicacionId: 229 })]);
    conteoRepo.getResumenes.and.resolveTo([resumen(), resumen({ ubicacionId: 229 })]);

    expect(await useCase.execute()).toBe(2);
    expect(conteoRepo.getResumenes).toHaveBeenCalledTimes(1);
  });

  it('solo marca el TAG de ese envío, no otro del mismo operador', async () => {
    conteoRepo.getResumenes.and.resolveTo([resumen({ ubicacionId: 999 }), resumen()]);

    await useCase.execute();

    expect(sincronizar.execute).toHaveBeenCalledOnceWith(resumen());
  });

  it('si el TAG ya no está FINALIZADO, lo deja', async () => {
    conteoRepo.getResumenes.and.resolveTo([resumen({ estado: 'EN_CURSO' })]);

    expect(await useCase.execute()).toBe(0);
    expect(sincronizar.execute).not.toHaveBeenCalled();
  });

  it('si no encuentra el TAG, sigue sin error', async () => {
    conteoRepo.getResumenes.and.resolveTo([]);

    expect(await useCase.execute()).toBe(0);
  });

  it('un envío sin operador, PDA o ubicación no se puede ubicar: lo salta', async () => {
    repo.listarEnviadosPorSanar.and.resolveTo([fila({ operadorId: null }), fila({ pdaId: null }), fila({ ubicacionId: null })]);

    expect(await useCase.execute()).toBe(0);
    expect(conteoRepo.getResumenes).not.toHaveBeenCalled();
  });

  // El TAG cambió después de enviarse: lo nuevo no viajó, así que NO se marca.
  it('si el TAG cambió después de enviarse, no se marca, no cuenta, y los demás siguen', async () => {
    repo.listarEnviadosPorSanar.and.resolveTo([fila(), fila({ cargaUid: 'UID-2', ubicacionId: 229 })]);
    conteoRepo.getResumenes.and.resolveTo([resumen(), resumen({ ubicacionId: 229 })]);
    sincronizar.execute.and.callFake(async (r) => {
      if (r.ubicacionId === 228) throw new Error('cambió después de enviarse');
    });

    expect(await useCase.execute()).toBe(1);
    expect(sincronizar.execute).toHaveBeenCalledTimes(2);
  });

  it('si fallan los resúmenes de uno, no frena a los demás', async () => {
    repo.listarEnviadosPorSanar.and.resolveTo([fila({ operadorId: 7 }), fila({ cargaUid: 'UID-2', operadorId: 8, ubicacionId: 229 })]);
    conteoRepo.getResumenes.and.callFake(async (operadorId: number) => {
      if (operadorId === 7) throw new Error('disco');
      return [resumen({ operadorId: 8, ubicacionId: 229 })];
    });

    expect(await useCase.execute()).toBe(1);
  });
});
