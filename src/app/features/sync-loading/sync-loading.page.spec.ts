import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { SyncLoadingPageComponent } from './sync-loading.page';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SincronizarDatosInicialesUseCase } from '../../application/sincronizacion/sincronizar-datos-iniciales.use-case';
import { AnalystDashboardFacade } from '../../state/analyst/analyst-dashboard.facade';
import { signal } from '@angular/core';

/*
 * Qué pasa cuando el servidor devuelve un perfil que la app no sabe atender.
 *
 * Antes de esta validación no fallaba: se colgaba. La sincronización terminaba
 * bien, la barra llegaba a 100 y ahí operatorGuard mandaba al dashboard,
 * analystGuard mandaba de vuelta a home y Angular cancelaba la navegación. El
 * operador quedaba mirando una barra congelada, sin error y sin salida.
 *
 * Se disparó con un usuario ADMINISTRADOR real al que el SGO le entregó una
 * muestra de conteo.
 */

const SESSION = { operadorId: 1, rutNormalizado: '99800120K', correo: 'demo.admin.sodimac@sodimac.cl' };

function usuario(tipoUsuario: string) {
  return { usuario: { tipoUsuario, nombreCompleto: 'Quien Sea' }, analista: null };
}

describe('SyncLoadingPageComponent — perfil no habilitado', () => {
  let componente: SyncLoadingPageComponent;
  let execute: jasmine.Spy;
  let actualizarPerfilSesion: jasmine.Spy;
  let navigate: jasmine.Spy;

  function crear(tipoUsuario: string) {
    execute = jasmine.createSpy('execute').and.resolveTo(usuario(tipoUsuario));
    actualizarPerfilSesion = jasmine.createSpy('actualizarPerfilSesion').and.resolveTo(undefined);

    TestBed.configureTestingModule({
      imports: [SyncLoadingPageComponent],
      providers: [
        provideRouter([]),
        { provide: SincronizarDatosInicialesUseCase, useValue: { execute } },
        {
          provide: AuthFacade,
          useValue: {
            session: signal(SESSION),
            actualizarPerfilSesion,
            logout: jasmine.createSpy('logout').and.resolveTo(undefined),
          },
        },
        { provide: AnalystDashboardFacade, useValue: { cargarDatos: jasmine.createSpy('cargarDatos') } },
      ],
    });

    componente = TestBed.createComponent(SyncLoadingPageComponent).componentInstance;
    navigate = spyOn(TestBed.inject(Router), 'navigate');
    return componente;
  }

  describe('un perfil que la app no conoce', () => {
    beforeEach(async () => {
      crear('ADMINISTRADOR');
      await componente.ngOnInit();
      await new Promise((r) => setTimeout(r, 0));
    });

    it('lo informa en pantalla en vez de quedarse cargando', () => {
      expect(componente.perfilNoHabilitado()).toBe('ADMINISTRADOR');
    });

    /*
     * Lo que evita el cuelgue: si se navegara, los guards se rebotarían entre
     * home y dashboard y la pantalla quedaría congelada en 100.
     */
    it('no navega a ninguna parte', () => {
      expect(navigate).not.toHaveBeenCalled();
    });

    /*
     * Tampoco se persiste el perfil: guardarlo dejaría hasKnownProfile en true
     * y el rebote entre guards volvería a armarse en la próxima navegación.
     */
    it('no guarda el perfil en la sesión', () => {
      expect(actualizarPerfilSesion).not.toHaveBeenCalled();
    });

    it('no lo presenta como un error de descarga', () => {
      expect(componente.error()).toBeNull();
    });
  });

  // Un tipo_usuario ausente llega como cadena vacía desde el parser.
  it('un perfil vacío también bloquea, con un texto legible', async () => {
    crear('');
    await componente.ngOnInit();
    await new Promise((r) => setTimeout(r, 0));

    expect(componente.perfilNoHabilitado()).toBe('sin perfil');
  });

  describe('los perfiles habilitados siguen pasando', () => {
    it('OPERADOR entra normalmente', async () => {
      crear('OPERADOR');
      await componente.ngOnInit();
      await new Promise((r) => setTimeout(r, 0));

      expect(componente.perfilNoHabilitado()).toBeNull();
      expect(actualizarPerfilSesion).toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/home']);
    });

    it('ANALISTA_CLIENTE va a su dashboard', async () => {
      crear('ANALISTA_CLIENTE');
      await componente.ngOnInit();
      await new Promise((r) => setTimeout(r, 0));

      expect(componente.perfilNoHabilitado()).toBeNull();
      expect(navigate).toHaveBeenCalledWith(['/analyst-dashboard']);
    });
  });
});
