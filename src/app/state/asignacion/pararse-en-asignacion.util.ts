import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { SucursalFacade } from '../sucursal/sucursal.facade';
import { EventoFacade } from '../evento/evento.facade';

/*
 * Deja la app parada en la tienda y la lista de eventos que corresponden a una
 * asignación nueva del SGO.
 *
 * Vive como función suelta y no como método de una pantalla porque hay DOS
 * lugares que necesitan exactamente esto: Home, cuando el operador consulta
 * "¿me toca otro conteo?" después de terminar el suyo, y el menú lateral,
 * cuando actualiza la muestra desde cualquier pantalla. Escrita dos veces, esta
 * secuencia se desalinea en el primer arreglo que se le haga a una de las dos
 * — y ya pasó una vez, con el bug de "el conteo es de otra tienda".
 *
 * POR QUÉ SE RECARGA LA TIENDA
 *
 * El conteo nuevo puede ser en OTRA tienda: al operador se lo asignan por
 * jornada, no por local. Sin recargar y pararse en la tienda del conteo, la
 * pantalla seguía mostrando el local anterior y recargaba SUS eventos — el
 * conteo recién insertado no aparecía nunca: el aviso lo nombraba y no había
 * ninguna tarjeta que seleccionar.
 *
 * POR QUÉ SE LIMPIA LA SELECCIÓN ANTES DE RECARGAR
 *
 * El evento anterior queda seleccionado y `puedeSeleccionar` bloquea el cambio
 * mientras haya otro evento elegido. Sin soltarlo primero, el operador no
 * podría elegir el nuevo aunque ya esté en la lista.
 */
export async function pararseEnAsignacion(
  asignacion: AsignacionConteo,
  sucursalFacade: SucursalFacade,
  eventoFacade: EventoFacade,
  operadorId: number
): Promise<void> {
  return pararseEnSucursal(asignacion.sucursalId, sucursalFacade, eventoFacade, operadorId);
}

/*
 * El núcleo de lo de arriba, sin exigir una asignación completa (evento +
 * muestra): ActualizarTiendaOperadorUseCase puede confirmar que el operador
 * está en otra tienda sin que todavía exista ninguna jornada que contar ahí —
 * el SGO reasigna la tienda y arma la jornada en pasos separados. Pararse en
 * la tienda no debería esperar a que además haya trabajo asignado.
 */
export async function pararseEnSucursal(
  sucursalId: number,
  sucursalFacade: SucursalFacade,
  eventoFacade: EventoFacade,
  operadorId: number
): Promise<void> {
  await sucursalFacade.loadSucursales(operadorId);
  const tienda = sucursalFacade.stores().find((s) => s.id === sucursalId);
  if (tienda) sucursalFacade.selectSucursal(tienda);

  await eventoFacade.limpiarSeleccion();
  await eventoFacade.loadEventos(sucursalId);
}
