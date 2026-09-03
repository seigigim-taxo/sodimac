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
import { ActualizacionFacade } from './state/actualizacion/actualizacion.facade';
import { ActualizarMuestraService } from './shared/services/actualizar-muestra.service';

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
        {
          // El menú ofrece actualizar la app. El doble va sobre el facade y no
          // sobre OfertaActualizacionService: el servicio es real y lo que se
          // corta es su acceso al mundo (red e instalador de Android).
          provide: ActualizacionFacade,
          useValue: {
            buscando: signal(false),
            descargando: signal(false),
            porcentaje: signal(null),
            error: signal(null),
            disponible: signal(null),
            buscar: jasmine.createSpy('buscar').and.resolveTo(false),
            hayActualizacion: signal(false),
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
        {
          // El menú ofrece actualizar la muestra. Se dobla el servicio entero
          // —no sus dependencias internas (EventoFacade, ConteoFacade, etc.)—
          // porque este test es un smoke test de construcción, no de esa
          // lógica: eso ya está probado en actualizar-muestra.service.spec.ts.
          provide: ActualizarMuestraService,
          useValue: {
            actualizando: signal(false),
            actualizar: jasmine.createSpy('actualizar').and.resolveTo(undefined),
          },
        },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });
});
