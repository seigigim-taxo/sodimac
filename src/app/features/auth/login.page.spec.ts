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

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let authFacade: jasmine.SpyObj<AuthFacade>;
  let router: jasmine.SpyObj<Router>;
  let sesionTrabajo: jasmine.SpyObj<SesionTrabajoFacade>;

  beforeEach(async () => {
    const authSpy = jasmine.createSpyObj(
      'AuthFacade',
      ['login', 'logout', 'isAuthenticated', 'wasOfflineLogin', 'session'],
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

  it('should format RUT while typing', () => {
    const input = document.createElement('input');
    input.value = '123456789';
    component.onRutInput({ target: input } as unknown as Event);
    expect(component.form.value.rut).toBe('12345678-9');
  });

  it('should call auth.login and navigate on submit', async () => {
    component.form.setValue({ rut: '12345678-5', password: '123456' });
    authFacade.login.and.resolveTo();
    authFacade.isAuthenticated.and.returnValue(true);

    await component.onSubmit();

    expect(authFacade.login).toHaveBeenCalledWith({ rut: '123456785', password: '123456' });
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
