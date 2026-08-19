import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../auth.facade';

export const operatorGuard: CanActivateFn = () => {
  const auth = inject(AuthFacade);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  if (!auth.hasKnownProfile()) {
    return router.createUrlTree(['/sync-loading']);
  }
  return auth.isOperator() ? true : router.createUrlTree(['/analyst-dashboard']);
};
