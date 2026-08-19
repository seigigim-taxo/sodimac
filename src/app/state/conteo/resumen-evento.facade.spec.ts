import { TestBed } from '@angular/core/testing';
import { ResumenEventoFacade } from './resumen-evento.facade';
import { GetResumenEventoUseCase, ResumenEvento } from '../../application/conteo/get-resumen-evento.use-case';
import { FinalizarEventoUseCase } from '../../application/conteo/finalizar-evento.use-case';
import { GetTrazabilidadEventoUseCase } from '../../application/conteo/get-trazabilidad-evento.use-case';
import { Evento } from '../../domain/evento/models/evento.model';
import { ConteoTrazabilidadItem } from '../../domain/conteo/models/conteo-trazabilidad-item.model';

function evento(id: number, estado: Evento['estado']): Evento {
  return {
    id, sucursalId: 1, nombre: `Evento ${id}`,
    fechaProgramada: '2026-08-03', fechaEjecucion: null, estado,
    fechaRegistro: '2026-08-03 10:00:00',
  };
}

const RESUMEN: ResumenEvento = {
  totalMuestra: 10, contados: 8,
  tagsFinalizados: 3, iteracion: 1, qContado: 42,
};

const TRAZA: ConteoTrazabilidadItem = {
  iteracion: 1, conteoId: 1, tag: '104',
  zonaCodigo: 'SALA_VENTAS', zonaNombre: 'Sala de ventas',
  sku: '1234567', descripcion: 'Taladro',
  stockSistema: 5, cantidadFisica: 4,
  estado: 'FINALIZADO', fechaHora: '2026-08-17 10:00:00',
};

describe('ResumenEventoFacade', () => {
  let facade: ResumenEventoFacade;
  let getResumen: jasmine.SpyObj<GetResumenEventoUseCase>;
  let finalizar: jasmine.SpyObj<FinalizarEventoUseCase>;
  let trazabilidad: jasmine.SpyObj<GetTrazabilidadEventoUseCase>;

  beforeEach(() => {
    getResumen = jasmine.createSpyObj('GetResumenEventoUseCase', ['execute']);
    finalizar = jasmine.createSpyObj('FinalizarEventoUseCase', ['execute']);
    trazabilidad = jasmine.createSpyObj('GetTrazabilidadEventoUseCase', ['execute']);
    getResumen.execute.and.resolveTo(RESUMEN);
    trazabilidad.execute.and.resolveTo([]);

    TestBed.configureTestingModule({
      providers: [
        ResumenEventoFacade,
        { provide: GetResumenEventoUseCase, useValue: getResumen },
        { provide: FinalizarEventoUseCase, useValue: finalizar },
        { provide: GetTrazabilidadEventoUseCase, useValue: trazabilidad },
      ],
    });
    facade = TestBed.inject(ResumenEventoFacade);
  });

  it('carga el avance de la ronda activa', async () => {
    await facade.cargarAvance(1, 1, 1);

    expect(facade.avance()).toEqual(RESUMEN);
    expect(facade.error()).toBeNull();
  });

  it('solo pide resumen de los eventos cerrados o en análisis', async () => {
    await facade.cargarCerrados(
      [evento(1, 'ABIERTO'), evento(2, 'CERRADO'), evento(3, 'EN_ANALISIS'), evento(4, 'RECONTEO')],
      1, 1
    );

    expect(getResumen.execute).toHaveBeenCalledTimes(2);
    expect(facade.cerrados().map((c) => c.evento.id)).toEqual([2, 3]);
  });

  it('no consulta nada si no hay eventos cerrados', async () => {
    await facade.cargarCerrados([evento(1, 'ABIERTO')], 1, 1);

    expect(getResumen.execute).not.toHaveBeenCalled();
    expect(facade.cerrados()).toEqual([]);
  });

  it('devuelve el resultado al finalizar el conteo', async () => {
    finalizar.execute.and.resolveTo({ estado: 'EN_ANALISIS', totalMuestra: 10, contados: 10 });

    const resultado = await facade.finalizarEvento(1, 1, 1);

    expect(resultado?.estado).toBe('EN_ANALISIS');
    expect(facade.finalizando()).toBeFalse();
  });

  it('captura el error de finalizar sin propagarlo a la pantalla', async () => {
    finalizar.execute.and.rejectWith(new Error('Aún quedan TAGs en curso'));

    const resultado = await facade.finalizarEvento(1, 1, 1);

    expect(resultado).toBeNull();
    expect(facade.error()).toBe('Aún quedan TAGs en curso');
    // Aunque falle, el flag de "finalizando" tiene que quedar abajo.
    expect(facade.finalizando()).toBeFalse();
  });

  it('carga la trazabilidad del evento', async () => {
    trazabilidad.execute.and.resolveTo([TRAZA]);

    await facade.cargarTrazabilidad(1, 1, 1);

    expect(trazabilidad.execute).toHaveBeenCalledWith(1, 1, 1);
    expect(facade.trazabilidad()).toEqual([TRAZA]);
    expect(facade.trazabilidadLoading()).toBeFalse();
  });

  /*
   * La trazabilidad es una vista de solo lectura: si falla, la pantalla muestra
   * el error con la lista vacía, no la lista anterior — que sería de otro evento.
   */
  it('vacía la trazabilidad si la consulta falla', async () => {
    trazabilidad.execute.and.resolveTo([TRAZA]);
    await facade.cargarTrazabilidad(1, 1, 1);

    trazabilidad.execute.and.rejectWith(new Error('Base local no disponible'));
    await facade.cargarTrazabilidad(2, 1, 1);

    expect(facade.trazabilidad()).toEqual([]);
    expect(facade.error()).toBe('Base local no disponible');
    expect(facade.trazabilidadLoading()).toBeFalse();
  });
});
