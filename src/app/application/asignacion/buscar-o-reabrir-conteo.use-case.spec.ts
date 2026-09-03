import { TestBed } from '@angular/core/testing';
import { BuscarOReabrirConteoUseCase } from './buscar-o-reabrir-conteo.use-case';
import { BuscarNuevoConteoUseCase } from './buscar-nuevo-conteo.use-case';
import { ReabrirEventoUseCase } from '../conteo/reabrir-evento.use-case';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { Session } from '../../domain/auth/models/session.model';
import { Evento } from '../../domain/evento/models/evento.model';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';

/*
 * Lo que se prueba acá es la DECISIÓN de reabrir o no, no las reglas de
 * búsqueda ni de reapertura en sí — esas ya están probadas donde viven
 * (BuscarNuevoConteoUseCase, ReabrirEventoUseCase). Los dos van doblados.
 */
const SESION: Session = { operadorId: 7, rutNormalizado: '12345678', correo: 'op@sodimac.cl' };

function evento(parcial: Partial<Evento> = {}): Evento {
  return {
    id: 30, sucursalId: 1, nombre: 'RADIOS AUTO',
    fechaProgramada: '2026-09-03', fechaEjecucion: null, estado: 'EN_ANALISIS',
    fechaRegistro: '2026-09-03 08:00:00', ...parcial,
  };
}

const asignacionNueva: AsignacionConteo = {
  eventoId: 31, sucursalId: 1, nombre: 'AMPOLLETAS AUTO', fechaProgramada: '2026-09-03',
};

describe('BuscarOReabrirConteoUseCase', () => {
  let uc: BuscarOReabrirConteoUseCase;
  let buscar: jasmine.Spy;
  let reabrir: jasmine.Spy;
  let eventoRepo: jasmine.SpyObj<EventoRepository>;

  beforeEach(() => {
    buscar  = jasmine.createSpy('buscar').and.resolveTo({ asignacion: null, eventoCoincidenteId: null });
    reabrir = jasmine.createSpy('reabrir');
    eventoRepo = jasmine.createSpyObj('EventoRepository', ['getById']);

    TestBed.configureTestingModule({
      providers: [
        BuscarOReabrirConteoUseCase,
        { provide: BuscarNuevoConteoUseCase, useValue: { execute: buscar } },
        { provide: ReabrirEventoUseCase, useValue: { execute: reabrir } },
        { provide: EVENTO_REPOSITORY_TOKEN, useValue: eventoRepo },
      ],
    });
    uc = TestBed.inject(BuscarOReabrirConteoUseCase);
  });

  it('sin novedad y sin coincidencia: no toca nada', async () => {
    const resultado = await uc.execute(SESION);

    expect(resultado).toEqual({ tipo: 'SIN_NOVEDAD' });
    expect(eventoRepo.getById).not.toHaveBeenCalled();
    expect(reabrir).not.toHaveBeenCalled();
  });

  it('código distinto: es conteo nuevo, no consulta si hay que reabrir', async () => {
    buscar.and.resolveTo({ asignacion: asignacionNueva, eventoCoincidenteId: null });

    const resultado = await uc.execute(SESION);

    expect(resultado).toEqual({ tipo: 'NUEVO', asignacion: asignacionNueva });
    expect(eventoRepo.getById).not.toHaveBeenCalled();
  });

  describe('mismo código que un evento propio', () => {
    beforeEach(() => {
      buscar.and.resolveTo({ asignacion: null, eventoCoincidenteId: 30 });
    });

    it('EN_ANALISIS: lo reabre y lo devuelve como REABIERTO', async () => {
      eventoRepo.getById.and.resolveTo(evento({ estado: 'EN_ANALISIS' }));
      reabrir.and.resolveTo(evento({ estado: 'ABIERTO' }));

      const resultado = await uc.execute(SESION);

      expect(reabrir).toHaveBeenCalledWith(30);
      expect(resultado).toEqual({
        tipo: 'REABIERTO',
        asignacion: { eventoId: 30, sucursalId: 1, nombre: 'RADIOS AUTO', fechaProgramada: '2026-09-03' },
      });
    });

    it('ABIERTO (ya vigente): no hay nada que deshacer, sin novedad', async () => {
      eventoRepo.getById.and.resolveTo(evento({ estado: 'ABIERTO' }));

      const resultado = await uc.execute(SESION);

      expect(reabrir).not.toHaveBeenCalled();
      expect(resultado).toEqual({ tipo: 'SIN_NOVEDAD' });
    });

    it('CERRADO: el SGO ya se pronunció, esa decisión no se pisa', async () => {
      eventoRepo.getById.and.resolveTo(evento({ estado: 'CERRADO' }));

      const resultado = await uc.execute(SESION);

      expect(reabrir).not.toHaveBeenCalled();
      expect(resultado).toEqual({ tipo: 'SIN_NOVEDAD' });
    });

    it('evento inexistente (dato local corrupto): sin novedad, no revienta', async () => {
      eventoRepo.getById.and.resolveTo(null);

      const resultado = await uc.execute(SESION);

      expect(reabrir).not.toHaveBeenCalled();
      expect(resultado).toEqual({ tipo: 'SIN_NOVEDAD' });
    });
  });
});
