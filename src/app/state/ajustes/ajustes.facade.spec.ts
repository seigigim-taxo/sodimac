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
      'eliminarSincronizacionAutomatica',
      'cargarModoCapturaPreferido',
      'guardarModoCapturaPreferido',
    ]);
    storage.eliminarSincronizacionAutomatica.and.resolveTo();
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

  /*
   * La sincronización automática dejó de ser un ajuste: finalizar un TAG siempre
   * intenta enviarlo. Una PDA que la había apagado no debe seguir sin enviar.
   */
  describe('el ajuste de sincronización automática que quedó de versiones anteriores', () => {
    it('lo borra al arrancar', async () => {
      await facade.init();

      expect(storage.eliminarSincronizacionAutomatica).toHaveBeenCalledOnceWith();
    });

    it('ya no es un ajuste de la fachada', () => {
      expect('sincronizacionAutomatica' in facade).toBeFalse();
      expect('toggleSincronizacionAutomatica' in facade).toBeFalse();
    });

    it('si no se puede borrar, el arranque sigue y el modo de captura se carga igual', async () => {
      spyOn(console, 'error');
      storage.eliminarSincronizacionAutomatica.and.rejectWith(new Error('sin disco'));
      storage.cargarModoCapturaPreferido.and.resolveTo('uno');

      await expectAsync(facade.init()).toBeResolved();

      expect(facade.modoCapturaPreferido()).toBe('uno');
    });
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
