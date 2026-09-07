import { TestBed } from '@angular/core/testing';
import { ActualizarMuestraUseCase } from './actualizar-muestra.use-case';
import { EvaluarJornadasUseCase, ResultadoJornada } from './evaluar-jornadas.use-case';
import { Session } from '../../domain/auth/models/session.model';
import { Evento } from '../../domain/evento/models/evento.model';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';

/*
 * Lo que se prueba acá es la ORQUESTACIÓN, no las reglas de evaluación por
 * jornada: esas ya están probadas donde viven (EvaluarJornadasUseCase).
 * Ese va doblado.
 */
const SESION: Session = { operadorId: 7, rutNormalizado: '12345678', correo: 'op@sodimac.cl' };

const evento = (fechaProgramada = '2026-09-02'): Evento => ({
  id: 30, sucursalId: 1, nombre: 'RADIOS AUTO',
  fechaProgramada, fechaEjecucion: null, estado: 'ABIERTO',
  fechaRegistro: `${fechaProgramada} 08:00:00`,
});

const asignacion: AsignacionConteo = {
  eventoId: 31, sucursalId: 1, nombre: 'AMPOLLETAS AUTO', fechaProgramada: '2026-09-02',
};

const sinNovedad = (fecha: string): ResultadoJornada => ({ fecha, resultado: { tipo: 'SIN_NOVEDAD' } });
const nuevo = (fecha: string, a: AsignacionConteo = asignacion): ResultadoJornada =>
  ({ fecha, resultado: { tipo: 'NUEVO', asignacion: a } });

describe('ActualizarMuestraUseCase', () => {
  let uc: ActualizarMuestraUseCase;
  let evaluar: jasmine.Spy;

  beforeEach(() => {
    evaluar = jasmine.createSpy('evaluar').and.resolveTo([sinNovedad('2026-09-02')]);

    TestBed.configureTestingModule({
      providers: [
        ActualizarMuestraUseCase,
        { provide: EvaluarJornadasUseCase, useValue: { execute: evaluar } },
      ],
    });
    uc = TestBed.inject(ActualizarMuestraUseCase);
  });

  describe('con evento seleccionado: escopeado a esa fecha', () => {
    it('no toca el evento, solo consulta', async () => {
      await uc.execute(SESION, evento());

      expect(evaluar).toHaveBeenCalledWith(SESION);
    });

    it('devuelve ACTUALIZADA con la asignación de la jornada del evento', async () => {
      evaluar.and.resolveTo([nuevo('2026-09-02')]);

      const resultado = await uc.execute(SESION, evento());

      expect(resultado).toEqual({ estado: 'ACTUALIZADA', asignacion });
    });

    it('devuelve SIN_CAMBIOS cuando la jornada de esa fecha no tiene novedad', async () => {
      evaluar.and.resolveTo([sinNovedad('2026-09-02')]);

      const resultado = await uc.execute(SESION, evento());

      expect(resultado).toEqual({ estado: 'SIN_CAMBIOS' });
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

      const resultado = await uc.execute(SESION, evento('2026-09-02'));

      expect(resultado).toEqual({ estado: 'SIN_CAMBIOS' });
    });

    // Si el SGO ya no tiene ninguna jornada para esa fecha (caso raro), tampoco hay nada que mostrar.
    it('sin ningún resultado para la fecha del evento, da SIN_CAMBIOS', async () => {
      evaluar.and.resolveTo([]);

      const resultado = await uc.execute(SESION, evento());

      expect(resultado).toEqual({ estado: 'SIN_CAMBIOS' });
    });

    it('devuelve ERROR_BUSQUEDA con mensaje propio si EvaluarJornadasUseCase lanza', async () => {
      evaluar.and.rejectWith(new Error('Sin conexión con el servidor.'));

      const resultado = await uc.execute(SESION, evento());

      expect(resultado.estado).toBe('ERROR_BUSQUEDA');
      expect((resultado as { mensaje: string }).mensaje).not.toContain('conexión');
      expect((resultado as { mensaje: string }).mensaje).toContain('maestra nueva');
    });
  });

  describe('sin evento seleccionado: informa la ventana completa', () => {
    it('devuelve VENTANA con el resultado de cada jornada, sin quedarse solo con una', async () => {
      const resultados = [sinNovedad('2026-09-02'), nuevo('2026-09-03')];
      evaluar.and.resolveTo(resultados);

      const resultado = await uc.execute(SESION, null);

      expect(resultado).toEqual({ estado: 'VENTANA', resultados });
    });

    it('devuelve VENTANA aunque las dos jornadas estén sin novedad', async () => {
      const resultados = [sinNovedad('2026-09-02'), sinNovedad('2026-09-03')];
      evaluar.and.resolveTo(resultados);

      const resultado = await uc.execute(SESION, null);

      expect(resultado).toEqual({ estado: 'VENTANA', resultados });
    });

    it('devuelve ERROR_BUSQUEDA si la evaluación falla', async () => {
      evaluar.and.rejectWith(new Error('sin red'));

      const resultado = await uc.execute(SESION, null);

      expect(resultado.estado).toBe('ERROR_BUSQUEDA');
    });
  });
});
