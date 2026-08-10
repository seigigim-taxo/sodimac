import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EventoFacade } from '../evento.facade';

/*
 * Bloquea /counting-tag y /counting si no hay evento seleccionado o si
 * el evento está en un estado que no permite contar:
 *  - null: no hay evento seleccionado (reload, navegación directa).
 *  - EN_ANALISIS: el SGO está analizando.
 *  - CERRADO: el evento ya terminó.
 */
export const eventoSeleccionadoGuard: CanActivateFn = () => {
  const eventoFacade = inject(EventoFacade);
  const router       = inject(Router);

  const evento = eventoFacade.selectedEvent();
  if (!evento) return router.createUrlTree(['/home']);
  if (evento.estado === 'EN_ANALISIS' || evento.estado === 'CERRADO') {
    return router.createUrlTree(['/home']);
  }
  return true;
};
