import { TestBed } from '@angular/core/testing';
import { UpsertConteoItemUseCase } from './upsert-conteo-item.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';

const ITEM: ConteoItem = {
  id: 1, conteoId: 1, ubicacionId: 1, productoId: 7, sku: 'AF001',
  descripcion: 'Producto', cantidadFisica: 3, estado: 'EN_CURSO',
  iteracion: 1, fechaHora: '2026-08-03 10:00:00', codigoLectura: 'AF001',
};

describe('Casos de uso de item de conteo', () => {
  let repo: jasmine.SpyObj<ConteoRepository>;
  let upsert: UpsertConteoItemUseCase;

  beforeEach(() => {
    repo = jasmine.createSpyObj('ConteoRepository', ['upsert']);
    repo.upsert.and.resolveTo(ITEM);

    TestBed.configureTestingModule({
      providers: [
        UpsertConteoItemUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: repo },
      ],
    });
    upsert = TestBed.inject(UpsertConteoItemUseCase);
  });

  describe('UpsertConteoItemUseCase', () => {
    it('acepta cantidad 0 — declarar que no hay unidades es un dato válido', async () => {
      await upsert.execute(1, 1, 7, 1, 1, 0, 'AF001', 'ESCANER');

      expect(repo.upsert).toHaveBeenCalledWith(1, 1, 7, 1, 1, 0, 'AF001', 'ESCANER');
    });

    it('acepta cantidades positivas', async () => {
      await upsert.execute(1, 1, 7, 1, 1, 5, 'AF001', 'ESCANER');

      expect(repo.upsert).toHaveBeenCalledWith(1, 1, 7, 1, 1, 5, 'AF001', 'ESCANER');
    });

    it('rechaza cantidades negativas', async () => {
      await expectAsync(upsert.execute(1, 1, 7, 1, 1, -1, 'AF001', 'MANUAL')).toBeRejectedWithError(/no puede ser negativa/);
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('rechaza cantidades no numéricas', async () => {
      await expectAsync(upsert.execute(1, 1, 7, 1, 1, NaN, 'AF001', 'MANUAL')).toBeRejectedWithError(/no puede ser negativa/);
      expect(repo.upsert).not.toHaveBeenCalled();
    });
  });
});
