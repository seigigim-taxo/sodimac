import { pararseEnAsignacion } from './pararse-en-asignacion.util';
import { SucursalFacade } from '../sucursal/sucursal.facade';
import { EventoFacade } from '../evento/evento.facade';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { Sucursal } from '../../domain/sucursal/models/sucursal.model';

/*
 * El caso que motivó esta función: el conteo nuevo puede ser en OTRA tienda.
 * Sin pararse ahí, la pantalla seguía mostrando el local anterior y el conteo
 * recién insertado no aparecía nunca.
 */
const TIENDA_DEL_CONTEO: Sucursal = { id: 5, codigoTienda: '4724', nombre: 'HC BIOBIO' } as Sucursal;
const OTRA_TIENDA: Sucursal = { id: 1, codigoTienda: '4066', nombre: 'Otra' } as Sucursal;

const asignacion: AsignacionConteo = {
  eventoId: 30, sucursalId: TIENDA_DEL_CONTEO.id, nombre: 'AMPOLLETAS AUTO', fechaProgramada: '2026-09-02',
};

describe('pararseEnAsignacion', () => {
  let sucursalFacade: jasmine.SpyObj<SucursalFacade>;
  let eventoFacade: jasmine.SpyObj<EventoFacade>;

  beforeEach(() => {
    sucursalFacade = jasmine.createSpyObj('SucursalFacade', ['loadSucursales', 'stores', 'selectSucursal']);
    eventoFacade   = jasmine.createSpyObj('EventoFacade', ['limpiarSeleccion', 'loadEventos']);

    sucursalFacade.loadSucursales.and.resolveTo();
    sucursalFacade.stores.and.returnValue([OTRA_TIENDA, TIENDA_DEL_CONTEO]);
    eventoFacade.limpiarSeleccion.and.resolveTo();
    eventoFacade.loadEventos.and.resolveTo();
  });

  it('recarga las tiendas del operador antes de buscar la del conteo', async () => {
    await pararseEnAsignacion(asignacion, sucursalFacade, eventoFacade, 7);

    expect(sucursalFacade.loadSucursales).toHaveBeenCalledWith(7);
  });

  it('se para en la tienda del conteo, no en la que ya tenía abierta', async () => {
    await pararseEnAsignacion(asignacion, sucursalFacade, eventoFacade, 7);

    expect(sucursalFacade.selectSucursal).toHaveBeenCalledWith(TIENDA_DEL_CONTEO);
  });

  it('suelta el evento anterior antes de cargar los nuevos', async () => {
    const orden: string[] = [];
    eventoFacade.limpiarSeleccion.and.callFake(async () => { orden.push('limpiar'); });
    eventoFacade.loadEventos.and.callFake(async () => { orden.push('cargar'); });

    await pararseEnAsignacion(asignacion, sucursalFacade, eventoFacade, 7);

    expect(orden).toEqual(['limpiar', 'cargar']);
  });

  it('carga los eventos de la tienda del conteo', async () => {
    await pararseEnAsignacion(asignacion, sucursalFacade, eventoFacade, 7);

    expect(eventoFacade.loadEventos).toHaveBeenCalledWith(TIENDA_DEL_CONTEO.id);
  });

  /*
   * Si el maestro de tiendas del operador todavía no incluye la tienda del
   * conteo —por ejemplo, es la primera vez que le toca ese local— no hay nada
   * que seleccionar todavía. loadEventos igual se llama: es lo que termina
   * creándola en la base.
   */
  it('si la tienda del conteo no está en el maestro, no selecciona nada pero sigue', async () => {
    sucursalFacade.stores.and.returnValue([OTRA_TIENDA]);

    await pararseEnAsignacion(asignacion, sucursalFacade, eventoFacade, 7);

    expect(sucursalFacade.selectSucursal).not.toHaveBeenCalled();
    expect(eventoFacade.loadEventos).toHaveBeenCalledWith(TIENDA_DEL_CONTEO.id);
  });
});
