import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthFacade } from '../auth.facade';

export const analystGuard: CanActivateFn = () => {
  const auth = inject(AuthFacade);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login']);
  }
  if (!auth.hasKnownProfile()) {
    return router.createUrlTree(['/sync-loading']);
  }
  return auth.isAnalyst() ? true : router.createUrlTree(['/home']);
};
