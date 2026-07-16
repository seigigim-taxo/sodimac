import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { EventService } from './event.service';
import { environment } from '../../../environments/environment';

describe('EventService', () => {
  let service: EventService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EventService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(EventService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should load events by store', (done) => {
    const mockResponse = {
      status: 'OK',
      msg: 'OK',
      data: [
        {
          id: 1,
          folio: 'DEMO-SGO-20260716-001',
          fecha_programada: '2026-07-16',
          fecha_ejecucion: null,
          categoria: 'GENERAL',
          estado: 'ABIERTO',
          codigo_sodimac: '4011',
          sucursal: 'Sodimac La Florida',
          coord_nombres: 'Ana',
          coord_apellidos: 'Rojas',
          analista_nombres: 'Luis',
          analista_apellidos: 'Soto',
        },
      ],
    };

    service.getEventsByStore(1).subscribe((events) => {
      expect(events.length).toBe(1);
      expect(events[0]).toEqual({
        id: 1,
        folio: 'DEMO-SGO-20260716-001',
        scheduledDate: '2026-07-16',
        executionDate: null,
        category: 'GENERAL',
        status: 'ABIERTO',
        storeCode: '4011',
        storeName: 'Sodimac La Florida',
        coordinatorName: 'Ana Rojas',
        analystName: 'Luis Soto',
      });
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/eventos/index.php?sucursal_id=1`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
