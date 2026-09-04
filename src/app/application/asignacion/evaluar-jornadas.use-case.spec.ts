import { TestBed } from '@angular/core/testing';
import { EvaluarJornadasUseCase } from './evaluar-jornadas.use-case';
import { SincronizarDatosInicialesUseCase } from '../sincronizacion/sincronizar-datos-iniciales.use-case';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { ReabrirEventoUseCase } from '../conteo/reabrir-evento.use-case';
import { Session } from '../../domain/auth/models/session.model';
import { Evento } from '../../domain/evento/models/evento.model';

/*
 * A diferencia de BuscarNuevoConteoUseCase (que se detiene en la primera
 * jornada nueva), acá CADA jornada tiene que quedar con su propio resultado
 * — es lo que permite el aviso "Hoy: sin cambios. Mañana: jornada nueva."
 */

const SESION: Session = { operadorId: 1, rutNormalizado: '12345678', correo: 'op@sodimac.cl' } as Session;

function jornada(codigoMuestra: string | null, codigoTienda: string | null = '4066', fecha = '2026-08-28') {
  return {
    evento:  { fechaProgramada: fecha, estado: 'ABIERTO' },
    tienda:  { codigoTienda: codigoTienda ?? '' },
    muestra: codigoMuestra === null ? null : {
      codigoMuestra, nombreMuestra: 'RADIOS', idAgenda: 1644, numeroAgenda: 'AG-01', detalles: [],
    },
  };
}

function preparacionDeDosDias(muestraHoy: string | null, muestraManiana: string | null) {
  return {
    tiendas: [{ codigoTienda: '4066' }],
    jornadas: [jornada(muestraHoy, '4066', '2026-08-28'), jornada(muestraManiana, '4066', '2026-08-29')],
  } as never;
}

const EVENTO_EN_ANALISIS: Evento = {
  id: 12, sucursalId: 4, nombre: 'RADIOS', fechaProgramada: '2026-08-28', fechaEjecucion: null,
  estado: 'EN_ANALISIS', fechaRegistro: '2026-08-28 08:00:00',
};

describe('EvaluarJornadasUseCase', () => {
  let uc: EvaluarJornadasUseCase;
  let descargar: jasmine.Spy;
  let persistir: jasmine.Spy;
  let getEventoIdPorCodigo: jasmine.Spy;
  let getIdPorCodigo: jasmine.Spy;
  let getById: jasmine.Spy;
  let reabrir: jasmine.Spy;

  beforeEach(() => {
    descargar = jasmine.createSpy('descargar').and.resolveTo(preparacionDeDosDias('MUE-HOY', 'MUE-MANIANA'));
    persistir = jasmine.createSpy('persistir').and.resolveTo({ usuario: {}, analista: null });
    getEventoIdPorCodigo = jasmine.createSpy('getEventoIdPorCodigo').and.resolveTo(null);
    getIdPorCodigo = jasmine.createSpy('getIdPorCodigo').and.resolveTo(4);
    getById = jasmine.createSpy('getById').and.resolveTo(null);
    reabrir = jasmine.createSpy('reabrir');

    TestBed.configureTestingModule({
      providers: [
        EvaluarJornadasUseCase,
        { provide: SincronizarDatosInicialesUseCase, useValue: { descargar, persistir } },
        { provide: MUESTRA_REPOSITORY_TOKEN,  useValue: { getEventoIdPorCodigo } },
        { provide: SUCURSAL_REPOSITORY_TOKEN, useValue: { getIdPorCodigo } },
        { provide: EVENTO_REPOSITORY_TOKEN,   useValue: { getById } },
        { provide: ReabrirEventoUseCase,      useValue: { execute: reabrir } },
      ],
    });
    uc = TestBed.inject(EvaluarJornadasUseCase);
  });

  it('devuelve NUEVO para las dos jornadas cuando ninguna está en la base', async () => {
    /*
     * La primera pasada consulta las dos jornadas (hoy, mañana) antes de que
     * arranque la segunda: el orden de llamadas es [hoy, mañana, hoy releída,
     * mañana releída], no intercalado por jornada.
     */
    getEventoIdPorCodigo.and.returnValues(
      Promise.resolve(null), Promise.resolve(null), // primera pasada: ninguna existe
      Promise.resolve(30), Promise.resolve(31),      // segunda pasada: releídas tras persistir
    );

    const resultados = await uc.execute(SESION);

    expect(resultados).toEqual([
      { fecha: '2026-08-28', resultado: { tipo: 'NUEVO', asignacion: { eventoId: 30, sucursalId: 4, nombre: 'RADIOS', fechaProgramada: '2026-08-28' } } },
      { fecha: '2026-08-29', resultado: { tipo: 'NUEVO', asignacion: { eventoId: 31, sucursalId: 4, nombre: 'RADIOS', fechaProgramada: '2026-08-29' } } },
    ]);
    expect(persistir).toHaveBeenCalled();
  });

  // El caso central: cada jornada informa lo suyo, no se detiene en la primera.
  it('informa sin cambios en hoy y nuevo en mañana, sin detenerse en la primera', async () => {
    getEventoIdPorCodigo.and.callFake(async (codigo: string) => {
      if (codigo === 'MUE-HOY') return 12; // ya la tenemos
      if (codigo === 'MUE-MANIANA') return null; // es nueva
      return 31; // releída tras persistir
    });

    const resultados = await uc.execute(SESION);

    expect(resultados[0]).toEqual({ fecha: '2026-08-28', resultado: { tipo: 'SIN_NOVEDAD' } });
    expect(resultados[1].resultado.tipo).toBe('NUEVO');
  });

  it('no persiste si las dos jornadas ya están en la base', async () => {
    getEventoIdPorCodigo.and.resolveTo(12);

    const resultados = await uc.execute(SESION);

    expect(resultados.every((r) => r.resultado.tipo === 'SIN_NOVEDAD')).toBeTrue();
    expect(persistir).not.toHaveBeenCalled();
  });

  /*
   * Reabrir: la jornada coincide con un evento propio que sigue EN_ANALISIS
   * —el mismo cierre prematuro que resuelve BuscarOReabrirConteoUseCase para
   * el botón "Actualizar" de Home, pero acá evaluado por jornada.
   */
  it('reabre la jornada que coincide con un evento propio en análisis', async () => {
    getEventoIdPorCodigo.and.callFake(async (codigo: string) => (codigo === 'MUE-HOY' ? 12 : null));
    getById.and.resolveTo(EVENTO_EN_ANALISIS);
    reabrir.and.resolveTo({ id: 12, sucursalId: 4, nombre: 'RADIOS', fechaProgramada: '2026-08-28' });

    const resultados = await uc.execute(SESION);

    expect(reabrir).toHaveBeenCalledWith(12);
    expect(resultados[0].resultado).toEqual({
      tipo: 'REABIERTO',
      asignacion: { eventoId: 12, sucursalId: 4, nombre: 'RADIOS', fechaProgramada: '2026-08-28' },
    });
  });

  it('no reabre si el evento coincidente no está EN_ANALISIS', async () => {
    getEventoIdPorCodigo.and.callFake(async (codigo: string) => (codigo === 'MUE-HOY' ? 12 : null));
    getById.and.resolveTo({ ...EVENTO_EN_ANALISIS, estado: 'ABIERTO' });

    const resultados = await uc.execute(SESION);

    expect(reabrir).not.toHaveBeenCalled();
    expect(resultados[0].resultado).toEqual({ tipo: 'SIN_NOVEDAD' });
  });

  // Que mañana venga incompleta (sin muestra) no puede tapar el resultado de hoy.
  it('una jornada sin muestra da sin novedad, sin afectar a la otra', async () => {
    descargar.and.resolveTo(preparacionDeDosDias('MUE-HOY', null));
    getEventoIdPorCodigo.and.callFake(async (codigo: string) => (codigo === 'MUE-HOY' ? null : 30));

    const resultados = await uc.execute(SESION);

    expect(resultados[0].resultado.tipo).toBe('NUEVO');
    expect(resultados[1]).toEqual({ fecha: '2026-08-29', resultado: { tipo: 'SIN_NOVEDAD' } });
  });

  it('acepta una sola jornada en la respuesta', async () => {
    descargar.and.resolveTo({
      tiendas: [{ codigoTienda: '4066' }],
      jornadas: [jornada('MUE-HOY', '4066', '2026-08-28')],
    } as never);
    getEventoIdPorCodigo.and.resolveTo(12);

    const resultados = await uc.execute(SESION);

    expect(resultados.length).toBe(1);
    expect(resultados[0].resultado).toEqual({ tipo: 'SIN_NOVEDAD' });
  });

  it('acepta una respuesta sin jornadas', async () => {
    descargar.and.resolveTo({ tiendas: [{ codigoTienda: '4066' }], jornadas: [] } as never);

    expect(await uc.execute(SESION)).toEqual([]);
    expect(persistir).not.toHaveBeenCalled();
  });
});
