import { TestBed } from '@angular/core/testing';
import { MockAsignacionApiRepository } from './mock-asignacion-api.repository';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { Evento } from '../../domain/evento/models/evento.model';

function evento(id: number, estado: Evento['estado']): Evento {
  return {
    id, sucursalId: 1, nombre: `Evento ${id}`,
    fechaProgramada: '2026-08-17', fechaEjecucion: null, estado,
    fechaRegistro: '2026-08-17 08:00:00',
  };
}

describe('MockAsignacionApiRepository', () => {
  let repo: MockAsignacionApiRepository;
  let eventoRepo: jasmine.SpyObj<EventoRepository>;

  beforeEach(() => {
    eventoRepo = jasmine.createSpyObj('EventoRepository', ['getBySucursal', 'getById', 'updateEstado', 'asegurarEvento']);

    TestBed.configureTestingModule({
      providers: [
        MockAsignacionApiRepository,
        { provide: EVENTO_REPOSITORY_TOKEN, useValue: eventoRepo },
      ],
    });
    repo = TestBed.inject(MockAsignacionApiRepository);
  });

  it('asigna un evento abierto de la tienda', async () => {
    eventoRepo.getBySucursal.and.resolveTo([evento(7, 'ABIERTO')]);

    const asignacion = await repo.consultarNuevaAsignacion(1, null);

    expect(asignacion?.eventoId).toBe(7);
    expect(asignacion?.nombre).toBe('Evento 7');
  });

  /* El que se acaba de terminar no puede volver a asignarse. */
  it('descarta el evento recién finalizado', async () => {
    eventoRepo.getBySucursal.and.resolveTo([evento(7, 'ABIERTO')]);

    expect(await repo.consultarNuevaAsignacion(1, 7)).toBeNull();
  });

  it('no asigna eventos en análisis ni cerrados', async () => {
    eventoRepo.getBySucursal.and.resolveTo([evento(8, 'EN_ANALISIS'), evento(9, 'CERRADO')]);

    expect(await repo.consultarNuevaAsignacion(1, null)).toBeNull();
  });

  /* Sin novedad es una respuesta normal, no un error. */
  it('devuelve null cuando la tienda no tiene eventos', async () => {
    eventoRepo.getBySucursal.and.resolveTo([]);

    expect(await repo.consultarNuevaAsignacion(1, null)).toBeNull();
  });
});
