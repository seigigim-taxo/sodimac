import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { StoreService } from './store.service';
import { environment } from '../../../environments/environment';

describe('StoreService', () => {
  let service: StoreService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [StoreService, provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(StoreService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should load stores by user', (done) => {
    const mockResponse = {
      status: 'OK',
      msg: 'OK',
      data: [
        {
          id: 1,
          codigo_sodimac: '4011',
          nombre: 'Sodimac La Florida',
          tipo: 'HIPER',
          zona_operativa: 'STGO',
          direccion: 'Av. La Florida 1234',
          comuna: 'La Florida',
          region: 'RM',
        },
      ],
    };

    service.getStoresByUser(1).subscribe((stores) => {
      expect(stores.length).toBe(1);
      expect(stores[0]).toEqual({
        id: 1,
        code: '4011',
        name: 'Sodimac La Florida',
        type: 'HIPER',
        zone: 'STGO',
        address: 'Av. La Florida 1234',
        city: 'La Florida',
        region: 'RM',
      });
      done();
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/sucursales/index.php?user_id=1`);
    expect(req.request.method).toBe('GET');
    req.flush(mockResponse);
  });
});
