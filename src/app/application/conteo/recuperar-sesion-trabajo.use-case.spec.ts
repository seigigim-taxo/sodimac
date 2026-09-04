import { TestBed } from '@angular/core/testing';
import { RecuperarSesionTrabajoUseCase } from './recuperar-sesion-trabajo.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { EVENTO_SELECCIONADO_STORAGE_TOKEN, EventoSeleccionadoStorageRepository } from '../../domain/evento/repositories/evento-seleccionado-storage.repository';
import { ZONA_REPOSITORY_TOKEN, ZonaRepository } from '../../domain/zona/repositories/zona.repository';
import { Evento } from '../../domain/evento/models/evento.model';
import { Zona } from '../../domain/zona/models/zona.model';
import { SesionTrabajoEnCurso } from '../../domain/conteo/models/sesion-trabajo.model';
import { hoySql, manianaSql } from '../../shared/utils/fecha.utils';

/*
 * Las fechas van calculadas y no fijas: la restauración depende de la ventana
 * operativa, así que un literal dejaría el spec verde hoy y roto mañana.
 */
const EVENTO: Evento = {
  id: 5, sucursalId: 1, nombre: 'Inventario agosto',
  fechaProgramada: hoySql(), fechaEjecucion: null, estado: 'ABIERTO',
  fechaRegistro: `${hoySql()} 08:00:00`,
};

const ayer = () => {
  const f = new Date();
  f.setDate(f.getDate() - 1);
  return hoySql(f);
};

const pasadoManiana = () => {
  const f = new Date();
  f.setDate(f.getDate() + 2);
  return hoySql(f);
};

const EVENTO_DE_AYER: Evento = { ...EVENTO, fechaProgramada: ayer() };
const EVENTO_DE_MANIANA: Evento = { ...EVENTO, id: 6, fechaProgramada: manianaSql() };
const EVENTO_PASADO_MANIANA: Evento = { ...EVENTO, id: 7, fechaProgramada: pasadoManiana() };

const ZONA: Zona = {
  id: 3, sucursalId: 1, nombre: 'SALA_VENTAS',
  descripcion: 'Sala de ventas', tagDesde: 1, tagHasta: 999,
};

const SESION: SesionTrabajoEnCurso = {
  eventoId: 5, conteoId: 2, ubicacionId: 11, zonaId: 3,
  tag: '104', ubicacionPrecisa: 'PASILLO 4',
};

describe('RecuperarSesionTrabajoUseCase', () => {
  let useCase: RecuperarSesionTrabajoUseCase;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;
  let eventoRepo: jasmine.SpyObj<EventoRepository>;
  let zonaRepo: jasmine.SpyObj<ZonaRepository>;
  let storage: jasmine.SpyObj<EventoSeleccionadoStorageRepository>;

  beforeEach(() => {
    conteoRepo = jasmine.createSpyObj('ConteoRepository', ['getSesionEnCurso', 'getEventoIdUltimoTrabajo']);
    eventoRepo = jasmine.createSpyObj('EventoRepository', ['getById']);
    zonaRepo   = jasmine.createSpyObj('ZonaRepository', ['getBySucursal']);
    storage    = jasmine.createSpyObj('EventoSeleccionadoStorage', ['obtener']);

    conteoRepo.getSesionEnCurso.and.resolveTo(null);
    conteoRepo.getEventoIdUltimoTrabajo.and.resolveTo(null);
    eventoRepo.getById.and.resolveTo(EVENTO);
    zonaRepo.getBySucursal.and.resolveTo([ZONA]);
    storage.obtener.and.resolveTo(null);

    TestBed.configureTestingModule({
      providers: [
        RecuperarSesionTrabajoUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: conteoRepo },
        { provide: EVENTO_REPOSITORY_TOKEN, useValue: eventoRepo },
        { provide: ZONA_REPOSITORY_TOKEN, useValue: zonaRepo },
        { provide: EVENTO_SELECCIONADO_STORAGE_TOKEN, useValue: storage },
      ],
    });
    useCase = TestBed.inject(RecuperarSesionTrabajoUseCase);
  });

  it('devuelve el evento y el TAG abierto cuando quedó un conteo en curso', async () => {
    conteoRepo.getSesionEnCurso.and.resolveTo(SESION);

    const resultado = await useCase.execute(7, 1);

    expect(resultado?.evento).toEqual(EVENTO);
    expect(resultado?.conteo).toEqual({
      zona: ZONA, tag: '104', ubicacionId: 11, ubicacionPrecisa: 'PASILLO 4',
    });
  });

  it('sin conteo abierto restaura solo el evento que quedó elegido', async () => {
    storage.obtener.and.resolveTo(5);

    const resultado = await useCase.execute(7, 1);

    expect(resultado?.evento).toEqual(EVENTO);
    expect(resultado?.conteo).toBeNull();
  });

  it('el conteo en curso manda sobre la preferencia guardada', async () => {
    conteoRepo.getSesionEnCurso.and.resolveTo(SESION);
    storage.obtener.and.resolveTo(99);

    await useCase.execute(7, 1);

    expect(eventoRepo.getById).toHaveBeenCalledWith(5);
  });

  it('restaura un evento en análisis pero sin sesión de conteo', async () => {
    storage.obtener.and.resolveTo(5);
    const enAnalisis = { ...EVENTO, estado: 'EN_ANALISIS' as const };
    eventoRepo.getById.and.resolveTo(enAnalisis);

    const resultado = await useCase.execute(7, 1);

    expect(resultado?.evento).toEqual(enAnalisis);
    expect(resultado?.conteo).toBeNull();
  });

  it('tampoco arrastra una sesión de TAG si el evento ya está terminado', async () => {
    storage.obtener.and.resolveTo(5);
    conteoRepo.getSesionEnCurso.and.resolveTo(SESION);
    eventoRepo.getById.and.resolveTo({ ...EVENTO, estado: 'CERRADO' as const });

    const resultado = await useCase.execute(7, 1);

    expect(resultado?.conteo).toBeNull();
  });

  // La zona puede faltar si la sincronización la eliminó: el evento sigue sirviendo.
  it('devuelve el evento sin conteo si la zona ya no existe', async () => {
    conteoRepo.getSesionEnCurso.and.resolveTo(SESION);
    zonaRepo.getBySucursal.and.resolveTo([]);

    const resultado = await useCase.execute(7, 1);

    expect(resultado?.evento).toEqual(EVENTO);
    expect(resultado?.conteo).toBeNull();
  });

  it('no restaura nada si no hay conteo ni evento guardado', async () => {
    expect(await useCase.execute(7, 1)).toBeNull();
  });

  /*
   * Cada jornada arranca limpia. Las tres fuentes que resuelven el evento
   * —el TAG abierto, la preferencia y el último trabajo— sobreviven al cambio
   * de día, así que sin este corte el operador retomaba la jornada de ayer.
   */
  describe('un evento de otro día no se restaura', () => {
    it('aunque siga ABIERTO', async () => {
      eventoRepo.getById.and.resolveTo(EVENTO_DE_AYER);

      expect(await useCase.execute(7, 1)).toBeNull();
    });

    // El caso caro: se sigue contando sobre la jornada equivocada sin notarlo.
    it('aunque haya quedado un TAG a medio contar', async () => {
      conteoRepo.getSesionEnCurso.and.resolveTo(SESION);
      eventoRepo.getById.and.resolveTo(EVENTO_DE_AYER);

      expect(await useCase.execute(7, 1)).toBeNull();
    });

    it('aunque venga de la preferencia guardada', async () => {
      conteoRepo.getSesionEnCurso.and.resolveTo(null);
      storage.obtener.and.resolveTo(EVENTO_DE_AYER.id);
      eventoRepo.getById.and.resolveTo(EVENTO_DE_AYER);

      expect(await useCase.execute(7, 1)).toBeNull();
    });
  });

  /*
   * La jornada de mañana SÍ se restaura: el operador puede adelantarla, y si
   * cierra la app a mitad de un TAG tiene que poder retomarla al volver.
   *
   * Es el cambio de comportamiento de esta rama. Antes el corte era el día en
   * curso y esta sesión se perdía.
   */
  describe('la jornada adelantada de mañana', () => {
    beforeEach(() => {
      storage.obtener.and.resolveTo(EVENTO_DE_MANIANA.id);
      eventoRepo.getById.and.resolveTo(EVENTO_DE_MANIANA);
    });

    it('se restaura', async () => {
      const r = await useCase.execute(7, 1);

      expect(r?.evento.fechaProgramada).toBe(manianaSql());
    });

    it('se restaura con el TAG que había quedado abierto', async () => {
      conteoRepo.getSesionEnCurso.and.resolveTo(SESION);

      const r = await useCase.execute(7, 1);

      expect(r?.conteo?.tag).toBe('104');
    });
  });

  /*
   * Pasado mañana queda afuera. Marca el borde superior de la ventana: sin
   * esto, "no es de ayer" habría alcanzado y cualquier fecha futura entraría.
   */
  it('un evento de pasado mañana no se restaura', async () => {
    // El id tiene que venir de algún lado, si no el null saldría de no haber
    // evento y el test pasaría sin probar la ventana.
    storage.obtener.and.resolveTo(EVENTO_PASADO_MANIANA.id);
    eventoRepo.getById.and.resolveTo(EVENTO_PASADO_MANIANA);

    expect(await useCase.execute(7, 1)).toBeNull();
  });
});
