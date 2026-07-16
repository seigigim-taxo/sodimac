import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ZoneService } from './zone.service';
import { environment } from '../../../environments/environment';

describe('ZoneService', () => {
  let service: ZoneService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [ZoneService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(ZoneService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should load zones by event and operator', (done) => {
    const mockResponse = {
      status: 'OK',
      msg: 'OK',
      data: [
        {
          id: 1,
          zona_id: 1,
          codigo: 'Z-Venta',
          zona_nombre: 'Venta',
          tipo: 'VENTA',
          tipo_descripcion: 'Zona de piso de venta',
        },
      ],
    };

    service.getZonesByEventAndOperator(1, 1).subscribe((zones) => {
      expect(zones.length).toBe(1);
      expect(zones[0]).toEqual({
        id: 1,
        zoneId: 1,
        code: 'Z-Venta',
        name: 'Venta',
        type: 'VENTA',
        typeDescription: 'Zona de piso de venta',
      });
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/asignaciones-zona/index.php?evento_id=1&operador_id=1`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
