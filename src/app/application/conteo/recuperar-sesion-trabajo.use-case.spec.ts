import { TestBed } from '@angular/core/testing';
import { RecuperarSesionTrabajoUseCase } from './recuperar-sesion-trabajo.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { EVENTO_REPOSITORY_TOKEN, EventoRepository } from '../../domain/evento/repositories/evento.repository';
import { EVENTO_SELECCIONADO_STORAGE_TOKEN, EventoSeleccionadoStorageRepository } from '../../domain/evento/repositories/evento-seleccionado-storage.repository';
import { ZONA_REPOSITORY_TOKEN, ZonaRepository } from '../../domain/zona/repositories/zona.repository';
import { Evento } from '../../domain/evento/models/evento.model';
import { Zona } from '../../domain/zona/models/zona.model';
import { SesionTrabajoEnCurso } from '../../domain/conteo/models/sesion-trabajo.model';

const EVENTO: Evento = {
  id: 5, sucursalId: 1, nombre: 'Inventario agosto',
  fechaProgramada: '2026-08-17', fechaEjecucion: null, estado: 'ABIERTO',
  fechaRegistro: '2026-08-17 08:00:00',
};

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
    conteoRepo = jasmine.createSpyObj('ConteoRepository', ['getSesionEnCurso']);
    eventoRepo = jasmine.createSpyObj('EventoRepository', ['getById']);
    zonaRepo   = jasmine.createSpyObj('ZonaRepository', ['getBySucursal']);
    storage    = jasmine.createSpyObj('EventoSeleccionadoStorage', ['obtener']);

    conteoRepo.getSesionEnCurso.and.resolveTo(null);
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

  it('no restaura un evento que ya está en análisis', async () => {
    storage.obtener.and.resolveTo(5);
    eventoRepo.getById.and.resolveTo({ ...EVENTO, estado: 'EN_ANALISIS' });

    expect(await useCase.execute(7, 1)).toBeNull();
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
});
