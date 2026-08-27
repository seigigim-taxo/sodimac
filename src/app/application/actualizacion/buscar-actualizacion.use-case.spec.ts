import { TestBed } from '@angular/core/testing';
import { BuscarActualizacionUseCase } from './buscar-actualizacion.use-case';
import {
  ACTUALIZACION_API_REPOSITORY_TOKEN,
  INSTALADOR_REPOSITORY_TOKEN,
} from '../../domain/actualizacion/repositories/actualizacion.repository';
import { VersionDisponible } from '../../domain/actualizacion/models/version-disponible.model';

function version(versionCode: number): VersionDisponible {
  return {
    versionCode,
    versionName: `1.0.${versionCode}`,
    url:         'http://servidor/apk/x.apk',
    sha256:      'f'.repeat(64),
    obligatoria: false,
    notas:       '',
  };
}

describe('BuscarActualizacionUseCase', () => {
  let uc: BuscarActualizacionUseCase;
  let consultar: jasmine.Spy;
  let versionInstalada: jasmine.Spy;

  beforeEach(() => {
    consultar = jasmine.createSpy('consultarUltimaVersion').and.resolveTo(null);
    versionInstalada = jasmine.createSpy('versionInstalada').and.resolveTo(3);

    TestBed.configureTestingModule({
      providers: [
        BuscarActualizacionUseCase,
        { provide: ACTUALIZACION_API_REPOSITORY_TOKEN, useValue: { consultarUltimaVersion: consultar } },
        {
          provide: INSTALADOR_REPOSITORY_TOKEN,
          useValue: {
            versionInstalada,
            puedeInstalar: () => Promise.resolve(true),
            abrirAjustesInstalacion: () => Promise.resolve(),
            instalar: () => Promise.resolve(),
          },
        },
      ],
    });
    uc = TestBed.inject(BuscarActualizacionUseCase);
  });

  it('ofrece actualizar si el servidor tiene una versión mayor', async () => {
    consultar.and.resolveTo(version(4));

    expect((await uc.execute()).hayActualizacion).toBeTrue();
  });

  /*
   * Con >= la app ofrecería reinstalar la misma versión cada vez que el
   * operador abre el menú, y "actualizar" dejaría de significar algo.
   */
  it('con la misma versión, no ofrece nada', async () => {
    consultar.and.resolveTo(version(3));

    expect((await uc.execute()).hayActualizacion).toBeFalse();
  });

  /*
   * Una build de prueba puesta a mano queda por encima del servidor.
   * "Actualizar" ahí la reemplazaría por una más vieja — y Android además
   * rechaza el downgrade, así que el operador vería un error sin explicación.
   */
  it('si lo instalado es más nuevo que el servidor, tampoco', async () => {
    versionInstalada.and.resolveTo(9);
    consultar.and.resolveTo(version(4));

    expect((await uc.execute()).hayActualizacion).toBeFalse();
  });

  it('sin manifiesto utilizable, no ofrece nada', async () => {
    consultar.and.resolveTo(null);

    const estado = await uc.execute();

    expect(estado.hayActualizacion).toBeFalse();
    expect(estado.disponible).toBeNull();
  });

  it('informa la versión instalada aunque no haya nada que ofrecer', async () => {
    expect((await uc.execute()).versionInstalada).toBe(3);
  });
});
