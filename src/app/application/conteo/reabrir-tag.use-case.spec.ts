import { TestBed } from '@angular/core/testing';
import { ReabrirTagUseCase } from './reabrir-tag.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { SINCRONIZACION_REPOSITORY_TOKEN, SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { EstadoConteo } from '../../domain/conteo/models/estado-conteo.model';
import { EstadoEnvioTag } from '../../domain/sincronizacion/models/estado-envio-tag.model';

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
  let sincRepo: jasmine.SpyObj<SincronizacionRepository>;

  const envio = (estado: EstadoEnvioTag) =>
    sincRepo.estadoEnvioTag.and.resolveTo({ estado, cargaUid: estado === 'SIN_ENVIO' ? null : 'UID-1', detalle: null });

  beforeEach(() => {
    repo = jasmine.createSpyObj('ConteoRepository', ['reabrirTag']);
    repo.reabrirTag.and.resolveTo();
    sincRepo = jasmine.createSpyObj('SincronizacionRepository', ['estadoEnvioTag']);
    envio('SIN_ENVIO');

    TestBed.configureTestingModule({
      providers: [
        ReabrirTagUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: repo },
        { provide: SINCRONIZACION_REPOSITORY_TOKEN, useValue: sincRepo },
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

  /*
   * La regla nueva: solo se edita un TAG que el servidor NO tiene. Un TAG
   * FINALIZADO puede tener un envío recibido o en duda (la respuesta se perdió).
   */
  describe('según lo que se sabe del envío', () => {
    it('consulta el envío de ESE TAG (ronda + ubicación)', async () => {
      await useCase.execute(resumen('FINALIZADO'));

      expect(sincRepo.estadoEnvioTag).toHaveBeenCalledOnceWith(3, 11);
    });

    it('un envío que no llegó (NO_RECIBIDO) se puede editar', async () => {
      envio('NO_RECIBIDO');

      await useCase.execute(resumen('FINALIZADO'));

      expect(repo.reabrirTag).toHaveBeenCalled();
    });

    it('un envío recibido NO se reabre', async () => {
      envio('ENVIADO');

      await expectAsync(useCase.execute(resumen('FINALIZADO')))
        .toBeRejectedWithError('Este TAG ya se envió y no se puede modificar.');
      expect(repo.reabrirTag).not.toHaveBeenCalled();
    });

    it('un envío EN DUDA NO se reabre, y el mensaje explica por qué', async () => {
      envio('EN_DUDA');

      await expectAsync(useCase.execute(resumen('FINALIZADO')))
        .toBeRejectedWithError(/No pudimos confirmar si este TAG llegó al servidor/);
      expect(repo.reabrirTag).not.toHaveBeenCalled();
    });

    it('si no se puede consultar el envío, no reabre a ciegas', async () => {
      sincRepo.estadoEnvioTag.and.rejectWith(new Error('disco'));

      await expectAsync(useCase.execute(resumen('FINALIZADO'))).toBeRejectedWithError('disco');
      expect(repo.reabrirTag).not.toHaveBeenCalled();
    });
  });
});
