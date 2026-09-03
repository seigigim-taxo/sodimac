import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonSpinner,
} from '@ionic/angular/standalone';
import { LoginPage } from './login.page';
import { AuthFacade } from '../../state/auth/auth.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { SesionTrabajoFacade } from '../../state/sesion-trabajo/sesion-trabajo.facade';
import { VigenciaDiaService } from '../../shared/services/vigencia-dia.service';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let authFacade: jasmine.SpyObj<AuthFacade>;
  let router: jasmine.SpyObj<Router>;
  let sesionTrabajo: jasmine.SpyObj<SesionTrabajoFacade>;
  let vigencia: jasmine.SpyObj<VigenciaDiaService>;

  beforeEach(async () => {
    const authSpy = jasmine.createSpyObj(
      'AuthFacade',
      ['login', 'logout', 'isAuthenticated', 'wasOfflineLogin', 'session',
       'hasKnownProfile', 'isAnalyst'],
      {
        loading: () => false,
        error: () => null,
      }
    );
    authSpy.isAuthenticated.and.returnValue(false);
    authSpy.wasOfflineLogin.and.returnValue(false);
    authSpy.session.and.returnValue({ operadorId: 7, rutNormalizado: '123456785', correo: 'op@sodimac.cl' });

    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

    /*
     * PdaFacade y SesionTrabajoFacade se stubean para no arrastrar SQLite ni
     * Capacitor al spec: acá se prueba el formulario y la navegación, no la
     * restauración de la sesión de trabajo.
     */
    const pdaSpy = jasmine.createSpyObj('PdaFacade', ['init', 'pdaId']);
    pdaSpy.pdaId.and.returnValue(1);
    sesionTrabajo = jasmine.createSpyObj('SesionTrabajoFacade', ['restaurar']);
    sesionTrabajo.restaurar.and.resolveTo();

    vigencia = jasmine.createSpyObj<VigenciaDiaService>('VigenciaDiaService', ['necesitaSincronizar', 'iniciar']);
    vigencia.necesitaSincronizar.and.resolveTo(false);

    await TestBed.configureTestingModule({
      imports: [
        ReactiveFormsModule,
        LoginPage,
        IonButton,
        IonContent,
        IonIcon,
        IonInput,
        IonSpinner,
      ],
    })
      .overrideProvider(AuthFacade, { useValue: authSpy })
      .overrideProvider(Router, { useValue: routerSpy })
      .overrideProvider(PdaFacade, { useValue: pdaSpy })
      .overrideProvider(SesionTrabajoFacade, { useValue: sesionTrabajo })
      /*
       * Por defecto los datos son del día: así estas pruebas siguen midiendo el
       * ruteo por perfil. El caso "los datos son de ayer" tiene su propio test.
       */
      .overrideProvider(VigenciaDiaService, { useValue: vigencia })
      .compileComponents();

    fixture = TestBed.createComponent(LoginPage);
    component = fixture.componentInstance;
    authFacade = TestBed.inject(AuthFacade) as jasmine.SpyObj<AuthFacade>;
    router = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should require RUT and password', () => {
    component.onSubmit();
    expect(component.form.invalid).toBeTrue();
    expect(component.rutControl?.touched).toBeTrue();
    expect(component.passwordControl?.touched).toBeTrue();
  });

  /*
   * La contraseña son los primeros 6 dígitos del RUT: ni menos ni más. El
   * maxlength del input frena la escritura letra por letra, pero eso no se
   * puede probar acá —es DOM real, no el FormControl—; lo que sí se prueba es
   * que el formulario en sí, si llegara un valor más largo (pegado, o puesto
   * a mano), lo rechaza igual.
   */
  it('should reject a password longer than 6 characters', () => {
    component.form.setValue({ rut: '12345678-5', password: '1234567' });

    expect(component.passwordControl?.hasError('maxlength')).toBeTrue();
    expect(component.form.invalid).toBeTrue();
  });

  it('should format RUT while typing', () => {
    const input = document.createElement('input');
    input.value = '123456789';
    component.onRutInput({ target: input } as unknown as Event);
    expect(component.form.value.rut).toBe('12345678-9');
  });

  it('should call auth.login and navigate to sync-loading when user is new', async () => {
    component.form.setValue({ rut: '12345678-5', password: '123456' });
    authFacade.login.and.resolveTo();
    authFacade.isAuthenticated.and.returnValue(true);
    authFacade.wasOfflineLogin.and.returnValue(false);

    await component.onSubmit();

    expect(authFacade.login).toHaveBeenCalledWith({ rut: '123456785', password: '123456' });
    expect(router.navigate).toHaveBeenCalledWith(['/sync-loading']);
  });

  it('should navigate to home when user is cached and has operator profile', async () => {
    component.form.setValue({ rut: '12345678-5', password: '123456' });
    authFacade.login.and.resolveTo();
    authFacade.isAuthenticated.and.returnValue(true);
    authFacade.wasOfflineLogin.and.returnValue(true);
    authFacade.hasKnownProfile.and.returnValue(true);
    authFacade.isAnalyst.and.returnValue(false);

    await component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/home']);
  });

  /*
   * El problema que originó esto: la app consultaba SQLite, veía que el
   * operador existía y lo dejaba entrar sin preguntar si los datos seguían
   * siendo del día. Se quedaba trabajando sobre el evento de ayer, y llegó a
   * enviarse un conteo contra la agenda del día anterior.
   */
  it('manda a sincronizar aunque el perfil sea conocido, si los datos no son de hoy', async () => {
    component.form.setValue({ rut: '12345678-5', password: '123456' });
    authFacade.login.and.resolveTo();
    authFacade.isAuthenticated.and.returnValue(true);
    authFacade.wasOfflineLogin.and.returnValue(true);
    authFacade.hasKnownProfile.and.returnValue(true);
    authFacade.isAnalyst.and.returnValue(false);
    vigencia.necesitaSincronizar.and.resolveTo(true);

    await component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/sync-loading']);
    expect(router.navigate).not.toHaveBeenCalledWith(['/home']);
  });

  // El login online ya baja datos siempre: no hace falta preguntar nada.
  it('el login online no consulta la vigencia', async () => {
    component.form.setValue({ rut: '12345678-5', password: '123456' });
    authFacade.login.and.resolveTo();
    authFacade.isAuthenticated.and.returnValue(true);
    authFacade.wasOfflineLogin.and.returnValue(false);

    await component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/sync-loading']);
    expect(vigencia.necesitaSincronizar).not.toHaveBeenCalled();
  });

  it('should navigate to analyst-dashboard when user is cached and has analyst profile', async () => {
    component.form.setValue({ rut: '12345678-5', password: '123456' });
    authFacade.login.and.resolveTo();
    authFacade.isAuthenticated.and.returnValue(true);
    authFacade.wasOfflineLogin.and.returnValue(true);
    authFacade.hasKnownProfile.and.returnValue(true);
    authFacade.isAnalyst.and.returnValue(true);

    await component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/analyst-dashboard']);
  });

  it('should navigate to sync-loading when user is cached but has no profile', async () => {
    component.form.setValue({ rut: '12345678-5', password: '123456' });
    authFacade.login.and.resolveTo();
    authFacade.isAuthenticated.and.returnValue(true);
    authFacade.wasOfflineLogin.and.returnValue(true);
    authFacade.hasKnownProfile.and.returnValue(false);

    await component.onSubmit();

    expect(router.navigate).toHaveBeenCalledWith(['/sync-loading']);
  });

  /*
   * El orden importa: si se navega antes de restaurar, los guards de /home
   * evalúan con el evento y el TAG todavía vacíos y rebotan entre pantallas.
   */
  it('restaura la sesión de trabajo antes de navegar', async () => {
    component.form.setValue({ rut: '12345678-5', password: '123456' });
    authFacade.login.and.resolveTo();
    authFacade.isAuthenticated.and.returnValue(true);
    let navegoAntesDeRestaurar = false;
    router.navigate.and.callFake(() => {
      navegoAntesDeRestaurar = !sesionTrabajo.restaurar.calls.any();
      return Promise.resolve(true);
    });

    await component.onSubmit();

    expect(sesionTrabajo.restaurar).toHaveBeenCalledWith(7, 1);
    expect(navegoAntesDeRestaurar).toBeFalse();
  });
});
