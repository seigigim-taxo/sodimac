import { TestBed } from '@angular/core/testing';
import { ObtenerReferenciaSincronizadaUseCase } from './obtener-referencia-sincronizada.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';
import { ConteoLecturaSesion } from '../../domain/conteo/models/conteo-lectura-sesion.model';

const ITEM: ConteoItem = {
  id: 1, conteoId: 7, ubicacionId: 2, productoId: 100, sku: 'AF001',
  descripcion: 'Taladro', cantidadFisica: 3, estado: 'SINCRONIZADO',
  iteracion: 1, fechaHora: '2026-08-03 10:00:00', codigoLectura: 'AF001',
};

// Dos capturas del mismo SKU: el agregado (ITEM) las suma en un solo detalle,
// pero la ledger de lecturas trae las dos filas por separado.
const LECTURA_1: ConteoLecturaSesion = {
  lecturaId: 10, detalleId: 1, productoId: 100, sku: 'AF001', descripcion: 'Taladro',
  codigoLectura: 'AF001', medioCaptura: 'ESCANER', cantidad: 2, fechaHora: '2026-08-03 09:58:00',
};
const LECTURA_2: ConteoLecturaSesion = {
  lecturaId: 11, detalleId: 1, productoId: 100, sku: 'AF001', descripcion: 'Taladro',
  codigoLectura: 'AF001', medioCaptura: 'ESCANER', cantidad: 1, fechaHora: '2026-08-03 10:00:00',
};

describe('ObtenerReferenciaSincronizadaUseCase', () => {
  let uc: ObtenerReferenciaSincronizadaUseCase;
  let getBySesion: jasmine.Spy;
  let getLecturasSesion: jasmine.Spy;

  beforeEach(() => {
    getBySesion = jasmine.createSpy('getBySesion').and.resolveTo([ITEM]);
    getLecturasSesion = jasmine.createSpy('getLecturasSesion').and.resolveTo([LECTURA_1, LECTURA_2]);

    TestBed.configureTestingModule({
      providers: [
        ObtenerReferenciaSincronizadaUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: { getBySesion, getLecturasSesion } as unknown as ConteoRepository },
      ],
    });
    uc = TestBed.inject(ObtenerReferenciaSincronizadaUseCase);
  });

  // Apunta a la ubicación VIEJA (sincronizada), no a la nueva que se está contando.
  it('consulta getBySesion y getLecturasSesion con la ubicación sincronizada y el estado SINCRONIZADO', async () => {
    await uc.execute(7, 2, 1, 1);

    expect(getBySesion).toHaveBeenCalledWith(7, 2, 1, 1, 'SINCRONIZADO');
    expect(getLecturasSesion).toHaveBeenCalledWith(7, 2, 1, 1, 'SINCRONIZADO');
  });

  it('devuelve el agregado por SKU y las lecturas por separado, tal como los encuentra el repositorio', async () => {
    expect(await uc.execute(7, 2, 1, 1)).toEqual({ items: [ITEM], lecturas: [LECTURA_1, LECTURA_2] });
  });
});
