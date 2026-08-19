import { APP_INITIALIZER } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { AuthFacade } from './app/state/auth/auth.facade';
import { ThemeFacade } from './app/state/theme/theme.facade';
<<<<<<< HEAD
import { CountingFacade } from './app/state/counting/counting.facade';
import { AuthRepository } from './app/domain/auth/repositories/auth.repository';
import { MockAuthService } from './app/data/auth/mock-auth.service';
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
=======
import { PdaFacade } from './app/state/pda/pda.facade';
import { SqliteDatabaseRepository } from './app/data/database/database.repository';
import { DATABASE_REPOSITORY_TOKEN, DatabaseRepository } from './app/domain/database/repositories/database.repository';
import { AUTH_API_REPOSITORY_TOKEN } from './app/domain/auth/repositories/auth-api.repository';
import { SESSION_STORAGE_REPOSITORY_TOKEN } from './app/domain/auth/repositories/session-storage.repository';
import { THEME_STORAGE_REPOSITORY_TOKEN } from './app/domain/theme/repositories/theme-storage.repository';
import { PDA_REPOSITORY_TOKEN } from './app/domain/pda/repositories/pda.repository';
import { EVENTO_REPOSITORY_TOKEN } from './app/domain/evento/repositories/evento.repository';
import { MUESTRA_REPOSITORY_TOKEN } from './app/domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from './app/domain/muestra/repositories/muestra-detalle.repository';
import { PLAN_MUESTRA_REPOSITORY_TOKEN } from './app/domain/muestra/repositories/plan-muestra.repository';
import { OPERADOR_REPOSITORY_TOKEN } from './app/domain/auth/repositories/operador.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from './app/domain/sucursal/repositories/sucursal.repository';
import { ZONA_REPOSITORY_TOKEN } from './app/domain/zona/repositories/zona.repository';
import { UBICACION_REPOSITORY_TOKEN } from './app/domain/ubicacion/repositories/ubicacion.repository';
import { CONTEO_REPOSITORY_TOKEN } from './app/domain/conteo/repositories/conteo.repository';
import { SINCRONIZACION_REPOSITORY_TOKEN } from './app/domain/sincronizacion/repositories/sincronizacion.repository';
import { PREPARACION_API_REPOSITORY_TOKEN } from './app/domain/sincronizacion/repositories/preparacion-api.repository';
import { PreparacionApiService } from './app/data/sincronizacion/preparacion-api.service';
import { CapacitorThemeStorageRepository } from './app/data/theme/theme-storage.repository';
import { CapacitorPdaRepository } from './app/data/pda/pda.repository';
import { SqliteConteoRepository } from './app/data/conteo/conteo.repository';
import { SqliteSincronizacionRepository } from './app/data/sincronizacion/sincronizacion.repository';
import { SqliteZonaRepository } from './app/data/zona/zona.repository';
import { SqliteUbicacionRepository } from './app/data/ubicacion/ubicacion.repository';
import { SqliteEventoRepository } from './app/data/evento/evento.repository';
import { SqliteMuestraRepository } from './app/data/muestra/muestra.repository';
import { SqliteMuestraDetalleRepository } from './app/data/muestra/muestra-detalle.repository';
import { SqlitePlanMuestraRepository } from './app/data/muestra/sqlite-plan-muestra.repository';
import { AuthService } from './app/data/auth/auth.service';
import { CapacitorSessionStorageRepository } from './app/data/auth/session-storage.repository';
import { SqliteOperadorRepository } from './app/data/auth/operador.repository';
import { SqliteSucursalRepository } from './app/data/sucursal/sucursal.repository';

/*
 * DB must complete before Auth or PDA query SQLite.
 * Theme uses Capacitor Preferences (not SQLite) — runs in parallel.
 *
 * El try/catch es deliberado: un APP_INITIALIZER que rechaza aborta el bootstrap
 * y deja la pantalla EN BLANCO, sin ninguna pista de qué falló. Prefiere arrancar
 * y que el error se vea al intentar usar la app (login, conteo), que es donde el
 * operador puede reportarlo. El detalle queda en consola con este tag.
 */
const initializeApp = (
  db:   DatabaseRepository,
  auth: AuthFacade,
  pda:  PdaFacade,
) => async () => {
  try {
    await db.initialize();
    await Promise.all([auth.init(), pda.init()]);
  } catch (err) {
    console.error('[initializeApp] fallo al inicializar la app:', err);
  }
};

const initializeTheme = (theme: ThemeFacade) => () => theme.init();
>>>>>>> feat/modo-analista-maqueta

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(),
<<<<<<< HEAD
    { provide: AuthRepository, useClass: MockAuthService },
    { provide: CountingRepository, useClass: CountingStorageService },
    { provide: SampleSkuRepository, useClass: MockSampleSkuRepository },
    { provide: MIGRATIONS_TOKEN, useValue: [countingMigration] },
=======
    { provide: DATABASE_REPOSITORY_TOKEN, useClass: SqliteDatabaseRepository },
    { provide: PDA_REPOSITORY_TOKEN,      useClass: CapacitorPdaRepository },
>>>>>>> feat/modo-analista-maqueta
    {
      provide:    APP_INITIALIZER,
      useFactory: initializeApp,
      deps:       [DATABASE_REPOSITORY_TOKEN, AuthFacade, PdaFacade],
      multi:      true,
    },
    {
      provide:    APP_INITIALIZER,
      useFactory: initializeTheme,
      deps:       [ThemeFacade],
      multi:      true,
    },
<<<<<<< HEAD
    {
      provide: APP_INITIALIZER,
      useFactory: initializeCounting,
      deps: [CountingFacade],
      multi: true,
    },
=======
    { provide: AUTH_API_REPOSITORY_TOKEN,        useClass: AuthService },
    { provide: SESSION_STORAGE_REPOSITORY_TOKEN, useClass: CapacitorSessionStorageRepository },
    { provide: THEME_STORAGE_REPOSITORY_TOKEN,   useClass: CapacitorThemeStorageRepository },
    { provide: OPERADOR_REPOSITORY_TOKEN,        useClass: SqliteOperadorRepository },
    { provide: SUCURSAL_REPOSITORY_TOKEN,        useClass: SqliteSucursalRepository },
    { provide: EVENTO_REPOSITORY_TOKEN,          useClass: SqliteEventoRepository },
    { provide: MUESTRA_REPOSITORY_TOKEN,         useClass: SqliteMuestraRepository },
    { provide: MUESTRA_DETALLE_REPOSITORY_TOKEN, useClass: SqliteMuestraDetalleRepository },

    // Muestra de reconteo: genera muestra acotada a partir de SKUs contados en iteración anterior.
    { provide: PLAN_MUESTRA_REPOSITORY_TOKEN,     useClass: SqlitePlanMuestraRepository },
    { provide: ZONA_REPOSITORY_TOKEN,            useClass: SqliteZonaRepository },
    { provide: UBICACION_REPOSITORY_TOKEN,       useClass: SqliteUbicacionRepository },
    { provide: CONTEO_REPOSITORY_TOKEN,          useClass: SqliteConteoRepository },
    { provide: SINCRONIZACION_REPOSITORY_TOKEN,  useClass: SqliteSincronizacionRepository },
    { provide: PREPARACION_API_REPOSITORY_TOKEN, useClass: PreparacionApiService },
>>>>>>> feat/modo-analista-maqueta
  ],
});
