import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EventoFacade } from '../evento.facade';

/*
 * Bloquea /counting y /tags-resumen si no hay evento seleccionado. Sin esto,
 * un reload en dev (o una navegación directa) deja EventoFacade con
 * selectedEvent = null, y las pantallas de conteo no tienen contra qué evento
 * trabajar: se quedan vacías sin ningún error visible.
 */
export const eventoSeleccionadoGuard: CanActivateFn = () => {
  const eventoFacade = inject(EventoFacade);
  const router       = inject(Router);

  return eventoFacade.selectedEvent() !== null ? true : router.createUrlTree(['/home']);
};
