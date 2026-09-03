import { TestBed } from '@angular/core/testing';
import { ActualizarMuestraUseCase } from './actualizar-muestra.use-case';
import { FinalizarEventoUseCase } from '../conteo/finalizar-evento.use-case';
import { BuscarNuevoConteoUseCase } from './buscar-nuevo-conteo.use-case';
import { Session } from '../../domain/auth/models/session.model';
import { Evento } from '../../domain/evento/models/evento.model';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';

/*
 * Lo que se prueba acá es la ORQUESTACIÓN, no las reglas de cierre ni de
 * búsqueda de muestra nueva: esas ya están probadas donde viven
 * (FinalizarEventoUseCase, BuscarNuevoConteoUseCase). Los dos van doblados.
 */
const SESION: Session = { operadorId: 7, rutNormalizado: '12345678', correo: 'op@sodimac.cl' };
const PDA_ID = 4;

const evento = (estado: Evento['estado']): Evento => ({
  id: 30, sucursalId: 1, nombre: 'RADIOS AUTO',
  fechaProgramada: '2026-09-02', fechaEjecucion: null, estado,
  fechaRegistro: '2026-09-02 08:00:00',
});

const asignacion: AsignacionConteo = {
  eventoId: 31, sucursalId: 1, nombre: 'AMPOLLETAS AUTO', fechaProgramada: '2026-09-02',
};

describe('ActualizarMuestraUseCase', () => {
  let uc: ActualizarMuestraUseCase;
  let finalizar: jasmine.Spy;
  let buscar: jasmine.Spy;

  beforeEach(() => {
    finalizar = jasmine.createSpy('finalizar').and.resolveTo({ estado: 'EN_ANALISIS', totalMuestra: 0, contados: 0 });
    buscar    = jasmine.createSpy('buscar').and.resolveTo({ asignacion: null, eventoCoincidenteId: null });

    TestBed.configureTestingModule({
      providers: [
        ActualizarMuestraUseCase,
        { provide: FinalizarEventoUseCase, useValue: { execute: finalizar } },
        { provide: BuscarNuevoConteoUseCase, useValue: { execute: buscar } },
      ],
    });
    uc = TestBed.inject(ActualizarMuestraUseCase);
  });

  describe('sin evento seleccionado', () => {
    it('no intenta cerrar nada y va directo a buscar', async () => {
      await uc.execute(SESION, null, PDA_ID);

      expect(finalizar).not.toHaveBeenCalled();
      expect(buscar).toHaveBeenCalledWith(SESION);
    });
  });

  describe('evento ya terminado', () => {
    it('CERRADO no intenta cerrarlo de nuevo', async () => {
      await uc.execute(SESION, evento('CERRADO'), PDA_ID);

      expect(finalizar).not.toHaveBeenCalled();
      expect(buscar).toHaveBeenCalled();
    });

    it('EN_ANALISIS tampoco', async () => {
      await uc.execute(SESION, evento('EN_ANALISIS'), PDA_ID);

      expect(finalizar).not.toHaveBeenCalled();
      expect(buscar).toHaveBeenCalled();
    });
  });

  describe('evento todavía abierto', () => {
    it('ABIERTO se cierra antes de buscar', async () => {
      await uc.execute(SESION, evento('ABIERTO'), PDA_ID);

      expect(finalizar).toHaveBeenCalledWith(30, SESION.operadorId, PDA_ID);
      expect(buscar).toHaveBeenCalled();
    });

    it('RECONTEO también se cierra antes de buscar', async () => {
      await uc.execute(SESION, evento('RECONTEO'), PDA_ID);

      expect(finalizar).toHaveBeenCalled();
      expect(buscar).toHaveBeenCalled();
    });

    /*
     * El caso que motivó todo esto: TAG en curso o sin sincronizar.
     * FinalizarEventoUseCase lanza, y ese mismo mensaje es el que se
     * devuelve — no se redacta uno nuevo acá.
     */
    it('si hay algo pendiente, bloquea con el mensaje de FinalizarEventoUseCase y no consulta al SGO', async () => {
      finalizar.and.rejectWith(new Error('Aún queda 1 TAG en curso — finalízalo antes de cerrar el conteo del evento.'));

      const resultado = await uc.execute(SESION, evento('ABIERTO'), PDA_ID);

      expect(resultado).toEqual({
        estado: 'BLOQUEADO',
        motivo: 'Aún queda 1 TAG en curso — finalízalo antes de cerrar el conteo del evento.',
      });
      expect(buscar).not.toHaveBeenCalled();
    });

    it('un rechazo sin Error da un motivo genérico y no rompe', async () => {
      finalizar.and.rejectWith('fallo raro');

      const resultado = await uc.execute(SESION, evento('ABIERTO'), PDA_ID);

      expect(resultado.estado).toBe('BLOQUEADO');
      expect(buscar).not.toHaveBeenCalled();
    });
  });

  describe('resultado de la búsqueda', () => {
    it('devuelve ACTUALIZADA con la asignación cuando el SGO trae una muestra distinta', async () => {
      buscar.and.resolveTo({ asignacion, eventoCoincidenteId: null });

      const resultado = await uc.execute(SESION, null, PDA_ID);

      expect(resultado).toEqual({ estado: 'ACTUALIZADA', asignacion });
    });

    it('devuelve SIN_CAMBIOS cuando el SGO no tiene nada nuevo', async () => {
      buscar.and.resolveTo({ asignacion: null, eventoCoincidenteId: null });

      const resultado = await uc.execute(SESION, null, PDA_ID);

      expect(resultado).toEqual({ estado: 'SIN_CAMBIOS' });
    });

    /*
     * Reabrir el evento recién cerrado es una decisión exclusiva del botón
     * "Actualizar" de Home (BuscarOReabrirConteoUseCase) — acá "mismo código"
     * sigue siendo, tal cual, SIN_CAMBIOS.
     */
    it('SIN_CAMBIOS aunque el código coincida con un evento propio: no reabre nada', async () => {
      buscar.and.resolveTo({ asignacion: null, eventoCoincidenteId: 30 });

      const resultado = await uc.execute(SESION, null, PDA_ID);

      expect(resultado).toEqual({ estado: 'SIN_CAMBIOS' });
    });
  });
});
