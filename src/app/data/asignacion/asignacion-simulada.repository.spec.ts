import { TestBed } from '@angular/core/testing';
import { AsignacionSimuladaRepository } from './asignacion-simulada.repository';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { Evento } from '../../domain/evento/models/evento.model';

function evento(id: number, estado: Evento['estado'], nombre = `Evento ${id}`): Evento {
  return {
    id, sucursalId: 1, nombre,
    fechaProgramada: '2026-08-18', fechaEjecucion: null, estado,
    fechaRegistro: '2026-08-18 08:00:00',
  };
}

/*
 * El clonado es SQL contra SQLite nativo y no corre en el navegador, así que
 * acá se cubre lo que sí se puede decidir sin base: a quién se le da prioridad
 * y cuándo no hay nada que asignar. La copia se verifica en dispositivo.
 */
describe('AsignacionSimuladaRepository', () => {
  let repo: AsignacionSimuladaRepository;
  let eventoRepo: jasmine.SpyObj<EventoRepository>;
  let connection: jasmine.SpyObj<SqliteConnectionService>;

  beforeEach(() => {
    eventoRepo = jasmine.createSpyObj('EventoRepository', ['getBySucursal', 'getById', 'updateEstado', 'asegurarEvento']);
    connection = jasmine.createSpyObj('SqliteConnectionService', ['getConnection', 'enTransaccion']);

    TestBed.configureTestingModule({
      providers: [
        AsignacionSimuladaRepository,
        { provide: EVENTO_REPOSITORY_TOKEN, useValue: eventoRepo },
        { provide: SqliteConnectionService, useValue: connection },
      ],
    });
    repo = TestBed.inject(AsignacionSimuladaRepository);
  });

  /* Si el SGO ya entregó trabajo real, contar sobre datos inventados sería peor. */
  it('prefiere un evento abierto real antes que clonar', async () => {
    eventoRepo.getBySucursal.and.resolveTo([evento(9, 'ABIERTO')]);

    const asignacion = await repo.consultarNuevaAsignacion(1, 5);

    expect(asignacion?.eventoId).toBe(9);
    expect(connection.getConnection).not.toHaveBeenCalled();
  });

  /*
   * El evento recién terminado no se reasigna a sí mismo: se intenta clonar. Si
   * no tiene muestra de iteración 1, no hay nada que copiar y no se asigna nada.
   */
  it('no reasigna el evento recién terminado', async () => {
    eventoRepo.getBySucursal.and.resolveTo([evento(5, 'ABIERTO')]);
    connection.getConnection.and.resolveTo({
      query: () => Promise.resolve({ values: [] }),
    } as never);

    expect(await repo.consultarNuevaAsignacion(1, 5)).toBeNull();
    expect(connection.enTransaccion).not.toHaveBeenCalled();
  });

  it('no asigna eventos en análisis ni cerrados', async () => {
    eventoRepo.getBySucursal.and.resolveTo([evento(8, 'EN_ANALISIS'), evento(9, 'CERRADO')]);

    expect(await repo.consultarNuevaAsignacion(1, null)).toBeNull();
  });
});
