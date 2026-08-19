import { TestBed } from '@angular/core/testing';
import { ReabrirTagUseCase } from './reabrir-tag.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';

function resumen(estado: EstadoConteo): ConteoResumen {
  return {
    conteoId: 3, eventoId: 1, ubicacionId: 11, operadorId: 7, pdaId: 2,
    estado, tag: '104', zonaCodigo: 'SALA_VENTAS', zonaNombre: 'Sala de ventas',
    totalProductos: 4, totalUnidades: 12, iteracion: 1,
    fechaUltima: '2026-08-18 10:00:00',
  };
}

describe('ReabrirTagUseCase', () => {
  let useCase: ReabrirTagUseCase;
  let repo: jasmine.SpyObj<ConteoRepository>;

  beforeEach(() => {
    repo = jasmine.createSpyObj('ConteoRepository', ['reabrirTag']);
    repo.reabrirTag.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        ReabrirTagUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: repo },
      ],
    });
    useCase = TestBed.inject(ReabrirTagUseCase);
  });

  it('reabre un TAG finalizado con su tupla completa', async () => {
    await useCase.execute(resumen('FINALIZADO'));

    expect(repo.reabrirTag).toHaveBeenCalledWith(3, 11, 7, 2);
  });

  /*
   * Un TAG sincronizado ya viajó al servidor: editarlo acá dejaría la PDA
   * diciendo una cosa y el SGO otra.
   */
  it('rechaza reabrir un TAG ya sincronizado', async () => {
    await expectAsync(useCase.execute(resumen('SINCRONIZADO')))
      .toBeRejectedWithError(/ya se sincronizó/);

    expect(repo.reabrirTag).not.toHaveBeenCalled();
  });

  it('rechaza reabrir un TAG que sigue en curso', async () => {
    await expectAsync(useCase.execute(resumen('EN_CURSO')))
      .toBeRejectedWithError(/finalizado/);

    expect(repo.reabrirTag).not.toHaveBeenCalled();
  });
});
