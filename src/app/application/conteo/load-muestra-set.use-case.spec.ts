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
    detalleRepo = jasmine.createSpyObj('MuestraDetalleRepository', ['getByMuestra', 'getCodigosByMuestra']);

    muestraRepo.getByEventoIteracion.and.resolveTo({ id: 10, codigoMuestra: null, idAgenda: null, numeroAgenda: null, eventoId: 1, sucursalId: 1, iteracion: 1, estado: 'ACTIVA', nombre: null, nombreArchivo: null });
    detalleRepo.getCodigosByMuestra.and.resolveTo([
      { codigoLectura: 'AF001', productoId: 100 },
      { codigoLectura: '7891234567890', productoId: 200 },
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

  it('indexa los códigos de lectura en mayúsculas para que el scan no falle por caja', async () => {
    const { skuMap } = await useCase.execute(1, 1);

    expect(skuMap.get('AF001')).toBe(100);
    expect(skuMap.get('7891234567890')).toBe(200);
  });

  it('devuelve un set vacío si la ronda no tiene muestra', async () => {
    muestraRepo.getByEventoIteracion.and.resolveTo(null);

    const { skuMap } = await useCase.execute(1, 1);

    expect(skuMap.size).toBe(0);
    expect(detalleRepo.getCodigosByMuestra).not.toHaveBeenCalled();
  });
});
