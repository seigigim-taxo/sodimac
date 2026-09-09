import { TestBed } from '@angular/core/testing';
import { ObtenerReferenciaSincronizadaUseCase } from './obtener-referencia-sincronizada.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';

const ITEM: ConteoItem = {
  id: 1, conteoId: 7, ubicacionId: 2, productoId: 100, sku: 'AF001',
  descripcion: 'Taladro', cantidadFisica: 3, estado: 'SINCRONIZADO',
  iteracion: 1, fechaHora: '2026-08-03 10:00:00', codigoLectura: 'AF001',
};

describe('ObtenerReferenciaSincronizadaUseCase', () => {
  let uc: ObtenerReferenciaSincronizadaUseCase;
  let getBySesion: jasmine.Spy;

  beforeEach(() => {
    getBySesion = jasmine.createSpy('getBySesion').and.resolveTo([ITEM]);

    TestBed.configureTestingModule({
      providers: [
        ObtenerReferenciaSincronizadaUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: { getBySesion } as unknown as ConteoRepository },
      ],
    });
    uc = TestBed.inject(ObtenerReferenciaSincronizadaUseCase);
  });

  // Apunta a la ubicación VIEJA (sincronizada), no a la nueva que se está contando.
  it('consulta getBySesion con la ubicación sincronizada y el estado SINCRONIZADO', async () => {
    await uc.execute(7, 2, 1, 1);

    expect(getBySesion).toHaveBeenCalledWith(7, 2, 1, 1, 'SINCRONIZADO');
  });

  it('devuelve lo que encuentra el repositorio', async () => {
    expect(await uc.execute(7, 2, 1, 1)).toEqual([ITEM]);
  });
});
