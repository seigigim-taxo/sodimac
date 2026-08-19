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
function ronda(iteracion: number) {
  return {
    id: 7, eventoId: 1, iteracion,
    estado: 'ABIERTO' as const,
    fechaApertura: '2026-08-05 10:00:00', fechaCierre: null,
  };
}

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
      'upsert', 'adjust', 'delete', 'getBySesion', 'cerrarTag',
      'getRondaAbierta', 'getUltimaRonda', 'abrirRonda',
    ]);
    conteoRepo.getBySesion.and.resolveTo([]);
    conteoRepo.upsert.and.resolveTo(item());
    conteoRepo.cerrarTag.and.resolveTo();
    // La ronda abierta es lo que ConteoFacade.init() resuelve antes de dejar contar.
    conteoRepo.getRondaAbierta.and.resolveTo(ronda(1));
    conteoRepo.getUltimaRonda.and.resolveTo(null);
    conteoRepo.abrirRonda.and.callFake((_e: number, i: number) => Promise.resolve(ronda(i)));

    const muestraRepo = jasmine.createSpyObj<MuestraRepository>('MuestraRepository', ['getByEventoIteracion']);
    muestraRepo.getByEventoIteracion.and.resolveTo({ id: 10, codigoMuestra: null, idAgenda: null, numeroAgenda: null, eventoId: 1, sucursalId: 1, iteracion: 1, estado: 'ACTIVA', nombre: null, nombreArchivo: null });

    const detalleRepo = jasmine.createSpyObj<MuestraDetalleRepository>('MuestraDetalleRepository', ['getByMuestra', 'getCodigosByMuestra']);
    detalleRepo.getByMuestra.and.resolveTo([
      { id: 1, muestraId: 10, productoId: 100, sku: 'AF001', stockSistema: 5, ubicacionEsperada: null },
    ]);
    detalleRepo.getCodigosByMuestra.and.resolveTo([
      { codigoLectura: 'AF001', productoId: 100 },
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

  it('abre la primera ronda si el evento no tiene ninguna', async () => {
    conteoRepo.getRondaAbierta.and.resolveTo(null);
    conteoRepo.getUltimaRonda.and.resolveTo(null);

    await facade.init(1, 1, 1, 1);

    expect(conteoRepo.abrirRonda).toHaveBeenCalledWith(1, 1);
    expect(facade.sesion()?.conteoId).toBe(7);
    expect(facade.error()).toBeNull();
  });

  it('no abre una ronda nueva si la anterior está cerrada', async () => {
    conteoRepo.getRondaAbierta.and.resolveTo(null);
    conteoRepo.getUltimaRonda.and.resolveTo({ ...ronda(2), estado: 'FINALIZADO' as const });

    await facade.init(1, 1, 1, 1);

    expect(conteoRepo.abrirRonda).not.toHaveBeenCalled();
    expect(facade.error()).toMatch(/análisis/);
    expect(facade.sesion()).toBeNull();
  });

  it('no acepta scans después de finalizar la sesión', async () => {
    await facade.finalizar();

    const resultado = await facade.scan('AF001');

    expect(resultado).toBe('rechazado');
    expect(conteoRepo.upsert).not.toHaveBeenCalled();
    expect(facade.enCurso()).toBeFalse();
  });

  it('resuelve un código de lectura distinto al SKU (ej: código de barras)', async () => {
    // Re-init con mapa que incluye código de barras como código de lectura
    conteoRepo.getRondaAbierta.and.resolveTo(ronda(1));

    const detalleRepo = TestBed.inject(MUESTRA_DETALLE_REPOSITORY_TOKEN) as jasmine.SpyObj<MuestraDetalleRepository>;
    detalleRepo.getCodigosByMuestra.and.resolveTo([
      { codigoLectura: '7891234567890', productoId: 100 },
    ]);

    await facade.init(1, 1, 1, 1);

    const resultado = await facade.scan('7891234567890', 3);

    expect(resultado).toBe('valido');
    expect(conteoRepo.upsert).toHaveBeenCalledWith(7, 1, 100, 1, 1, 3);
  });
});
