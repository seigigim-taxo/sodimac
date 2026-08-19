import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let originalFetch: typeof window.fetch;
  let fetchMock: jasmine.Spy;

  beforeEach(() => {
    originalFetch = window.fetch;
    fetchMock = jasmine.createSpy('fetch').and.returnValue(
      Promise.resolve({
        json: () => Promise.resolve({}),
      } as Response)
    );
    window.fetch = fetchMock;

    TestBed.configureTestingModule({
      providers: [AuthService],
    });

    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  it('should login successfully and map API fields', async () => {
    const request = { rut: '12345678-5', password: '123456' };
    const mockResponse = {
      status: 'OK',
      msg: 'Login exitoso',
      data: {
        user: {
          rut: '12.345.678-5',
          rut_normalizado: '123456785',
          correo: 'juan.perez@ejemplo.cl',
        },
      },
    };

    fetchMock.and.returnValue(
      Promise.resolve({
        json: () => Promise.resolve(mockResponse),
      } as Response)
    );

    const response = await service.login(request);

    expect(fetchMock).toHaveBeenCalledWith(
      jasmine.stringContaining('/auth/login.php'),
      jasmine.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })
    );
    expect(response.user.rut).toBe('12.345.678-5');
    expect(response.user.rutNormalizado).toBe('123456785');
    expect(response.user.correo).toBe('juan.perez@ejemplo.cl');
  });

  it('should throw on failed login', async () => {
    const request = { rut: '12345678-5', password: 'wrong' };
    const mockResponse = {
      status: 'ERROR',
      msg: 'Contraseña incorrecta',
    };

    fetchMock.and.returnValue(
      Promise.resolve({
        json: () => Promise.resolve(mockResponse),
      } as Response)
    );

    await expectAsync(service.login(request)).toBeRejectedWithError('Contraseña incorrecta');
  });
});
