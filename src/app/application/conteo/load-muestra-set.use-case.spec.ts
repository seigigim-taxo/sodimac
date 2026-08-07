import { TestBed } from '@angular/core/testing';
import { LoadMuestraSetUseCase } from './load-muestra-set.use-case';
import { MUESTRA_REPOSITORY_TOKEN, MuestraRepository } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN, MuestraDetalleRepository } from '../../domain/muestra/repositories/muestra-detalle.repository';


describe('LoadMuestraSetUseCase', () => {
  let useCase: LoadMuestraSetUseCase;
  let muestraRepo: jasmine.SpyObj<MuestraRepository>;
  let detalleRepo: jasmine.SpyObj<MuestraDetalleRepository>;

  beforeEach(() => {
    muestraRepo = jasmine.createSpyObj('MuestraRepository', ['getByEventoIteracion']);
    detalleRepo = jasmine.createSpyObj('MuestraDetalleRepository', ['getByMuestra']);

    muestraRepo.getByEventoIteracion.and.resolveTo({ id: 10, codigoMuestra: null, eventoId: 1, sucursalId: 1, iteracion: 1, estado: 'ACTIVA', nombre: null, nombreArchivo: null });
    detalleRepo.getByMuestra.and.resolveTo([
      { id: 1, muestraId: 10, productoId: 100, sku: 'AF001', stockSistema: 5, ubicacionEsperada: null },
      { id: 2, muestraId: 10, productoId: 200, sku: 'af002', stockSistema: 8, ubicacionEsperada: null },
    ]);

    TestBed.configureTestingModule({
      providers: [
        LoadMuestraSetUseCase,
        { provide: MUESTRA_REPOSITORY_TOKEN, useValue: muestraRepo },
        { provide: MUESTRA_DETALLE_REPOSITORY_TOKEN, useValue: detalleRepo },
      ],
    });
    useCase = TestBed.inject(LoadMuestraSetUseCase);
  });

  it('carga la muestra del evento para la iteración dada', async () => {
    await useCase.execute(1, 1);

    expect(muestraRepo.getByEventoIteracion).toHaveBeenCalledWith(1, 1);
  });

  it('indexa los SKUs en mayúsculas para que el scan no falle por caja', async () => {
    const { skuMap } = await useCase.execute(1, 1);

    expect(skuMap.get('AF001')).toBe(100);
    expect(skuMap.get('AF002')).toBe(200);
  });

  it('devuelve un set vacío si la ronda no tiene muestra', async () => {
    muestraRepo.getByEventoIteracion.and.resolveTo(null);

    const { skuMap } = await useCase.execute(1, 1);

    expect(skuMap.size).toBe(0);
    expect(detalleRepo.getByMuestra).not.toHaveBeenCalled();
  });
});
