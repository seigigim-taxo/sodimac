import { APP_INITIALIZER } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { RouteReuseStrategy, provideRouter, withPreloading, PreloadAllModules } from '@angular/router';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app/app.routes';
import { AppComponent } from './app/app.component';
import { AuthFacade } from './app/state/auth/auth.facade';
import { ThemeFacade } from './app/state/theme/theme.facade';
import { SqliteDatabaseRepository } from './app/data/database/database.repository';
import { DATABASE_REPOSITORY_TOKEN, DatabaseRepository } from './app/domain/database/repositories/database.repository';
import { AUTH_API_REPOSITORY_TOKEN } from './app/domain/auth/repositories/auth-api.repository';
import { SESSION_STORAGE_REPOSITORY_TOKEN } from './app/domain/auth/repositories/session-storage.repository';
import { THEME_STORAGE_REPOSITORY_TOKEN } from './app/domain/theme/repositories/theme-storage.repository';
import { EVENTO_REPOSITORY_TOKEN } from './app/domain/evento/repositories/evento.repository';
import { MUESTRA_REPOSITORY_TOKEN } from './app/domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from './app/domain/muestra/repositories/muestra-detalle.repository';
import { OPERADOR_REPOSITORY_TOKEN } from './app/domain/auth/repositories/operador.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from './app/domain/store/repositories/sucursal.repository';
import { ZONA_REPOSITORY_TOKEN } from './app/domain/zona/repositories/zona.repository';
import { UBICACION_REPOSITORY_TOKEN } from './app/domain/ubicacion/repositories/ubicacion.repository';
import { DEV_SEEDER_REPOSITORY_TOKEN } from './app/domain/dev/repositories/dev-seeder.repository';
import { CapacitorThemeStorageRepository } from './app/data/theme/theme-storage.repository';
import { SqliteZonaRepository } from './app/data/zona/zona.repository';
import { SqliteUbicacionRepository } from './app/data/ubicacion/ubicacion.repository';
import { SqliteEventoRepository } from './app/data/evento/evento.repository';
import { SqliteMuestraRepository } from './app/data/muestra/muestra.repository';
import { SqliteMuestraDetalleRepository } from './app/data/muestra/muestra-detalle.repository';
import { AuthService } from './app/data/auth/auth.service';
import { CapacitorSessionStorageRepository } from './app/data/auth/session-storage.repository';
import { SqliteOperadorRepository } from './app/data/auth/operador.repository';
import { SqliteSucursalRepository } from './app/data/sucursal/sucursal.repository';
import { SqliteDevSeederRepository } from './app/data/dev/dev-seeder.repository';

// DB must be ready before auth queries SQLite — sequenced in one initializer.
// Theme uses Capacitor Preferences (not SQLite) so it runs in parallel.
const initializeApp   = (db: DatabaseRepository, auth: AuthFacade) => async () => {
  await db.initialize();
  await auth.init();
};
const initializeTheme = (theme: ThemeFacade) => () => theme.init();

bootstrapApplication(AppComponent, {
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideIonicAngular(),
    provideRouter(routes, withPreloading(PreloadAllModules)),
    provideHttpClient(),
    { provide: DATABASE_REPOSITORY_TOKEN, useClass: SqliteDatabaseRepository },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeApp,
      deps: [DATABASE_REPOSITORY_TOKEN, AuthFacade],
      multi: true,
    },
    {
      provide: APP_INITIALIZER,
      useFactory: initializeTheme,
      deps: [ThemeFacade],
      multi: true,
    },
    { provide: AUTH_API_REPOSITORY_TOKEN,          useClass: AuthService },
    { provide: SESSION_STORAGE_REPOSITORY_TOKEN,   useClass: CapacitorSessionStorageRepository },
    { provide: THEME_STORAGE_REPOSITORY_TOKEN,     useClass: CapacitorThemeStorageRepository },
    { provide: OPERADOR_REPOSITORY_TOKEN,          useClass: SqliteOperadorRepository },
    { provide: SUCURSAL_REPOSITORY_TOKEN,          useClass: SqliteSucursalRepository },
    { provide: EVENTO_REPOSITORY_TOKEN,            useClass: SqliteEventoRepository },
    { provide: MUESTRA_REPOSITORY_TOKEN,           useClass: SqliteMuestraRepository },
    { provide: MUESTRA_DETALLE_REPOSITORY_TOKEN,   useClass: SqliteMuestraDetalleRepository },
    { provide: ZONA_REPOSITORY_TOKEN,              useClass: SqliteZonaRepository },
    { provide: UBICACION_REPOSITORY_TOKEN,         useClass: SqliteUbicacionRepository },
    { provide: DEV_SEEDER_REPOSITORY_TOKEN,        useClass: SqliteDevSeederRepository },
  ],
});
