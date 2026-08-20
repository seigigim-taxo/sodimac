import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AppComponent } from './app.component';
import { AuthFacade } from './state/auth/auth.facade';
import { ThemeFacade } from './state/theme/theme.facade';
import { AjustesFacade } from './state/ajustes/ajustes.facade';
import { SesionTrabajoFacade } from './state/sesion-trabajo/sesion-trabajo.facade';
import { RespaldoFacade } from './state/respaldo/respaldo.facade';
import { DATABASE_REPOSITORY_TOKEN } from './domain/database/repositories/database.repository';

describe('AppComponent', () => {
  it('should create the app', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: AuthFacade, useValue: { session: signal(null), logout: jasmine.createSpy('logout') } },
        { provide: ThemeFacade, useValue: { isDark: signal(false), toggle: jasmine.createSpy('toggle') } },
        {
          provide: AjustesFacade,
          useValue: {
            sincronizacionAutomatica: signal(true),
            toggleSincronizacionAutomatica: jasmine.createSpy('toggleSincronizacionAutomatica'),
          },
        },
        {
          // El logout la usa para soltar el estado de trabajo del turno anterior.
          provide: SesionTrabajoFacade,
          useValue: { limpiar: jasmine.createSpy('limpiar').and.resolveTo(undefined) },
        },
        {
          provide: RespaldoFacade,
          useValue: {
            generando: signal(false),
            error: signal(null),
            generar: jasmine.createSpy('generar').and.resolveTo(null),
          },
        },
        { provide: DATABASE_REPOSITORY_TOKEN, useValue: { initialize: jasmine.createSpy('initialize'), resetLocalDatabase: jasmine.createSpy('resetLocalDatabase') } },
        { provide: 'AlertController', useValue: { create: jasmine.createSpy('create').and.returnValue(Promise.resolve({ present: jasmine.createSpy('present') })) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
