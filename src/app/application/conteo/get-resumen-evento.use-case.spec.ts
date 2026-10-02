import { TestBed } from '@angular/core/testing';
import { GetResumenEventoUseCase } from './get-resumen-evento.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { MUESTRA_REPOSITORY_TOKEN, MuestraRepository } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN, MuestraDetalleRepository } from '../../domain/muestra/repositories/muestra-detalle.repository';

/*
 * Lo que importa acá es CÓMO se obtiene el total de la muestra. Una muestra
 * de 23.000 productos llevada entera por el puente de Capacitor solo para
 * sacarle el largo dejaba Inicio sin responder en las PDA de tienda.
 */
describe('GetResumenEventoUseCase', () => {
  let useCase: GetResumenEventoUseCase;
  let conteoRepo: jasmine.SpyObj<ConteoRepository>;
  let muestraRepo: jasmine.SpyObj<MuestraRepository>;
  let detalleRepo: jasmine.SpyObj<MuestraDetalleRepository>;

  beforeEach(() => {
    conteoRepo = jasmine.createSpyObj<ConteoRepository>('ConteoRepository', [
      'getResumenes', 'getRondaAbierta', 'getUltimaRonda',
      'getSkusContadosPorEvento', 'getUnidadesContadasPorEvento',
    ]);
    conteoRepo.getResumenes.and.resolveTo([]);
    conteoRepo.getRondaAbierta.and.resolveTo(null);
    conteoRepo.getUltimaRonda.and.resolveTo(null);
    conteoRepo.getSkusContadosPorEvento.and.resolveTo(['AF001', 'AF002']);
    conteoRepo.getUnidadesContadasPorEvento.and.resolveTo(7);

    muestraRepo = jasmine.createSpyObj<MuestraRepository>('MuestraRepository', ['getByEventoIteracion']);
    muestraRepo.getByEventoIteracion.and.resolveTo({
      id: 10, codigoMuestra: null, idAgenda: null, numeroAgenda: null, eventoId: 1,
      sucursalId: 1, iteracion: 1, estado: 'ACTIVA', nombre: null, nombreArchivo: null,
    });

    detalleRepo = jasmine.createSpyObj<MuestraDetalleRepository>('MuestraDetalleRepository', [
      'getByMuestra', 'contarByMuestra',
    ]);
    detalleRepo.contarByMuestra.and.resolveTo(23275);

    TestBed.configureTestingModule({
      providers: [
        GetResumenEventoUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: conteoRepo },
        { provide: MUESTRA_REPOSITORY_TOKEN, useValue: muestraRepo },
        { provide: MUESTRA_DETALLE_REPOSITORY_TOKEN, useValue: detalleRepo },
      ],
    });
    useCase = TestBed.inject(GetResumenEventoUseCase);
  });

  it('el total de la muestra sale de contarByMuestra', async () => {
    const resumen = await useCase.execute(1, 1, 1);

    expect(detalleRepo.contarByMuestra).toHaveBeenCalledWith(10);
    expect(resumen.totalMuestra).toBe(23275);
  });

  it('NO carga las líneas de la muestra para contarlas', async () => {
    await useCase.execute(1, 1, 1);

    expect(detalleRepo.getByMuestra).not.toHaveBeenCalled();
  });

  it('sin muestra para la ronda, el total es 0 y no cuenta nada', async () => {
    muestraRepo.getByEventoIteracion.and.resolveTo(null);

    const resumen = await useCase.execute(1, 1, 1);

    expect(resumen.totalMuestra).toBe(0);
    expect(detalleRepo.contarByMuestra).not.toHaveBeenCalled();
  });

  it('el resto del resumen no cambia', async () => {
    const resumen = await useCase.execute(1, 1, 1);

    expect(resumen.contados).toBe(2);
    expect(resumen.qContado).toBe(7);
    expect(resumen.iteracion).toBe(1);
    expect(resumen.tagsFinalizados).toBe(0);
  });
});
