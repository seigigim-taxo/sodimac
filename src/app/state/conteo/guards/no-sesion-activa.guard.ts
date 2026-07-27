import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../../auth/auth.facade';
import { PdaFacade } from '../../pda/pda.facade';
import { GetConteosUseCase } from '../../../application/conteo/get-conteos.use-case';

/*
 * Bloquea /home (tienda + selección de evento) mientras haya un conteo
 * EN_CURSO: reiniciar la selección de evento a mitad de un trabajo activo
 * no tiene sentido de negocio y puede generar sesiones huérfanas. Cubre
 * toda vía de entrada (botón atrás de Android, deep link, navegación
 * manual), no solo el botón de la UI.
 */
export const noSesionActivaGuard: CanActivateFn = async () => {
  const auth       = inject(AuthFacade);
  const pda        = inject(PdaFacade);
  const getConteos = inject(GetConteosUseCase);
  const router     = inject(Router);

  const operadorId = auth.session()?.operadorId;
  const pdaId      = pda.pdaId();
  if (!operadorId || !pdaId) return true; // sin identidad no puede existir una sesión

  const conteos    = await getConteos.execute(operadorId, pdaId);
  const hayEnCurso = conteos.some((c) => c.estado === 'EN_CURSO');

  return hayEnCurso ? router.createUrlTree(['/counting']) : true;
};
