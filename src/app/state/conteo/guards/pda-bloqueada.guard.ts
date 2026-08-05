import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EventoFacade } from '../../evento/evento.facade';

/*
 * Bloquea la navegación a las pantallas de conteo cuando el evento seleccionado
 * está en estado EN_ANALISIS. En ese estado, el SGO está analizando los resultados
 * y la PDA debe permanecer en espera hasta que responda con la siguiente iteración.
 *
 * Si el evento está en EN_ANALISIS o no hay evento seleccionado, redirige a /home.
 */
export const pdaBloqueadaGuard: CanActivateFn = (route, state) => {
  const eventoFacade = inject(EventoFacade);
  const router = inject(Router);

  const evento = eventoFacade.selectedEvent();

  // Sin evento seleccionado, no hay nada que contar
  if (!evento) {
    return router.createUrlTree(['/home']);
  }

  // Si el evento está en análisis, la PDA debe esperar al SGO
  if (evento.estado === 'EN_ANALISIS') {
    return router.createUrlTree(['/home']);
  }

  // En otros casos (ABIERTO, RECONTEO), permite la navegación
  return true;
};
