import { TestBed } from '@angular/core/testing';
import { RegistrarUbicacionUseCase } from './registrar-ubicacion.use-case';
import { ResultadoUbicacion, UBICACION_REPOSITORY_TOKEN, UbicacionRepository } from '../../domain/ubicacion/repositories/ubicacion.repository';

const RESULTADO: ResultadoUbicacion = { ubicacionId: 5, reabierta: false, ubicacionSincronizadaId: null };

describe('RegistrarUbicacionUseCase', () => {
  let uc: RegistrarUbicacionUseCase;
  let insert: jasmine.Spy;

  beforeEach(() => {
    insert = jasmine.createSpy('insert').and.resolveTo(RESULTADO);

    TestBed.configureTestingModule({
      providers: [
        RegistrarUbicacionUseCase,
        { provide: UBICACION_REPOSITORY_TOKEN, useValue: { insert } as UbicacionRepository },
      ],
    });
    uc = TestBed.inject(RegistrarUbicacionUseCase);
  });

  it('delega en el repositorio con la ronda, operador y pda', async () => {
    await uc.execute(3, 'TAG-01', 'TAG-01', 7, 1, 1);

    expect(insert).toHaveBeenCalledWith(3, 'TAG-01', 'TAG-01', 7, 1, 1);
  });

  it('devuelve el resultado del repositorio tal cual', async () => {
    expect(await uc.execute(3, 'TAG-01', 'TAG-01', 7, 1, 1)).toBe(RESULTADO);
  });

  it('rechaza código vacío', async () => {
    await expectAsync(uc.execute(3, '  ', 'TAG-01', 7, 1, 1)).toBeRejected();
    expect(insert).not.toHaveBeenCalled();
  });

  it('rechaza TAG vacío', async () => {
    await expectAsync(uc.execute(3, 'TAG-01', '', 7, 1, 1)).toBeRejected();
    expect(insert).not.toHaveBeenCalled();
  });

  it('rechaza zona inválida', async () => {
    await expectAsync(uc.execute(0, 'TAG-01', 'TAG-01', 7, 1, 1)).toBeRejected();
    expect(insert).not.toHaveBeenCalled();
  });

  // Sin ronda no hay a qué acotar la reapertura/referencia — ver UbicacionRepository.insert().
  it('rechaza ronda inválida', async () => {
    await expectAsync(uc.execute(3, 'TAG-01', 'TAG-01', 0, 1, 1)).toBeRejected();
    expect(insert).not.toHaveBeenCalled();
  });
});
