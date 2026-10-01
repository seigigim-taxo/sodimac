import { Injectable, inject } from '@angular/core';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { DatosPreparacion } from '../../domain/sincronizacion/models/preparacion.model';

export interface TiendaVigente {
  sucursalId: number;
  codigoTienda: string;
  nombreTienda: string;
}

/*
 * "¿En qué tienda está el operador según el SGO, ahora mismo?" — separado de
 * si hay jornada o muestra nueva, a propósito.
 *
 * POR QUÉ ES UN CASO DE USO APARTE
 *
 * Antes, la tienda del operador solo se actualizaba como efecto secundario de
 * detectar una jornada nueva (EvaluarJornadasUseCase / BuscarNuevoConteoUseCase
 * llamaban a SincronizarDatosInicialesUseCase.persistir() solo cuando
 * encontraban un código de muestra desconocido). Eso deja un hueco real: al
 * operador lo pueden reasignar a otra tienda en el SGO sin que todavía exista
 * ninguna jornada ni muestra armada ahí —son dos pasos distintos del SGO—, y
 * en ese caso ninguna jornada se marca "nueva", `sod_user_sucursal` nunca se
 * actualiza, y la app sigue mostrando la tienda vieja indefinidamente, aunque
 * la respuesta de preparación ya traiga la tienda correcta.
 *
 * Por eso esto se persiste SIEMPRE que haya una tienda en la respuesta, sin
 * condicionarlo a que además haya trabajo nuevo que contar.
 *
 * NO DECIDE SI ES "UN CAMBIO"
 *
 * Deliberadamente no compara contra la tienda que el operador tiene
 * seleccionada en pantalla: eso es estado de UI (SucursalFacade), y este caso
 * de uso no lo conoce ni debería. Quien llama compara el `sucursalId` que
 * devuelve contra `SucursalFacade.currentStore()` y decide si vale la pena
 * pararse ahí.
 *
 * RECIBE `datos` YA DESCARGADOS
 *
 * No vuelve a llamar a preparación: el llamador ya la bajó (para evaluar
 * jornadas, o para el login) y descargarla dos veces por la misma consulta es
 * trabajo tirado además de abrir una ventana a que las dos respuestas no
 * coincidan exactamente.
 */
@Injectable({ providedIn: 'root' })
export class ActualizarTiendaOperadorUseCase {
  private sucursalRepo = inject(SUCURSAL_REPOSITORY_TOKEN);

  async execute(operadorId: number, datos: DatosPreparacion): Promise<TiendaVigente | null> {
    /*
     * El parser ya deja una sola tienda en `datos.tiendas` (la que el SGO
     * considera vigente para este operador) — ver preparacion.parser.ts.
     */
    const tienda = datos.tiendas[0];
    if (!tienda) return null;

    await this.sucursalRepo.guardarDeUsuario(operadorId, [{
      codigoTienda: tienda.codigoTienda,
      nombre: tienda.nombreTienda,
      zonaOperativa: tienda.zonaOperativa,
    }]);

    const sucursalId = await this.sucursalRepo.getIdPorCodigo(tienda.codigoTienda);
    if (sucursalId === null) return null; // no debería pasar: se acaba de guardar

    return { sucursalId, codigoTienda: tienda.codigoTienda, nombreTienda: tienda.nombreTienda };
  }
}
