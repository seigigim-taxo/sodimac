import { TestBed } from '@angular/core/testing';
import { BuscarCodigoMuestraUseCase } from './buscar-codigo-muestra.use-case';
import {
  MUESTRA_DETALLE_REPOSITORY_TOKEN, MuestraDetalleRepository, CodigoProductoMuestra,
} from '../../domain/muestra/repositories/muestra-detalle.repository';

const fila = (codigoLectura: string, productoId: number, sku: string): CodigoProductoMuestra => ({
  codigoLectura, productoId, descripcion: 'Producto ' + sku, sku, codigoBarras: null,
});

describe('BuscarCodigoMuestraUseCase', () => {
  let useCase: BuscarCodigoMuestraUseCase;
  let repo: jasmine.SpyObj<MuestraDetalleRepository>;
  let enMuestra: CodigoProductoMuestra[];

  beforeEach(() => {
    enMuestra = [fila('AF001', 100, 'AF001'), fila('79567520375', 200, 'TORN-001')];
    repo = jasmine.createSpyObj<MuestraDetalleRepository>('MuestraDetalleRepository', ['buscarCodigos']);
    repo.buscarCodigos.and.callFake((_id: number, codigos: string[]) =>
      Promise.resolve(enMuestra.filter((f) => codigos.includes(f.codigoLectura))));

    TestBed.configureTestingModule({
      providers: [
        BuscarCodigoMuestraUseCase,
        { provide: MUESTRA_DETALLE_REPOSITORY_TOKEN, useValue: repo },
      ],
    });
    useCase = TestBed.inject(BuscarCodigoMuestraUseCase);
  });

  it('resuelve un código exacto de la muestra', async () => {
    const r = await useCase.execute(10, 'AF001');

    expect(r?.codigoResuelto).toBe('AF001');
    expect(r?.info.productoId).toBe(100);
  });

  it('normaliza espacios y minúsculas', async () => {
    const r = await useCase.execute(10, '  af001 ');

    expect(r?.codigoResuelto).toBe('AF001');
  });

  it('devuelve null para un código fuera de la muestra', async () => {
    expect(await useCase.execute(10, 'NO-EXISTE')).toBeNull();
  });

  it('sin muestra (null) nada es válido y no consulta', async () => {
    expect(await useCase.execute(null, 'AF001')).toBeNull();
    expect(repo.buscarCodigos).not.toHaveBeenCalled();
  });

  it('código vacío: null y sin consulta', async () => {
    expect(await useCase.execute(10, '   ')).toBeNull();
    expect(repo.buscarCodigos).not.toHaveBeenCalled();
  });

  describe('cero inicial', () => {
    it('acepta una lectura con 0 inicial cuando la muestra tiene el código sin 0', async () => {
      const r = await useCase.execute(10, '079567520375');

      expect(r?.codigoResuelto).toBe('79567520375');
      expect(r?.info.productoId).toBe(200);
    });

    it('la coincidencia exacta gana sobre la variante sin cero', async () => {
      enMuestra.push(fila('079567520375', 300, 'EXACTO'));

      const r = await useCase.execute(10, '079567520375');

      expect(r?.codigoResuelto).toBe('079567520375');
      expect(r?.info.productoId).toBe(300);
    });

    it('pide las dos variantes en UNA sola consulta', async () => {
      await useCase.execute(10, '079567520375');

      expect(repo.buscarCodigos).toHaveBeenCalledTimes(1);
      expect(repo.buscarCodigos).toHaveBeenCalledWith(10, ['079567520375', '79567520375']);
    });

    it('un código que no empieza en 0 se pide solo, sin variante', async () => {
      await useCase.execute(10, 'AF001');

      expect(repo.buscarCodigos).toHaveBeenCalledWith(10, ['AF001']);
    });
  });
});
