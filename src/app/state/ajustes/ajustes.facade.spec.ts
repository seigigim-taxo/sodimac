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
      'cargarModoCapturaPreferido',
      'guardarModoCapturaPreferido',
    ]);
    storage.cargarSincronizacionAutomatica.and.resolveTo(null);
    storage.guardarSincronizacionAutomatica.and.resolveTo();
    storage.cargarModoCapturaPreferido.and.resolveTo(null);
    storage.guardarModoCapturaPreferido.and.resolveTo();

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

  describe('modoCapturaPreferido', () => {
    /* Sin ajuste guardado, arranca en "por cantidad" — el nuevo default. */
    it('arranca en "cantidad" sin ajuste guardado', async () => {
      await facade.init();

      expect(facade.modoCapturaPreferido()).toBe('cantidad');
    });

    it('respeta el modo guardado al arrancar', async () => {
      storage.cargarModoCapturaPreferido.and.resolveTo('uno');

      await facade.init();

      expect(facade.modoCapturaPreferido()).toBe('uno');
    });

    it('persiste el cambio y actualiza el signal', async () => {
      await facade.init();

      await facade.setModoCapturaPreferido('uno');

      expect(storage.guardarModoCapturaPreferido).toHaveBeenCalledWith('uno');
      expect(facade.modoCapturaPreferido()).toBe('uno');
    });

    // No hay nada nuevo que persistir ni notificar si no cambió.
    it('no escribe nada si el modo elegido es el mismo que ya está', async () => {
      await facade.init();

      await facade.setModoCapturaPreferido('cantidad');

      expect(storage.guardarModoCapturaPreferido).not.toHaveBeenCalled();
    });

    // El TAG siguiente hereda lo último elegido, aunque el operador cambie de opinión varias veces.
    it('mantiene el último modo elegido a través de varios cambios', async () => {
      await facade.init();

      await facade.setModoCapturaPreferido('uno');
      await facade.setModoCapturaPreferido('cantidad');
      await facade.setModoCapturaPreferido('uno');

      expect(facade.modoCapturaPreferido()).toBe('uno');
    });
  });
});
