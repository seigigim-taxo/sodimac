import { TestBed } from '@angular/core/testing';
import { AbrirSiguienteIteracionUseCase } from './abrir-siguiente-iteracion.use-case';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { MUESTRA_REPOSITORY_TOKEN, MuestraRepository } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN, MuestraDetalleRepository } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { PLAN_MUESTRA_REPOSITORY_TOKEN, PlanMuestraRepository } from '../../domain/muestra/repositories/plan-muestra.repository';
import { AnalisisIteracion } from '../../domain/muestra/models/analisis-iteracion.model';
import { Evento } from '../../domain/evento/models/evento.model';

const EVENTO_VIEJO = 1;
const EVENTO_NUEVO = 77;

function evento(parcial: Partial<Evento> = {}): Evento {
  return {
    id: EVENTO_VIEJO,
    sucursalId: 9,
    nombre: 'Inventario test',
    fechaProgramada: '2026-08-03',
    fechaEjecucion: null,
    estado: 'EN_ANALISIS',
    fechaRegistro: '2026-08-03 10:00:00',
    ...parcial,
  };
}

function analisis(parcial: Partial<AnalisisIteracion> = {}): AnalisisIteracion {
  return {
    iteracion: 2,
    fechaProgramada: '2026-08-03',
    estado: 'RECONTEO',
    codigoMuestra: 'MOCK-E1-IT2',
    nombreMuestra: 'Reconteo iteración 2',
    skusARecontar: [
      { idMuestraDet: 1, sku: '8412345', codigoBarras: null, descripcion: 'Taladro', stockSistema: 12 },
    ],
    ...parcial,
  };
}

describe('AbrirSiguienteIteracionUseCase', () => {
  let useCase: AbrirSiguienteIteracionUseCase;
  let eventoRepo: jasmine.SpyObj<EventoRepository>;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;
  let muestraRepo: jasmine.SpyObj<MuestraRepository>;
  let detalleRepo: jasmine.SpyObj<MuestraDetalleRepository>;
  let planRepo: jasmine.SpyObj<PlanMuestraRepository>;

  /* Ronda tal como la devuelve el repositorio tras abrirla. */
  function ronda(iteracion: number, eventoId = EVENTO_VIEJO) {
    return {
      id: 100 + iteracion,
      eventoId,
      iteracion,
      estado: 'ABIERTO' as const,
      fechaApertura: '2026-08-05 10:00:00',
      fechaCierre: null,
    };
  }

  beforeEach(() => {
    eventoRepo  = jasmine.createSpyObj('EventoRepository', ['getById', 'updateEstado', 'getBySucursal', 'asegurarEvento', 'crearEvento']);
    conteoRepo  = jasmine.createSpyObj('ConteoRepository', ['getUltimaRonda', 'abrirRonda', 'cerrarRonda']);
    muestraRepo = jasmine.createSpyObj('MuestraRepository', ['getByEvento', 'asegurarMuestra']);
    detalleRepo = jasmine.createSpyObj('MuestraDetalleRepository', ['getByMuestra', 'reemplazarDetalles']);
    planRepo    = jasmine.createSpyObj('PlanMuestraRepository', ['obtenerAnalisis']);

    eventoRepo.updateEstado.and.resolveTo();
    eventoRepo.crearEvento.and.resolveTo(EVENTO_NUEVO);
    conteoRepo.getUltimaRonda.and.resolveTo({ ...ronda(1), estado: 'FINALIZADO' as const });
    conteoRepo.cerrarRonda.and.resolveTo();
    conteoRepo.abrirRonda.and.callFake((e: number, i: number) => Promise.resolve(ronda(i, e)));
    muestraRepo.asegurarMuestra.and.resolveTo(555);
    detalleRepo.reemplazarDetalles.and.resolveTo();
    planRepo.obtenerAnalisis.and.resolveTo(analisis());

    TestBed.configureTestingModule({
      providers: [
        AbrirSiguienteIteracionUseCase,
        { provide: EVENTO_REPOSITORY_TOKEN,          useValue: eventoRepo },
        { provide: CONTEO_REPOSITORY_TOKEN,          useValue: conteoRepo },
        { provide: MUESTRA_REPOSITORY_TOKEN,         useValue: muestraRepo },
        { provide: MUESTRA_DETALLE_REPOSITORY_TOKEN, useValue: detalleRepo },
        { provide: PLAN_MUESTRA_REPOSITORY_TOKEN,    useValue: planRepo },
      ],
    });
    useCase = TestBed.inject(AbrirSiguienteIteracionUseCase);
  });

  it('crea un evento nuevo y abre la ronda sobre él, no sobre el anterior', async () => {
    eventoRepo.getById.and.resolveTo(evento());

    const resultado = await useCase.execute(EVENTO_VIEJO);

    expect(eventoRepo.crearEvento).toHaveBeenCalledWith({
      sucursalId: 9,
      fechaProgramada: '2026-08-03',
      estado: 'RECONTEO',
      nombre: 'Reconteo iteración 2',
    });
    expect(conteoRepo.abrirRonda).toHaveBeenCalledWith(EVENTO_NUEVO, 2);
    expect(resultado.eventoId).toBe(EVENTO_NUEVO);
    expect(resultado.iteracion).toBe(2);
    expect(resultado.iteracionAnterior).toBe(1);
    expect(resultado.conMuestra).toBeTrue();
  });

  it('la fecha repetida no impide crear el evento', async () => {
    // Es el caso que obliga a usar crearEvento: asegurarEvento devolvería el
    // evento viejo y la muestra acotada pisaría a la de la ronda anterior.
    eventoRepo.getById.and.resolveTo(evento({ fechaProgramada: '2026-08-03' }));

    await useCase.execute(EVENTO_VIEJO);

    expect(eventoRepo.asegurarEvento).not.toHaveBeenCalled();
    expect(eventoRepo.crearEvento).toHaveBeenCalled();
  });

  it('cuelga la muestra acotada del evento nuevo', async () => {
    eventoRepo.getById.and.resolveTo(evento());

    await useCase.execute(EVENTO_VIEJO);

    expect(muestraRepo.asegurarMuestra).toHaveBeenCalledWith({
      codigoMuestra: 'MOCK-E1-IT2',
      eventoId: EVENTO_NUEVO,
      sucursalId: 9,
      nombre: 'Reconteo iteración 2',
    });
    expect(detalleRepo.reemplazarDetalles).toHaveBeenCalledWith(555, analisis().skusARecontar);
  });

  it('no toca el estado del evento anterior: queda como historial', async () => {
    eventoRepo.getById.and.resolveTo(evento());

    await useCase.execute(EVENTO_VIEJO);

    expect(eventoRepo.updateEstado).not.toHaveBeenCalled();
  });

  it('toma el número de iteración del análisis, no de la última ronda', async () => {
    // Con un evento por ronda, deducirlo sería imposible: getUltimaRonda sobre
    // el evento nuevo no devolvería nada y toda ronda se numeraría 2.
    eventoRepo.getById.and.resolveTo(evento());
    conteoRepo.getUltimaRonda.and.resolveTo(ronda(3));
    planRepo.obtenerAnalisis.and.resolveTo(analisis({ iteracion: 4 }));

    const resultado = await useCase.execute(EVENTO_VIEJO);

    expect(resultado.iteracion).toBe(4);
    expect(conteoRepo.abrirRonda).toHaveBeenCalledWith(EVENTO_NUEVO, 4);
  });

  it('el número explícito tiene prioridad sobre el del análisis', async () => {
    eventoRepo.getById.and.resolveTo(evento());
    conteoRepo.getUltimaRonda.and.resolveTo(ronda(2));

    const resultado = await useCase.execute(EVENTO_VIEJO, 5);

    expect(resultado.iteracion).toBe(5);
  });

  it('rechaza una iteración que no sea posterior a la activa', async () => {
    eventoRepo.getById.and.resolveTo(evento());
    conteoRepo.getUltimaRonda.and.resolveTo(ronda(3));

    await expectAsync(useCase.execute(EVENTO_VIEJO, 3)).toBeRejectedWithError(/no es posterior a la activa/);
    expect(eventoRepo.crearEvento).not.toHaveBeenCalled();
    expect(conteoRepo.abrirRonda).not.toHaveBeenCalled();
  });

  it('solo abre iteración sobre un evento en análisis', async () => {
    eventoRepo.getById.and.resolveTo(evento({ estado: 'ABIERTO' }));

    await expectAsync(useCase.execute(EVENTO_VIEJO)).toBeRejectedWithError(/evento en análisis/);
    expect(planRepo.obtenerAnalisis).not.toHaveBeenCalled();
    expect(eventoRepo.crearEvento).not.toHaveBeenCalled();
  });

  it('corta el ciclo cuando el SGO no pide otra ronda', async () => {
    eventoRepo.getById.and.resolveTo(evento());
    planRepo.obtenerAnalisis.and.resolveTo(null);

    await expectAsync(useCase.execute(EVENTO_VIEJO)).toBeRejectedWithError(/el conteo de este evento terminó/);
    expect(eventoRepo.crearEvento).not.toHaveBeenCalled();
  });

  it('informa cuando la ronda queda sin muestra que recontar', async () => {
    eventoRepo.getById.and.resolveTo(evento());
    planRepo.obtenerAnalisis.and.resolveTo(analisis({ skusARecontar: [] }));

    const resultado = await useCase.execute(EVENTO_VIEJO);

    expect(resultado.conMuestra).toBeFalse();
    // La ronda igual se abre: el evento nuevo tiene que existir.
    expect(conteoRepo.abrirRonda).toHaveBeenCalled();
  });

  it('cierra la ronda anterior si quedó abierta, antes de abrir la nueva', async () => {
    eventoRepo.getById.and.resolveTo(evento());
    conteoRepo.getUltimaRonda.and.resolveTo(ronda(1));   // estado ABIERTO

    await useCase.execute(EVENTO_VIEJO);

    expect(conteoRepo.cerrarRonda).toHaveBeenCalledWith(101);
    expect(conteoRepo.cerrarRonda).toHaveBeenCalledBefore(conteoRepo.abrirRonda);
  });

  it('no intenta cerrar una ronda que ya estaba cerrada', async () => {
    eventoRepo.getById.and.resolveTo(evento());

    await useCase.execute(EVENTO_VIEJO);

    expect(conteoRepo.cerrarRonda).not.toHaveBeenCalled();
  });

  it('falla si el evento no existe', async () => {
    eventoRepo.getById.and.resolveTo(null);

    await expectAsync(useCase.execute(404)).toBeRejectedWithError(/No se encontró el evento/);
  });
});
