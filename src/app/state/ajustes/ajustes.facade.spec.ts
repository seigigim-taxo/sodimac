import { TestBed } from '@angular/core/testing';
import { AjustesFacade } from './ajustes.facade';
import {
  AJUSTES_STORAGE_REPOSITORY_TOKEN,
  AjustesStorageRepository,
} from '../../domain/ajustes/repositories/ajustes-storage.repository';

describe('AjustesFacade', () => {
  let facade: AjustesFacade;
  let storage: jasmine.SpyObj<AjustesStorageRepository>;

  beforeEach(() => {
    storage = jasmine.createSpyObj('AjustesStorageRepository', [
      'cargarSincronizacionAutomatica',
      'guardarSincronizacionAutomatica',
    ]);
    storage.cargarSincronizacionAutomatica.and.resolveTo(null);
    storage.guardarSincronizacionAutomatica.and.resolveTo();

    TestBed.configureTestingModule({
      providers: [
        AjustesFacade,
        { provide: AJUSTES_STORAGE_REPOSITORY_TOKEN, useValue: storage },
      ],
    });
    facade = TestBed.inject(AjustesFacade);
  });

  /* Sin ajuste guardado, la app se comporta como siempre lo hizo. */
  it('arranca con la sincronización automática encendida', async () => {
    await facade.init();

    expect(facade.sincronizacionAutomatica()).toBeTrue();
  });

  it('respeta el ajuste guardado al arrancar', async () => {
    storage.cargarSincronizacionAutomatica.and.resolveTo(false);

    await facade.init();

    expect(facade.sincronizacionAutomatica()).toBeFalse();
  });

  it('persiste el cambio al apagarlo', async () => {
    await facade.init();

    await facade.toggleSincronizacionAutomatica();

    expect(storage.guardarSincronizacionAutomatica).toHaveBeenCalledWith(false);
    expect(facade.sincronizacionAutomatica()).toBeFalse();
  });

  it('vuelve a encenderlo', async () => {
    storage.cargarSincronizacionAutomatica.and.resolveTo(false);
    await facade.init();

    await facade.toggleSincronizacionAutomatica();

    expect(storage.guardarSincronizacionAutomatica).toHaveBeenCalledWith(true);
    expect(facade.sincronizacionAutomatica()).toBeTrue();
  });
});
