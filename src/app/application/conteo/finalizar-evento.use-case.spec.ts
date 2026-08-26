import { TestBed } from '@angular/core/testing';
import { FinalizarEventoUseCase } from './finalizar-evento.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { MUESTRA_REPOSITORY_TOKEN, MuestraRepository } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN, MuestraDetalleRepository } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { ConteoResumen } from '../../domain/conteo/models/conteo-resumen.model';
import { Evento } from '../../domain/evento/models/evento.model';
import { MuestraDetalle } from '../../domain/muestra/models/muestra-detalle.model';

function evento(parcial: Partial<Evento> = {}): Evento {
  return {
    id: 1, sucursalId: 1, nombre: 'Inventario test',
    fechaProgramada: '2026-08-03', fechaEjecucion: null, estado: 'ABIERTO',
    fechaRegistro: '2026-08-03 10:00:00', ...parcial,
  };
}

function resumen(parcial: Partial<ConteoResumen> = {}): ConteoResumen {
  return {
    conteoId: 1, eventoId: 1, ubicacionId: 1, operadorId: 1, pdaId: 1, estado: 'SINCRONIZADO',
    tag: 'A-01', zonaCodigo: 'LC01', zonaNombre: 'Venta', totalProductos: 2,
    totalUnidades: 10, iteracion: 1, fechaUltima: '2026-08-03 11:00:00', ...parcial,
  };
}

function detalle(sku: string): MuestraDetalle {
  return { id: 1, muestraId: 1, productoId: 1, sku, stockSistema: 10, ubicacionEsperada: null };
}

describe('FinalizarEventoUseCase', () => {
  let useCase: FinalizarEventoUseCase;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;
  let muestraRepo: jasmine.SpyObj<MuestraRepository>;
  let detalleRepo: jasmine.SpyObj<MuestraDetalleRepository>;
  let eventoRepo: jasmine.SpyObj<EventoRepository>;

  beforeEach(() => {
    conteoRepo = jasmine.createSpyObj('ConteoRepository', ['getResumenes', 'getSkusContadosPorEvento', 'getRondaAbierta', 'cerrarRonda']);
    muestraRepo = jasmine.createSpyObj('MuestraRepository', ['getByEventoIteracion']);
    detalleRepo = jasmine.createSpyObj('MuestraDetalleRepository', ['getByMuestra']);
    eventoRepo = jasmine.createSpyObj('EventoRepository', ['getById', 'updateEstado', 'getBySucursal']);

    eventoRepo.getById.and.resolveTo(evento());
    eventoRepo.updateEstado.and.resolveTo();
    conteoRepo.getResumenes.and.resolveTo([resumen()]);
    muestraRepo.getByEventoIteracion.and.resolveTo({ id: 1, codigoMuestra: null, idAgenda: null, numeroAgenda: null, eventoId: 1, sucursalId: 1, iteracion: 1, estado: 'ACTIVA', nombre: null, nombreArchivo: null });
    detalleRepo.getByMuestra.and.resolveTo([detalle('AF001'), detalle('AF002')]);
    conteoRepo.getSkusContadosPorEvento.and.resolveTo(['AF001', 'AF002']);
    conteoRepo.getRondaAbierta.and.resolveTo({
      id: 5, eventoId: 1, iteracion: 1, estado: 'ABIERTO',
      fechaApertura: '2026-08-06 10:00:00', fechaCierre: null,
    });
    conteoRepo.cerrarRonda.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        FinalizarEventoUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: conteoRepo },
        { provide: MUESTRA_REPOSITORY_TOKEN, useValue: muestraRepo },
        { provide: MUESTRA_DETALLE_REPOSITORY_TOKEN, useValue: detalleRepo },
        { provide: EVENTO_REPOSITORY_TOKEN, useValue: eventoRepo },
      ],
    });
    useCase = TestBed.inject(FinalizarEventoUseCase);
  });

  it('deja el evento EN_ANALISIS: el resultado lo decide el SGO', async () => {
    const resultado = await useCase.execute(1, 1, 1);

    expect(resultado.estado).toBe('EN_ANALISIS');
    expect(eventoRepo.updateEstado).toHaveBeenCalledWith(1, 'EN_ANALISIS');
  });

  it('tampoco evalúa los SKUs sin contar', async () => {
    conteoRepo.getSkusContadosPorEvento.and.resolveTo(['AF001']);

    const resultado = await useCase.execute(1, 1, 1);

    expect(resultado.estado).toBe('EN_ANALISIS');
    expect(resultado.contados).toBe(1);
  });

  it('cierra la ronda al finalizar el conteo', async () => {
    await useCase.execute(1, 1, 1);

    // Si quedara abierta, al abrir el reconteo habría dos rondas abiertas.
    expect(conteoRepo.cerrarRonda).toHaveBeenCalledWith(5);
  });

  it('no cierra el evento aunque se haya contado toda la muestra', async () => {
    // Muestra completa (AF001 y AF002): la app igual NO decide CERRADO.
    const resultado = await useCase.execute(1, 1, 1);

    expect(resultado.contados).toBe(2);
    expect(eventoRepo.updateEstado).not.toHaveBeenCalledWith(1, 'CERRADO');
  });

  it('no permite cerrar con TAGs todavía en curso', async () => {
    conteoRepo.getResumenes.and.resolveTo([resumen({ estado: 'EN_CURSO' })]);

    await expectAsync(useCase.execute(1, 1, 1)).toBeRejectedWithError(/en curso/);
    expect(eventoRepo.updateEstado).not.toHaveBeenCalled();
  });

  /*
   * Un TAG FINALIZADO está contado y cerrado, pero nunca viajó al SGO. Cerrar
   * el conteo ahí dejaba trabajo que el servidor no recibe nunca, y la PDA
   * diciendo que terminó. Es lo que pidió Rodrigo el 26/08.
   */
  it('no permite cerrar con TAGs finalizados sin sincronizar', async () => {
    conteoRepo.getResumenes.and.resolveTo([resumen({ estado: 'FINALIZADO' })]);

    await expectAsync(useCase.execute(1, 1, 1)).toBeRejectedWithError(/sin sincronizar/);
    expect(eventoRepo.updateEstado).not.toHaveBeenCalled();
  });

  it('cierra cuando todos los TAGs están sincronizados', async () => {
    conteoRepo.getResumenes.and.resolveTo([
      resumen({ conteoId: 1, estado: 'SINCRONIZADO' }),
      resumen({ conteoId: 2, estado: 'SINCRONIZADO' }),
    ]);

    const resultado = await useCase.execute(1, 1, 1);

    expect(resultado.estado).toBe('EN_ANALISIS');
  });

  /*
   * Con las dos cosas pendientes se avisa primero lo de contar: mandarlo a
   * sincronizar mientras todavía le falta contar lo dejaría yendo y viniendo.
   */
  it('con ambos pendientes reclama primero los que están en curso', async () => {
    conteoRepo.getResumenes.and.resolveTo([
      resumen({ conteoId: 1, estado: 'EN_CURSO' }),
      resumen({ conteoId: 2, estado: 'FINALIZADO' }),
    ]);

    await expectAsync(useCase.execute(1, 1, 1)).toBeRejectedWithError(/en curso/);
  });

  // Los TAGs de otro evento no bloquean el cierre de este.
  it('ignora los pendientes de otros eventos', async () => {
    conteoRepo.getResumenes.and.resolveTo([
      resumen({ conteoId: 1, estado: 'SINCRONIZADO' }),
      resumen({ conteoId: 9, eventoId: 99, estado: 'EN_CURSO' }),
    ]);

    const resultado = await useCase.execute(1, 1, 1);

    expect(resultado.estado).toBe('EN_ANALISIS');
  });

  it('no permite cerrar dos veces el mismo conteo', async () => {
    eventoRepo.getById.and.resolveTo(evento({ estado: 'EN_ANALISIS' }));

    await expectAsync(useCase.execute(1, 1, 1)).toBeRejectedWithError(/ya está finalizado/);
    expect(eventoRepo.updateEstado).not.toHaveBeenCalled();
  });

  it('compara contra la muestra de la iteración actual', async () => {
    await useCase.execute(1, 1, 1);

    expect(muestraRepo.getByEventoIteracion).toHaveBeenCalledWith(1, 1);
  });
});
