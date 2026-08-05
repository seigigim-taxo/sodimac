import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { ZonaFacade } from '../../zona/zona.facade';

/*
 * Bloquea /counting si no hay TAG+zona confirmados — evita entrar en blanco por
 * un reload o una navegación directa; el operador vuelve a /counting-tag.
 *
 * Se exige ubicacionId además del tag y la zona: es lo que prueba que la
 * ubicación quedó registrada en sod_ubicacion, que es contra lo que se cuenta.
 */
export const tagEnSesionGuard: CanActivateFn = () => {
  const zonaFacade = inject(ZonaFacade);
  const router     = inject(Router);

  const haySesion = zonaFacade.tagValue() && zonaFacade.selectedZone() && zonaFacade.ubicacionId();
  return haySesion ? true : router.createUrlTree(['/counting-tag']);
};
