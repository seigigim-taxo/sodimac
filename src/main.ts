import { APP_INITIALIZER } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { AuthFacade } from './app/state/auth/auth.facade';
import { ThemeFacade } from './app/state/theme/theme.facade';
import { CountingFacade } from './app/state/counting/counting.facade';
import { AuthRepository } from './app/domain/auth/repositories/auth.repository';
import { AuthService } from './app/data/auth/auth.service';
import { CountingRepository } from './app/domain/counting/repositories/counting.repository';
import { CountingStorageService } from './app/data/counting/counting-storage.service';
import { SampleSkuRepository } from './app/domain/event/repositories/sample-sku.repository';
import { MockSampleSkuRepository } from './app/data/event/mock-sample-sku.repository';
import { MIGRATIONS_TOKEN } from './app/core/database/migrations/migration.model';
import { countingMigration } from './app/data/counting/counting-migrations';

const safeInit = (name: string, fn: () => Promise<void>) => async () => {
  try {
    await fn();
  } catch (err) {
    console.error(`[APP_INITIALIZER] ${name} failed:`, err);
  }
};

const initializeAuth = (auth: AuthFacade) => safeInit('AuthFacade', () => auth.init());
const initializeTheme = (theme: ThemeFacade) => safeInit('ThemeFacade', () => theme.init());
const initializeCounting = (counting: CountingFacade) => safeInit('CountingFacade', () => counting.init());

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(),
    { provide: AuthRepository, useClass: AuthService },
    { provide: CountingRepository, useClass: CountingStorageService },
    { provide: SampleSkuRepository, useClass: MockSampleSkuRepository },
    { provide: MIGRATIONS_TOKEN, useValue: [countingMigration] },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      deps: [AuthFacade],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeTheme,
      deps: [ThemeFacade],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeCounting,
      deps: [CountingFacade],
      multi: true,
    },
  ],
});
