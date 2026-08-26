import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AppComponent } from './app.component';
import { AuthFacade } from './state/auth/auth.facade';
import { SesionTrabajoFacade } from './state/sesion-trabajo/sesion-trabajo.facade';
import { EnviarPendientesFacade } from './state/sincronizacion/enviar-pendientes.facade';
import { RespaldoFacade } from './state/respaldo/respaldo.facade';
import { ThemeFacade } from './state/theme/theme.facade';
import { AjustesFacade } from './state/ajustes/ajustes.facade';
import { DATABASE_REPOSITORY_TOKEN } from './domain/database/repositories/database.repository';
import { VigenciaDiaService } from './shared/services/vigencia-dia.service';

describe('AppComponent', () => {
  it('should create the app', async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: AuthFacade, useValue: { session: signal(null), logout: jasmine.createSpy('logout') } },
        {
          provide: RespaldoFacade,
          useValue: {
            generando: signal(false),
            error: signal(null),
            generar: jasmine.createSpy('generar').and.resolveTo(null),
          },
        },
        { provide: SesionTrabajoFacade, useValue: { limpiar: jasmine.createSpy('limpiar').and.resolveTo(undefined) } },
        {
          // El menú ofrece enviar los TAG pendientes; sin este doble el
          // componente no se puede construir.
          provide: EnviarPendientesFacade,
          useValue: {
            enviando: signal(false),
            ultimoResultado: signal(null),
            error: signal(null),
            enviar: jasmine.createSpy('enviar').and.resolveTo({ enviados: 0, fallidos: 0 }),
          },
        },
        { provide: ThemeFacade, useValue: { isDark: signal(false), toggle: jasmine.createSpy('toggle') } },
        {
          provide: AjustesFacade,
          useValue: {
            sincronizacionAutomatica: signal(true),
            toggleSincronizacionAutomatica: jasmine.createSpy('toggleSincronizacionAutomatica'),
          },
        },
        { provide: DATABASE_REPOSITORY_TOKEN, useValue: { initialize: jasmine.createSpy('initialize'), resetLocalDatabase: jasmine.createSpy('resetLocalDatabase') } },
        {
          // El componente arranca la vigilancia de cambio de día al construirse;
          // sin el doble, engancharía el listener real de Capacitor.
          provide: VigenciaDiaService,
          useValue: { iniciar: jasmine.createSpy('iniciar') },
        },
        { provide: 'AlertController', useValue: { create: jasmine.createSpy('create').and.returnValue(Promise.resolve({ present: jasmine.createSpy('present') })) } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
