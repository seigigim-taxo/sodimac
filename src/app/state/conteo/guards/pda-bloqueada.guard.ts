import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EventoFacade } from '../../evento/evento.facade';

/*
 * Bloquea la navegación a las pantallas de conteo cuando el evento seleccionado
 * no permite contar:
 *  - EN_ANALISIS: el SGO está analizando y la PDA debe esperar.
 *  - CERRADO: el evento ya terminó y no acepta nuevas iteraciones.
 *
 * Solo permite la navegación para ABIERTO y RECONTEO.
 */
export const pdaBloqueadaGuard: CanActivateFn = (route, state) => {
  const eventoFacade = inject(EventoFacade);
  const router = inject(Router);

  const evento = eventoFacade.selectedEvent();

  // Sin evento seleccionado, no hay nada que contar
  if (!evento) {
    return router.createUrlTree(['/home']);
  }

  // Si el evento está en análisis o cerrado, redirigir a home
  if (evento.estado === 'EN_ANALISIS' || evento.estado === 'CERRADO') {
    return router.createUrlTree(['/home']);
  }

  // En otros casos (ABIERTO, RECONTEO), permite la navegación
  return true;
};
