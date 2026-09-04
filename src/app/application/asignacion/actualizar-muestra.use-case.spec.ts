import { TestBed } from '@angular/core/testing';
import { ActualizarMuestraUseCase } from './actualizar-muestra.use-case';
import { FinalizarEventoUseCase } from '../conteo/finalizar-evento.use-case';
import { EvaluarJornadasUseCase, ResultadoJornada } from './evaluar-jornadas.use-case';
import { Session } from '../../domain/auth/models/session.model';
import { Evento } from '../../domain/evento/models/evento.model';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';

/*
 * Lo que se prueba acá es la ORQUESTACIÓN, no las reglas de cierre ni de
 * búsqueda/reapertura por jornada: esas ya están probadas donde viven
 * (FinalizarEventoUseCase, EvaluarJornadasUseCase). Los dos van doblados.
 */
const SESION: Session = { operadorId: 7, rutNormalizado: '12345678', correo: 'op@sodimac.cl' };
const PDA_ID = 4;

const evento = (estado: Evento['estado'], fechaProgramada = '2026-09-02'): Evento => ({
  id: 30, sucursalId: 1, nombre: 'RADIOS AUTO',
  fechaProgramada, fechaEjecucion: null, estado,
  fechaRegistro: `${fechaProgramada} 08:00:00`,
});

const asignacion: AsignacionConteo = {
  eventoId: 31, sucursalId: 1, nombre: 'AMPOLLETAS AUTO', fechaProgramada: '2026-09-02',
};

const sinNovedad = (fecha: string): ResultadoJornada => ({ fecha, resultado: { tipo: 'SIN_NOVEDAD' } });
const nuevo = (fecha: string, a: AsignacionConteo = asignacion): ResultadoJornada =>
  ({ fecha, resultado: { tipo: 'NUEVO', asignacion: a } });
const reabierto = (fecha: string, a: AsignacionConteo = asignacion): ResultadoJornada =>
  ({ fecha, resultado: { tipo: 'REABIERTO', asignacion: a } });

describe('ActualizarMuestraUseCase', () => {
  let uc: ActualizarMuestraUseCase;
  let finalizar: jasmine.Spy;
  let evaluar: jasmine.Spy;

  beforeEach(() => {
    finalizar = jasmine.createSpy('finalizar').and.resolveTo({ estado: 'EN_ANALISIS', totalMuestra: 0, contados: 0 });
    evaluar   = jasmine.createSpy('evaluar').and.resolveTo([sinNovedad('2026-09-02')]);

    TestBed.configureTestingModule({
      providers: [
        ActualizarMuestraUseCase,
        { provide: FinalizarEventoUseCase, useValue: { execute: finalizar } },
        { provide: EvaluarJornadasUseCase, useValue: { execute: evaluar } },
      ],
    });
    uc = TestBed.inject(ActualizarMuestraUseCase);
  });

  describe('evento ya terminado', () => {
    it('CERRADO no intenta cerrarlo de nuevo', async () => {
      await uc.execute(SESION, evento('CERRADO'), PDA_ID);

      expect(finalizar).not.toHaveBeenCalled();
      expect(evaluar).toHaveBeenCalled();
    });

    it('EN_ANALISIS tampoco', async () => {
      await uc.execute(SESION, evento('EN_ANALISIS'), PDA_ID);

      expect(finalizar).not.toHaveBeenCalled();
      expect(evaluar).toHaveBeenCalled();
    });
  });

  describe('evento todavía abierto', () => {
    it('ABIERTO se cierra antes de buscar', async () => {
      await uc.execute(SESION, evento('ABIERTO'), PDA_ID);

      expect(finalizar).toHaveBeenCalledWith(30, SESION.operadorId, PDA_ID);
      expect(evaluar).toHaveBeenCalled();
    });

    it('RECONTEO también se cierra antes de buscar', async () => {
      await uc.execute(SESION, evento('RECONTEO'), PDA_ID);

      expect(finalizar).toHaveBeenCalled();
      expect(evaluar).toHaveBeenCalled();
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
      expect(evaluar).not.toHaveBeenCalled();
    });

    it('un rechazo sin Error da un motivo genérico y no rompe', async () => {
      finalizar.and.rejectWith('fallo raro');

      const resultado = await uc.execute(SESION, evento('ABIERTO'), PDA_ID);

      expect(resultado.estado).toBe('BLOQUEADO');
      expect(evaluar).not.toHaveBeenCalled();
    });
  });

  describe('con evento seleccionado: escopeado a esa fecha', () => {
    it('devuelve ACTUALIZADA con la asignación de la jornada del evento', async () => {
      evaluar.and.resolveTo([nuevo('2026-09-02')]);

      const resultado = await uc.execute(SESION, evento('CERRADO'), PDA_ID);

      expect(resultado).toEqual({ estado: 'ACTUALIZADA', asignacion });
    });

    it('devuelve SIN_CAMBIOS cuando la jornada de esa fecha no tiene novedad', async () => {
      evaluar.and.resolveTo([sinNovedad('2026-09-02')]);

      const resultado = await uc.execute(SESION, evento('CERRADO'), PDA_ID);

      expect(resultado).toEqual({ estado: 'SIN_CAMBIOS' });
    });

    it('devuelve ACTUALIZADA cuando esa jornada se reabrió (cierre prematuro)', async () => {
      evaluar.and.resolveTo([reabierto('2026-09-02')]);

      const resultado = await uc.execute(SESION, evento('CERRADO'), PDA_ID);

      expect(resultado).toEqual({ estado: 'ACTUALIZADA', asignacion });
    });

    /*
     * EL CASO CENTRAL DE ESTE PASO: la otra jornada (mañana) tiene una
     * novedad, pero el evento seleccionado es el de hoy — actualizar hoy no
     * debe leer ni tocar mañana.
     */
    it('ignora la novedad de otra jornada cuando el evento seleccionado es de otra fecha', async () => {
      evaluar.and.resolveTo([
        sinNovedad('2026-09-02'),
        nuevo('2026-09-03', { ...asignacion, fechaProgramada: '2026-09-03' }),
      ]);

      const resultado = await uc.execute(SESION, evento('CERRADO', '2026-09-02'), PDA_ID);

      expect(resultado).toEqual({ estado: 'SIN_CAMBIOS' });
    });

    // Si el SGO ya no tiene ninguna jornada para esa fecha (caso raro), tampoco hay nada que mostrar.
    it('sin ningún resultado para la fecha del evento, da SIN_CAMBIOS', async () => {
      evaluar.and.resolveTo([]);

      const resultado = await uc.execute(SESION, evento('CERRADO'), PDA_ID);

      expect(resultado).toEqual({ estado: 'SIN_CAMBIOS' });
    });

    it('devuelve ERROR_BUSQUEDA con mensaje propio si EvaluarJornadasUseCase lanza', async () => {
      evaluar.and.rejectWith(new Error('El evento no tiene una ronda cerrada que reabrir.'));

      const resultado = await uc.execute(SESION, evento('CERRADO'), PDA_ID);

      expect(resultado.estado).toBe('ERROR_BUSQUEDA');
      expect((resultado as { mensaje: string }).mensaje).not.toContain('ronda');
      expect((resultado as { mensaje: string }).mensaje).toContain('maestra nueva');
    });
  });

  describe('sin evento seleccionado: informa la ventana completa', () => {
    it('no intenta cerrar nada', async () => {
      await uc.execute(SESION, null, PDA_ID);

      expect(finalizar).not.toHaveBeenCalled();
      expect(evaluar).toHaveBeenCalledWith(SESION);
    });

    it('devuelve VENTANA con el resultado de cada jornada, sin quedarse solo con una', async () => {
      const resultados = [sinNovedad('2026-09-02'), nuevo('2026-09-03')];
      evaluar.and.resolveTo(resultados);

      const resultado = await uc.execute(SESION, null, PDA_ID);

      expect(resultado).toEqual({ estado: 'VENTANA', resultados });
    });

    it('devuelve VENTANA aunque las dos jornadas estén sin novedad', async () => {
      const resultados = [sinNovedad('2026-09-02'), sinNovedad('2026-09-03')];
      evaluar.and.resolveTo(resultados);

      const resultado = await uc.execute(SESION, null, PDA_ID);

      expect(resultado).toEqual({ estado: 'VENTANA', resultados });
    });

    it('devuelve ERROR_BUSQUEDA si la evaluación falla', async () => {
      evaluar.and.rejectWith(new Error('sin red'));

      const resultado = await uc.execute(SESION, null, PDA_ID);

      expect(resultado.estado).toBe('ERROR_BUSQUEDA');
    });
  });
});
