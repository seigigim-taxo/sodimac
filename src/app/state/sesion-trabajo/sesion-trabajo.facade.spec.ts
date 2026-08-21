import { TestBed } from '@angular/core/testing';
import { SesionTrabajoFacade } from './sesion-trabajo.facade';
import { RecuperarSesionTrabajoUseCase } from '../../application/conteo/recuperar-sesion-trabajo.use-case';
import { EventoFacade } from '../evento/evento.facade';
import { ZonaFacade } from '../zona/zona.facade';
import { ConteoFacade } from '../conteo/conteo.facade';
import { ConteoListFacade } from '../conteo/conteo-list.facade';
import { ResumenEventoFacade } from '../conteo/resumen-evento.facade';
import { SucursalFacade } from '../sucursal/sucursal.facade';

/*
 * limpiar() es lo único que separa el turno de un operador del siguiente en la
 * misma PDA. Las consultas filtran por operador_id, pero los signals de las
 * facades son de la app y sobreviven al logout: si una queda afuera de esta
 * lista, el operador que entra ve datos del anterior.
 *
 * Ya pasó una vez —se cubrieron conteo, zona y evento, y quedaron fuera la
 * lista de conteos, el resumen y las sucursales—, así que el conjunto se fija
 * acá. Al agregar una facade con datos por operador, corresponde sumarla al
 * método y a este test.
 */
describe('SesionTrabajoFacade.limpiar', () => {
  let facade: SesionTrabajoFacade;
  const dobles = {
    conteo:   jasmine.createSpyObj<ConteoFacade>('ConteoFacade', ['reset']),
    zona:     jasmine.createSpyObj<ZonaFacade>('ZonaFacade', ['reset']),
    lista:    jasmine.createSpyObj<ConteoListFacade>('ConteoListFacade', ['reset']),
    resumen:  jasmine.createSpyObj<ResumenEventoFacade>('ResumenEventoFacade', ['reset']),
    sucursal: jasmine.createSpyObj<SucursalFacade>('SucursalFacade', ['reset']),
    evento:   jasmine.createSpyObj<EventoFacade>('EventoFacade', ['limpiarSeleccion']),
  };

  beforeEach(() => {
    dobles.evento.limpiarSeleccion.and.resolveTo(undefined);

    TestBed.configureTestingModule({
      providers: [
        SesionTrabajoFacade,
        { provide: RecuperarSesionTrabajoUseCase, useValue: jasmine.createSpyObj('RecuperarSesionTrabajoUseCase', ['execute']) },
        { provide: ConteoFacade,        useValue: dobles.conteo },
        { provide: ZonaFacade,          useValue: dobles.zona },
        { provide: ConteoListFacade,    useValue: dobles.lista },
        { provide: ResumenEventoFacade, useValue: dobles.resumen },
        { provide: SucursalFacade,      useValue: dobles.sucursal },
        { provide: EventoFacade,        useValue: dobles.evento },
      ],
    });
    facade = TestBed.inject(SesionTrabajoFacade);
  });

  it('vacía todas las facades que guardan datos de un operador', async () => {
    await facade.limpiar();

    expect(dobles.conteo.reset).toHaveBeenCalled();
    expect(dobles.zona.reset).toHaveBeenCalled();
    expect(dobles.lista.reset).toHaveBeenCalled();
    expect(dobles.resumen.reset).toHaveBeenCalled();
    expect(dobles.sucursal.reset).toHaveBeenCalled();
    expect(dobles.evento.limpiarSeleccion).toHaveBeenCalled();
  });
});
