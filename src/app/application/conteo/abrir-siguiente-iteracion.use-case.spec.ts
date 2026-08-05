import { TestBed } from '@angular/core/testing';
import { AbrirSiguienteIteracionUseCase } from './abrir-siguiente-iteracion.use-case';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { PLAN_MUESTRA_REPOSITORY_TOKEN, PlanMuestraRepository } from '../../domain/muestra/repositories/plan-muestra.repository';
import { Evento } from '../../domain/evento/models/evento.model';

function evento(parcial: Partial<Evento> = {}): Evento {
  return {
    id: 1,
    agendaId: null,
    sucursalId: 1,
    nombre: 'Inventario test',
    fechaProgramada: '2026-08-03',
    fechaEjecucion: null,
    estado: 'EN_ANALISIS',
    fechaRegistro: '2026-08-03 10:00:00',
    ...parcial,
  };
}

describe('AbrirSiguienteIteracionUseCase', () => {
  let useCase: AbrirSiguienteIteracionUseCase;
  let eventoRepo: jasmine.SpyObj<EventoRepository>;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;
  let planRepo: jasmine.SpyObj<PlanMuestraRepository>;

  beforeEach(() => {
    eventoRepo = jasmine.createSpyObj('EventoRepository', ['getById', 'updateEstado', 'getBySucursal']);
    conteoRepo = jasmine.createSpyObj('ConteoRepository', ['getIteracionActiva']);
    planRepo = jasmine.createSpyObj('PlanMuestraRepository', ['prepararMuestraDeIteracion']);

    eventoRepo.updateEstado.and.resolveTo();
    conteoRepo.getIteracionActiva.and.resolveTo(1);
    planRepo.prepararMuestraDeIteracion.and.resolveTo(99);

    TestBed.configureTestingModule({
      providers: [
        AbrirSiguienteIteracionUseCase,
        { provide: EVENTO_REPOSITORY_TOKEN, useValue: eventoRepo },
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: conteoRepo },
        { provide: PLAN_MUESTRA_REPOSITORY_TOKEN, useValue: planRepo },
      ],
    });
    useCase = TestBed.inject(AbrirSiguienteIteracionUseCase);
  });

  it('deja el evento en RECONTEO y anuncia la ronda siguiente', async () => {
    eventoRepo.getById.and.resolveTo(evento());

    const resultado = await useCase.execute(1);

    expect(resultado).toEqual({ iteracion: 2, iteracionAnterior: 1, conMuestra: true });
    expect(eventoRepo.updateEstado).toHaveBeenCalledWith(1, 'RECONTEO');
  });

  it('toma la ronda actual del conteo, no del evento', async () => {
    eventoRepo.getById.and.resolveTo(evento());
    conteoRepo.getIteracionActiva.and.resolveTo(3);

    const resultado = await useCase.execute(1);

    expect(conteoRepo.getIteracionActiva).toHaveBeenCalledWith(1);
    expect(resultado.iteracion).toBe(4);
  });

  it('usa el número que indique el SGO cuando se le pasa', async () => {
    eventoRepo.getById.and.resolveTo(evento());
    conteoRepo.getIteracionActiva.and.resolveTo(2);

    const resultado = await useCase.execute(1, 5);

    expect(resultado.iteracion).toBe(5);
  });

  it('rechaza una iteración que no sea posterior a la activa', async () => {
    eventoRepo.getById.and.resolveTo(evento());
    conteoRepo.getIteracionActiva.and.resolveTo(3);

    await expectAsync(useCase.execute(1, 3)).toBeRejectedWithError(/no es posterior a la activa/);
    expect(eventoRepo.updateEstado).not.toHaveBeenCalled();
  });

  it('solo abre iteración sobre un evento en análisis', async () => {
    eventoRepo.getById.and.resolveTo(evento({ estado: 'ABIERTO' }));

    await expectAsync(useCase.execute(1)).toBeRejectedWithError(/evento en análisis/);
    expect(eventoRepo.updateEstado).not.toHaveBeenCalled();
    expect(planRepo.prepararMuestraDeIteracion).not.toHaveBeenCalled();
  });

  it('informa cuando la ronda queda sin muestra que recontar', async () => {
    eventoRepo.getById.and.resolveTo(evento());
    planRepo.prepararMuestraDeIteracion.and.resolveTo(null);

    const resultado = await useCase.execute(1);

    expect(resultado.conMuestra).toBeFalse();
    // La ronda igual se abre: el estado del evento tiene que avanzar.
    expect(eventoRepo.updateEstado).toHaveBeenCalledWith(1, 'RECONTEO');
  });

  it('falla si el evento no existe', async () => {
    eventoRepo.getById.and.resolveTo(null);

    await expectAsync(useCase.execute(404)).toBeRejectedWithError(/No se encontró el evento/);
  });
});
