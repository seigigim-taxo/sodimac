import { TestBed } from '@angular/core/testing';
import { DeleteConteoSesionUseCase } from './delete-conteo-sesion.use-case';
import { CONTEO_REPOSITORY_TOKEN, ConteoRepository } from '../../domain/conteo/repositories/conteo.repository';
import { SINCRONIZACION_REPOSITORY_TOKEN, SincronizacionRepository } from '../../domain/sincronizacion/repositories/sincronizacion.repository';
import { EstadoEnvioTag } from '../../domain/sincronizacion/models/estado-envio-tag.model';

/*
 * Borrar un TAG que el servidor tiene (o pudo recibir) dejaría datos allá que
 * la PDA ya no puede explicar. Solo se borra uno que el servidor NO tiene.
 */
describe('DeleteConteoSesionUseCase', () => {
  let useCase: DeleteConteoSesionUseCase;
  let repo: jasmine.SpyObj<ConteoRepository>;
  let sincRepo: jasmine.SpyObj<SincronizacionRepository>;

  const envio = (estado: EstadoEnvioTag) =>
    sincRepo.estadoEnvioTag.and.resolveTo({ estado, cargaUid: estado === 'SIN_ENVIO' ? null : 'UID-1', detalle: null });

  beforeEach(() => {
    repo = jasmine.createSpyObj('ConteoRepository', ['deleteSesion']);
    repo.deleteSesion.and.resolveTo();
    sincRepo = jasmine.createSpyObj('SincronizacionRepository', ['estadoEnvioTag', 'limpiarEnviosHuerfanos']);
    sincRepo.limpiarEnviosHuerfanos.and.resolveTo();
    envio('SIN_ENVIO');

    TestBed.configureTestingModule({
      providers: [
        DeleteConteoSesionUseCase,
        { provide: CONTEO_REPOSITORY_TOKEN, useValue: repo },
        { provide: SINCRONIZACION_REPOSITORY_TOKEN, useValue: sincRepo },
      ],
    });
    useCase = TestBed.inject(DeleteConteoSesionUseCase);
  });

  it('borra un TAG sin envío, con su tupla completa', async () => {
    await useCase.execute(3, 11, 7, 2, 'FINALIZADO');

    expect(repo.deleteSesion).toHaveBeenCalledOnceWith(3, 11, 7, 2, 'FINALIZADO');
  });

  it('borra uno en curso', async () => {
    await useCase.execute(3, 11, 7, 2, 'EN_CURSO');

    expect(repo.deleteSesion).toHaveBeenCalled();
  });

  it('NO borra uno sincronizado, ni siquiera consulta el envío', async () => {
    await expectAsync(useCase.execute(3, 11, 7, 2, 'SINCRONIZADO'))
      .toBeRejectedWithError(/ya se sincronizó/);

    expect(repo.deleteSesion).not.toHaveBeenCalled();
  });

  describe('según lo que se sabe del envío', () => {
    it('consulta el envío de ESE TAG (ronda + ubicación)', async () => {
      await useCase.execute(3, 11, 7, 2, 'FINALIZADO');

      expect(sincRepo.estadoEnvioTag).toHaveBeenCalledOnceWith(3, 11);
    });

    it('un envío que no llegó (NO_RECIBIDO) se puede borrar', async () => {
      envio('NO_RECIBIDO');

      await useCase.execute(3, 11, 7, 2, 'FINALIZADO');

      expect(repo.deleteSesion).toHaveBeenCalled();
    });

    it('un envío recibido NO se borra', async () => {
      envio('ENVIADO');

      await expectAsync(useCase.execute(3, 11, 7, 2, 'FINALIZADO'))
        .toBeRejectedWithError('Este TAG ya se envió y no se puede modificar.');
      expect(repo.deleteSesion).not.toHaveBeenCalled();
    });

    it('un envío EN DUDA NO se borra', async () => {
      envio('EN_DUDA');

      await expectAsync(useCase.execute(3, 11, 7, 2, 'FINALIZADO'))
        .toBeRejectedWithError(/No pudimos confirmar/);
      expect(repo.deleteSesion).not.toHaveBeenCalled();
    });

    it('si no se puede consultar el envío, no borra a ciegas', async () => {
      sincRepo.estadoEnvioTag.and.rejectWith(new Error('disco'));

      await expectAsync(useCase.execute(3, 11, 7, 2, 'FINALIZADO')).toBeRejectedWithError('disco');
      expect(repo.deleteSesion).not.toHaveBeenCalled();
    });
  });

  /*
   * La fila 213: el TAG se descartaba pero su envío fallido quedaba en la cola, y
   * con los reintentos automáticos se habría vuelto a mandar sola.
   */
  describe('al borrar, limpia el envío fallido del TAG', () => {
    it('lo limpia DESPUÉS de borrar las lecturas', async () => {
      const orden: string[] = [];
      repo.deleteSesion.and.callFake(async () => { orden.push('borrar'); });
      sincRepo.limpiarEnviosHuerfanos.and.callFake(async () => { orden.push('limpiar'); });

      await useCase.execute(3, 11, 7, 2, 'FINALIZADO');

      expect(orden).toEqual(['borrar', 'limpiar']);
    });

    it('si no se pudo borrar, no limpia nada', async () => {
      repo.deleteSesion.and.rejectWith(new Error('disco'));

      await expectAsync(useCase.execute(3, 11, 7, 2, 'FINALIZADO')).toBeRejectedWithError('disco');

      expect(sincRepo.limpiarEnviosHuerfanos).not.toHaveBeenCalled();
    });

    it('si el TAG está bloqueado por su envío, no borra ni limpia', async () => {
      envio('EN_DUDA');

      await expectAsync(useCase.execute(3, 11, 7, 2, 'FINALIZADO')).toBeRejected();

      expect(sincRepo.limpiarEnviosHuerfanos).not.toHaveBeenCalled();
    });

    it('si la limpieza falla, el borrado igual se da por hecho', async () => {
      spyOn(console, 'error');
      sincRepo.limpiarEnviosHuerfanos.and.rejectWith(new Error('disco'));

      await expectAsync(useCase.execute(3, 11, 7, 2, 'FINALIZADO')).toBeResolved();
    });
  });
});
