import { TestBed } from '@angular/core/testing';
import { ResumenEventoFacade } from './resumen-evento.facade';
import { GetResumenEventoUseCase, ResumenEvento } from '../../application/conteo/get-resumen-evento.use-case';
import { FinalizarEventoUseCase } from '../../application/conteo/finalizar-evento.use-case';
import { Evento } from '../../domain/evento/models/evento.model';

function evento(id: number, estado: Evento['estado']): Evento {
  return {
    id, sucursalId: 1, nombre: `Evento ${id}`,
    fechaProgramada: '2026-08-03', fechaEjecucion: null, estado,
    fechaRegistro: '2026-08-03 10:00:00',
  };
}

const RESUMEN: ResumenEvento = {
  totalMuestra: 10, contados: 8, faltantes: 2,
  tagsFinalizados: 3, iteracion: 1, qContado: 42,
};

describe('ResumenEventoFacade', () => {
  let facade: ResumenEventoFacade;
  let getResumen: jasmine.SpyObj<GetResumenEventoUseCase>;
  let finalizar: jasmine.SpyObj<FinalizarEventoUseCase>;

  beforeEach(() => {
    getResumen = jasmine.createSpyObj('GetResumenEventoUseCase', ['execute']);
    finalizar = jasmine.createSpyObj('FinalizarEventoUseCase', ['execute']);
    getResumen.execute.and.resolveTo(RESUMEN);

    TestBed.configureTestingModule({
      providers: [
        ResumenEventoFacade,
        { provide: GetResumenEventoUseCase, useValue: getResumen },
        { provide: FinalizarEventoUseCase, useValue: finalizar },
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
    finalizar.execute.and.resolveTo({ estado: 'CERRADO', totalMuestra: 10, contados: 10, faltantes: 0 });

    const resultado = await facade.finalizarEvento(1, 1, 1);

    expect(resultado?.estado).toBe('CERRADO');
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
});
