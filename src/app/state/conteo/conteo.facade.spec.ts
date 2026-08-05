import { TestBed } from '@angular/core/testing';
import { ConteoFacade } from './conteo.facade';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { MUESTRA_REPOSITORY_TOKEN, MuestraRepository } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN, MuestraDetalleRepository } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { ConteoItem } from '../../domain/conteo/models/conteo-item.model';

/*
 * Se prueba el facade con los casos de uso reales conectados: lo único falso
 * son los repositorios (SQLite). Así se cubre la cadena completa scan → muestra
 * → persistencia, que es donde vivían los bugs de cantidad 0.
 */
function item(parcial: Partial<ConteoItem> = {}): ConteoItem {
  return {
    id: 1, conteoId: 7, ubicacionId: 1, productoId: 100, sku: 'AF001',
    descripcion: 'Taladro', cantidadFisica: 1, estado: 'EN_CURSO',
    iteracion: 1, fechaHora: '2026-08-03 10:00:00', ...parcial,
  };
}

describe('ConteoFacade', () => {
  let facade: ConteoFacade;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;

  beforeEach(async () => {
    conteoRepo = jasmine.createSpyObj('ConteoRepository', [
      'upsert', 'adjust', 'delete', 'getBySesion', 'cerrarTag', 'getRondaAbierta',
    ]);
    conteoRepo.getBySesion.and.resolveTo([]);
    conteoRepo.upsert.and.resolveTo(item());
    conteoRepo.cerrarTag.and.resolveTo();
    // La ronda abierta es lo que ConteoFacade.init() resuelve antes de dejar contar.
    conteoRepo.getRondaAbierta.and.resolveTo({
      id: 7, eventoId: 1, iteracion: 1, estado: 'ABIERTO',
      fechaApertura: '2026-08-05 10:00:00', fechaCierre: null,
    });

    const muestraRepo = jasmine.createSpyObj<MuestraRepository>('MuestraRepository', ['getByEvento']);
    muestraRepo.getByEvento.and.resolveTo({ id: 10, codigoMuestra: null, eventoId: 1, sucursalId: 1, nombre: null, nombreArchivo: null });

    const detalleRepo = jasmine.createSpyObj<MuestraDetalleRepository>('MuestraDetalleRepository', ['getByMuestra']);
    detalleRepo.getByMuestra.and.resolveTo([
      { id: 1, muestraId: 10, productoId: 100, sku: 'AF001', stockSistema: 5, ubicacionEsperada: null },
    ]);

    TestBed.configureTestingModule({
      providers: [
        ConteoFacade,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: conteoRepo },
        { provide: MUESTRA_REPOSITORY_TOKEN, useValue: muestraRepo },
        { provide: MUESTRA_DETALLE_REPOSITORY_TOKEN, useValue: detalleRepo },
      ],
    });
    facade = TestBed.inject(ConteoFacade);
    await facade.init(1, 1, 1, 1);
  });

  it('registra un SKU que está en la muestra', async () => {
    const resultado = await facade.scan('AF001', 2);

    expect(resultado).toBe('valido');
    expect(conteoRepo.upsert).toHaveBeenCalledWith(7, 1, 100, 1, 1, 2);
    expect(facade.items().length).toBe(1);
  });

  it('registra cantidad 0 — es una declaración válida, no un error', async () => {
    conteoRepo.upsert.and.resolveTo(item({ cantidadFisica: 0 }));

    const resultado = await facade.scan('AF001', 0);

    expect(resultado).toBe('valido');
    expect(conteoRepo.upsert).toHaveBeenCalledWith(7, 1, 100, 1, 1, 0);
    expect(facade.items()[0].cantidadFisica).toBe(0);
  });

  it('rechaza un SKU fuera de la muestra sin persistir nada', async () => {
    const resultado = await facade.scan('NO-EXISTE');

    expect(resultado).toBe('rechazado');
    expect(conteoRepo.upsert).not.toHaveBeenCalled();
    expect(facade.rechazados()).toContain('NO-EXISTE');
  });

  it('normaliza el SKU escaneado (espacios y minúsculas)', async () => {
    const resultado = await facade.scan('  af001  ');

    expect(resultado).toBe('valido');
    expect(conteoRepo.upsert).toHaveBeenCalled();
  });

  it('reporta error cuando la escritura falla, sin marcarlo como fuera de muestra', async () => {
    conteoRepo.upsert.and.rejectWith(new Error('DB caída'));

    const resultado = await facade.scan('AF001');

    expect(resultado).toBe('error');
    expect(facade.error()).toBe('DB caída');
  });

  it('cuenta contra la ronda abierta, no contra el evento', async () => {
    await facade.scan('AF001');

    // 7 es el id de la ronda; el evento es 1. Confundirlos compilaba igual.
    expect(conteoRepo.upsert.calls.mostRecent().args[0]).toBe(7);
    expect(facade.sesion()?.conteoId).toBe(7);
  });

  it('no deja contar si el evento no tiene ronda abierta', async () => {
    conteoRepo.getRondaAbierta.and.resolveTo(null);

    await facade.init(1, 1, 1, 1);

    expect(facade.error()).toMatch(/ronda de conteo abierta/);
    expect(facade.sesion()).toBeNull();
  });

  it('no acepta scans después de finalizar la sesión', async () => {
    await facade.finalizar();

    const resultado = await facade.scan('AF001');

    expect(resultado).toBe('rechazado');
    expect(conteoRepo.upsert).not.toHaveBeenCalled();
    expect(facade.enCurso()).toBeFalse();
  });
});
