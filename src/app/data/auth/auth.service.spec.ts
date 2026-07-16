import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [AuthService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should login successfully', (done) => {
    const request = { rut: '12345678-5', password: '123456' };
    const mockResponse = {
      status: 'OK',
      msg: 'Login exitoso',
      data: {
        token: 'abc123',
        user: {
          id: 1,
          name: 'Juan Perez',
          rut: '12345678-5',
          rol: 'Operador de Inventario',
          correo: 'juan.perez@ejemplo.cl',
        },
      },
    };

    service.login(request).subscribe((response) => {
      expect(response.success).toBeTrue();
      expect(response.token).toBe('abc123');
      expect(response.user).toEqual({ id: 1, name: 'Juan Perez', rut: '12345678-5' });
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login.php`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(mockResponse);
  });

  it('should return error on failed login', (done) => {
    const request = { rut: '12345678-5', password: 'wrong' };
    const mockResponse = {
      status: 'ERROR',
      msg: 'Contraseña incorrecta',
    };

    service.login(request).subscribe((response) => {
      expect(response.success).toBeFalse();
      expect(response.error).toBe('Contraseña incorrecta');
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login.php`);
    req.flush(mockResponse);
  });
});
