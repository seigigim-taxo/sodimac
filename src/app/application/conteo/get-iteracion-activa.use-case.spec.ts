import { TestBed } from '@angular/core/testing';
import { GetIteracionActivaUseCase } from './get-iteracion-activa.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';

describe('GetIteracionActivaUseCase', () => {
  let useCase: GetIteracionActivaUseCase;
  let repo: jasmine.SpyObj<ConteoRepository>;

  beforeEach(() => {
    repo = jasmine.createSpyObj('ConteoRepository', ['getIteracionActiva']);

    TestBed.configureTestingModule({
      providers: [
        GetIteracionActivaUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: repo },
      ],
    });
    useCase = TestBed.inject(GetIteracionActivaUseCase);
  });

  it('devuelve la ronda registrada en el conteo', async () => {
    repo.getIteracionActiva.and.resolveTo(3);

    expect(await useCase.execute(1)).toBe(3);
    expect(repo.getIteracionActiva).toHaveBeenCalledWith(1);
  });

  it('devuelve 1 cuando el evento todavía no tiene conteos', async () => {
    // Es el COALESCE del repositorio: sin filas, la ronda es la primera.
    repo.getIteracionActiva.and.resolveTo(1);

    expect(await useCase.execute(99)).toBe(1);
  });
});
