import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../../auth/auth.facade';
import { PdaFacade } from '../../pda/pda.facade';
import { ConteoFacade } from '../conteo.facade';
import { GetConteosUseCase } from '../../../application/conteo/get-conteos.use-case';

/*
 * Bloquea /home (tienda + selección de evento) mientras haya un conteo
 * abierto: reiniciar la selección de evento a mitad de un trabajo activo
 * no tiene sentido de negocio y puede generar sesiones huérfanas. Cubre
 * toda vía de entrada (botón atrás de Android, deep link, navegación
 * manual), no solo el botón de la UI.
 *
 * Se miran DOS fuentes porque una sola no alcanza:
 *  - SQLite: las líneas EN_CURSO, que es lo único que sobrevive a un apagón.
 *  - Memoria: la sesión del ConteoFacade. Las filas no se escriben al abrir el
 *    TAG sino al primer escaneo, así que un TAG recién abierto —o al que le
 *    borraron todas las líneas— no deja rastro en la base y por ahí se colaba
 *    de vuelta a /home, donde el operador podía arrancar otro TAG y abandonar
 *    el primero.
 *
 * La salida de un TAG abierto sin líneas es "Descartar TAG" en la pantalla de
 * conteo: sin eso, esta guarda dejaría al operador encerrado ahí, porque
 * finalizar exige al menos un producto.
 */
export const noSesionActivaGuard: CanActivateFn = async () => {
  const auth       = inject(AuthFacade);
  const pda        = inject(PdaFacade);
  const conteo     = inject(ConteoFacade);
  const getConteos = inject(GetConteosUseCase);
  const router     = inject(Router);

  if (conteo.enCurso()) return router.createUrlTree(['/counting']);

  const operadorId = auth.session()?.operadorId;
  const pdaId      = pda.pdaId();
  if (!operadorId || !pdaId) return true; // sin identidad no puede existir una sesión

  const conteos    = await getConteos.execute(operadorId, pdaId);
  const hayEnCurso = conteos.some((c) => c.estado === 'EN_CURSO');

  return hayEnCurso ? router.createUrlTree(['/counting']) : true;
};
