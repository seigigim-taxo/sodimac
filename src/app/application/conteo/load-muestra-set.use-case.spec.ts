import { TestBed } from '@angular/core/testing';
import { LoadMuestraSetUseCase } from './load-muestra-set.use-case';
import { MUESTRA_REPOSITORY_TOKEN, MuestraRepository } from '../../domain/muestra/repositories/muestra.repository';

describe('LoadMuestraSetUseCase', () => {
  let useCase: LoadMuestraSetUseCase;
  let muestraRepo: jasmine.SpyObj<MuestraRepository>;

  beforeEach(() => {
    muestraRepo = jasmine.createSpyObj('MuestraRepository', ['getByEventoIteracion']);
    muestraRepo.getByEventoIteracion.and.resolveTo({ id: 10, codigoMuestra: null, idAgenda: null, numeroAgenda: null, eventoId: 1, sucursalId: 1, iteracion: 1, estado: 'ACTIVA', nombre: null, nombreArchivo: null });

    TestBed.configureTestingModule({
      providers: [
        LoadMuestraSetUseCase,
        { provide: MUESTRA_REPOSITORY_TOKEN, useValue: muestraRepo },
      ],
    });
    useCase = TestBed.inject(LoadMuestraSetUseCase);
  });

  it('carga la muestra del evento para la iteración dada', async () => {
    await useCase.execute(1, 1);

    expect(muestraRepo.getByEventoIteracion).toHaveBeenCalledWith(1, 1);
  });

  it('devuelve solo el id de la muestra: los códigos ya no se cargan acá', async () => {
    const set = await useCase.execute(1, 1);

    expect(set).toEqual({ muestraId: 10 });
  });

  it('devuelve muestraId null si la ronda no tiene muestra', async () => {
    muestraRepo.getByEventoIteracion.and.resolveTo(null);

    const set = await useCase.execute(1, 1);

    expect(set.muestraId).toBeNull();
  });
});
