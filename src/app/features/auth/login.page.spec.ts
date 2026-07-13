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
import { AuthFacade } from '../../core/auth/services/auth.facade';

describe('LoginPage', () => {
  let component: LoginPage;
  let fixture: ComponentFixture<LoginPage>;
  let authFacade: jasmine.SpyObj<AuthFacade>;
  let router: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    const authSpy = jasmine.createSpyObj(
      'AuthFacade',
      ['login', 'logout', 'isAuthenticated'],
      {
        loading: () => false,
        error: () => null,
      }
    );
    authSpy.isAuthenticated.and.returnValue(false);

    const routerSpy = jasmine.createSpyObj('Router', ['navigate']);

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
    expect(router.navigate).toHaveBeenCalledWith(['/sucursales']);
  });
});
