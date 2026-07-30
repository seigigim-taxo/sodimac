import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TagSesionStore } from '../tag-sesion.store';

/*
 * Bloquea /counting (pantalla de conteo) si no hay TAG+zona elegidos en
 * TagSesionStore — evita entrar en blanco por un reload o navegación
 * directa; el operador vuelve a /counting-tag a elegir TAG y zona.
 */
export const tagEnSesionGuard: CanActivateFn = () => {
  const tagSesion = inject(TagSesionStore);
  const router    = inject(Router);

  return tagSesion.tagActual() && tagSesion.zonaActual()
    ? true
    : router.createUrlTree(['/counting-tag']);
};
