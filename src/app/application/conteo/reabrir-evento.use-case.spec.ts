import { TestBed } from '@angular/core/testing';
import { ReabrirEventoUseCase } from './reabrir-evento.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { Evento } from '../../domain/evento/models/evento.model';

function evento(parcial: Partial<Evento> = {}): Evento {
  return {
    id: 1, sucursalId: 1, nombre: 'Inventario test',
    fechaProgramada: '2026-09-02', fechaEjecucion: null, estado: 'EN_ANALISIS',
    fechaRegistro: '2026-09-02 08:00:00', ...parcial,
  };
}

describe('ReabrirEventoUseCase', () => {
  let useCase: ReabrirEventoUseCase;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;
  let eventoRepo: jasmine.SpyObj<EventoRepository>;

  beforeEach(() => {
    conteoRepo = jasmine.createSpyObj('ConteoRepository', ['getUltimaRonda', 'reabrirRonda']);
    eventoRepo = jasmine.createSpyObj('EventoRepository', ['getById', 'updateEstado']);

    eventoRepo.getById.and.resolveTo(evento());
    eventoRepo.updateEstado.and.resolveTo();
    conteoRepo.getUltimaRonda.and.resolveTo({
      id: 7, eventoId: 1, iteracion: 1, estado: 'FINALIZADO',
      fechaApertura: '2026-09-02 08:05:00', fechaCierre: '2026-09-02 12:00:00',
    });
    conteoRepo.reabrirRonda.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        ReabrirEventoUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: conteoRepo },
        { provide: EVENTO_REPOSITORY_TOKEN, useValue: eventoRepo },
      ],
    });
    useCase = TestBed.inject(ReabrirEventoUseCase);
  });

  it('reabre la última ronda y deja el evento ABIERTO', async () => {
    const resultado = await useCase.execute(1);

    expect(conteoRepo.reabrirRonda).toHaveBeenCalledWith(7);
    expect(eventoRepo.updateEstado).toHaveBeenCalledWith(1, 'ABIERTO');
    expect(resultado.estado).toBe('ABIERTO');
  });

  it('no toca nada si el evento no existe', async () => {
    eventoRepo.getById.and.resolveTo(null);

    await expectAsync(useCase.execute(1)).toBeRejectedWithError(/no se encontró/i);
    expect(conteoRepo.reabrirRonda).not.toHaveBeenCalled();
    expect(eventoRepo.updateEstado).not.toHaveBeenCalled();
  });

  it('no reabre un evento que no esté EN_ANALISIS', async () => {
    eventoRepo.getById.and.resolveTo(evento({ estado: 'ABIERTO' }));

    await expectAsync(useCase.execute(1)).toBeRejectedWithError(/en análisis/);
    expect(conteoRepo.reabrirRonda).not.toHaveBeenCalled();
  });

  it('no reabre un evento CERRADO: el SGO ya lo dio por terminado', async () => {
    eventoRepo.getById.and.resolveTo(evento({ estado: 'CERRADO' }));

    await expectAsync(useCase.execute(1)).toBeRejectedWithError(/en análisis/);
  });

  it('no hace nada si no hay una ronda cerrada que reabrir', async () => {
    conteoRepo.getUltimaRonda.and.resolveTo(null);

    await expectAsync(useCase.execute(1)).toBeRejectedWithError(/ronda cerrada/);
    expect(eventoRepo.updateEstado).not.toHaveBeenCalled();
  });

  it('no reabre si la última ronda ya está ABIERTA (estado inconsistente)', async () => {
    conteoRepo.getUltimaRonda.and.resolveTo({
      id: 7, eventoId: 1, iteracion: 1, estado: 'ABIERTO',
      fechaApertura: '2026-09-02 08:05:00', fechaCierre: null,
    });

    await expectAsync(useCase.execute(1)).toBeRejectedWithError(/ronda cerrada/);
    expect(conteoRepo.reabrirRonda).not.toHaveBeenCalled();
  });
});
