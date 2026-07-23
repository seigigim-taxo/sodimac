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

  it('should login successfully and map API fields', (done) => {
    const request = { rut: '12345678-5', password: '123456' };
    const mockResponse = {
      status: 'OK',
      msg: 'Login exitoso',
      data: {
        token: 'abc123',
        user: {
          operador_id: 1,
          nombre_completo: 'Juan Perez',
          rut: '12345678-5',
          rut_normalizado: '123456785',
          rol: 'Operador de Inventario',
          correo: 'juan.perez@ejemplo.cl',
        },
      },
    };

    service.login(request).subscribe((response) => {
      expect(response.token).toBe('abc123');
      expect(response.user.nombreCompleto).toBe('Juan Perez');
      expect(response.user.rut).toBe('12345678-5');
      expect(response.user.rutNormalizado).toBe('123456785');
      expect(response.user.cargo).toBe('Operador de Inventario');
      expect(response.user.correo).toBe('juan.perez@ejemplo.cl');
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login.php`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush(mockResponse);
  });

  it('should throw on failed login', (done) => {
    const request = { rut: '12345678-5', password: 'wrong' };
    const mockResponse = {
      status: 'ERROR',
      msg: 'Contraseña incorrecta',
    };

    service.login(request).subscribe({
      next: () => fail('Expected an error'),
      error: (err: Error) => {
        expect(err.message).toBe('Contraseña incorrecta');
        done();
      },
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login.php`);
    req.flush(mockResponse);
  });
});
