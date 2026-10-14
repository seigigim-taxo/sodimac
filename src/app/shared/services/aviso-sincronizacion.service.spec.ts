import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AlertController, ToastController } from '@ionic/angular/standalone';
import { AvisoSincronizacionService } from './aviso-sincronizacion.service';
import { NetworkService } from './network.service';

/*
 * Lo que se prueba acá no es que "se muestre un diálogo" —eso lo hace Ionic—
 * sino las tres propiedades que hacen que el aviso sirva en terreno:
 *
 *   1. no se puede esquivar (sin backdrop, un solo botón Aceptar),
 *   2. no resuelve hasta que el operador lo cierra, porque quien llama espera
 *      esa promesa antes de navegar,
 *   3. dice algo útil según haya o no conexión.
 *
 * Si alguna de las tres se rompe, volvemos al comportamiento del TAG 6000: el
 * operador sigue trabajando creyendo que subió.
 */
/*
 * Deja correr la cadena de promesas del servicio (create → present →
 * onDidDismiss) antes de mirar el resultado. Contar `await Promise.resolve()`
 * a mano se rompe apenas cambia un await adentro; un macrotask los cubre todos.
 */
const vaciarCola = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('AvisoSincronizacionService', () => {
  let servicio: AvisoSincronizacionService;
  let create: jasmine.Spy;
  let toastCreate: jasmine.Spy;
  let toastPresent: jasmine.Spy;
  let online: ReturnType<typeof signal<boolean>>;
  // Se resuelve a mano para poder verificar que el await se queda esperando.
  let cerrarDialogo: () => void;

  function opciones(): { header: string; message: string; backdropDismiss: boolean; buttons: { text: string }[] } {
    return create.calls.mostRecent().args[0];
  }

  beforeEach(() => {
    online = signal(true);
    toastPresent = jasmine.createSpy('present').and.resolveTo();
    toastCreate = jasmine.createSpy('create').and.resolveTo({ present: toastPresent });

    create = jasmine.createSpy('create').and.callFake(() => Promise.resolve({
      present: () => Promise.resolve(),
      onDidDismiss: () => new Promise<void>((resolve) => { cerrarDialogo = resolve; }),
    }));

    TestBed.configureTestingModule({
      providers: [
        AvisoSincronizacionService,
        { provide: AlertController, useValue: { create } },
        { provide: ToastController, useValue: { create: toastCreate } },
        { provide: NetworkService, useValue: { isOnline: online } },
      ],
    });

    servicio = TestBed.inject(AvisoSincronizacionService);
  });

  describe('un TAG que no se envió', () => {
    it('no se puede cerrar sin aceptar', async () => {
      void servicio.avisarFalloTag('6000', 'timeout');
      await vaciarCola();

      expect(opciones().backdropDismiss).toBeFalse();
      expect(opciones().buttons.map((b) => b.text)).toEqual(['Aceptar']);
    });

    it('nombra el TAG en el encabezado', async () => {
      void servicio.avisarFalloTag('6000', null);
      await vaciarCola();

      expect(opciones().header).toBe('El TAG 6000 no se envió al servidor');
    });

    /*
     * El operador tiene que saber que su trabajo NO se perdió. Sin esto, la
     * reacción razonable es volver a contar el TAG entero.
     */
    it('aclara que el conteo quedó guardado', async () => {
      void servicio.avisarFalloTag('6000', null);
      await vaciarCola();

      expect(opciones().message).toContain('guardado en la PDA');
    });

    // Ya no se le pide al operador que reintente: la PDA lo hace sola (Parte E).
    it('dice que se enviará solo, y que además puede reintentar a mano', async () => {
      void servicio.avisarFalloTag('6000', null);
      await vaciarCola();

      expect(opciones().message).toContain('se enviará solo cuando haya señal');
      expect(opciones().message).toContain('También puedes reintentar');
    });

    it('un motivo explícito NO_ENVIADO dice lo mismo que el de siempre', async () => {
      void servicio.avisarFalloTag('6000', null, 'NO_ENVIADO');
      await vaciarCola();

      expect(opciones().header).toBe('El TAG 6000 no se envió al servidor');
    });

    it('sin TAG conocido, igual avisa', async () => {
      void servicio.avisarFalloTag(null, null);
      await vaciarCola();

      expect(opciones().header).toBe('El TAG no se envió al servidor');
    });
  });

  /*
   * Si el servidor pudo haberlo recibido, decir "no se envió" es falso y empuja al
   * operador a volver a contarlo: justo lo que genera el conflicto del TAG 7001.
   */
  describe('un TAG que pudo haber llegado (en duda)', () => {
    it('NO dice que no se envió', async () => {
      void servicio.avisarFalloTag('7001', 'timeout', 'EN_DUDA');
      await vaciarCola();

      expect(opciones().header).toBe('No pudimos confirmar el TAG 7001');
      expect(opciones().header).not.toContain('no se envió');
      expect(opciones().message).not.toContain('no se envió');
    });

    it('le dice que no lo vuelva a contar y que la PDA lo verifica sola', async () => {
      void servicio.avisarFalloTag('7001', null, 'EN_DUDA');
      await vaciarCola();

      expect(opciones().message).toContain('No lo vuelvas a contar');
      expect(opciones().message).toContain('la PDA lo verificará sola');
      expect(opciones().message).toContain('guardado en la PDA');
    });

    it('sin TAG conocido, igual avisa', async () => {
      void servicio.avisarFalloTag(null, null, 'EN_DUDA');
      await vaciarCola();

      expect(opciones().header).toBe('No pudimos confirmar el TAG');
    });

    it('tampoco se puede esquivar, y muestra el detalle', async () => {
      void servicio.avisarFalloTag('7001', 'tiempo de espera agotado', 'EN_DUDA');
      await vaciarCola();

      expect(opciones().backdropDismiss).toBeFalse();
      expect(opciones().buttons.map((b) => b.text)).toEqual(['Aceptar']);
      expect(opciones().message).toContain('Detalle: tiempo de espera agotado');
    });
  });

  // No es un fallo: otro envío del mismo TAG está en marcha. Basta con esperar.
  describe('un TAG que ya se está enviando', () => {
    it('avisa con una toast, sin diálogo', async () => {
      await servicio.avisarFalloTag('7001', 'x', 'YA_SE_ENVIA');

      expect(create).not.toHaveBeenCalled();
      expect(toastCreate).toHaveBeenCalledOnceWith(jasmine.objectContaining({
        message: 'Este TAG ya se está enviando. Espera unos segundos.', color: 'warning',
      }));
      expect(toastPresent).toHaveBeenCalled();
    });

    it('no obliga a aceptar nada: resuelve de inmediato', async () => {
      let resuelto = false;
      void servicio.avisarFalloTag('7001', null, 'YA_SE_ENVIA').then(() => { resuelto = true; });
      await vaciarCola();

      expect(resuelto).toBeTrue();
    });
  });

  /*
   * La razón de ser del cambio: la promesa NO puede resolver antes de que el
   * operador toque Aceptar, porque la pantalla de conteo navega justo después
   * de este await. Si resolviera antes, el diálogo quedaría atrás igual que la
   * toast que reemplazó.
   */
  describe('espera el Aceptar', () => {
    it('no resuelve mientras el diálogo sigue abierto', async () => {
      let resuelto = false;
      void servicio.avisarFalloTag('6000', null).then(() => { resuelto = true; });

      await vaciarCola();
      expect(resuelto).toBeFalse();

      cerrarDialogo();
      await vaciarCola();
      expect(resuelto).toBeTrue();
    });
  });

  /*
   * La línea "Detalle:" es para soporte, y "Failed to fetch" no le sirve a
   * nadie cuando lo que pasa es que la PDA no tiene señal.
   */
  describe('el detalle técnico', () => {
    it('con conexión, muestra el error del servidor', async () => {
      void servicio.avisarFalloTag('6000', 'tiempo de espera agotado');
      await vaciarCola();

      expect(opciones().message).toContain('Detalle: tiempo de espera agotado');
    });

    it('sin conexión, lo reemplaza por algo accionable', async () => {
      online.set(false);
      void servicio.avisarFalloTag('6000', 'Failed to fetch');
      await vaciarCola();

      expect(opciones().message).toContain('Detalle: La PDA está sin conexión.');
      expect(opciones().message).not.toContain('Failed to fetch');
    });

    it('sin error y con conexión, omite la línea', async () => {
      void servicio.avisarFalloTag('6000', null);
      await vaciarCola();

      expect(opciones().message).not.toContain('Detalle:');
    });
  });

  describe('envío masivo', () => {
    it('resume en un solo diálogo, con los códigos', async () => {
      void servicio.avisarFalloLote(['6000', '6001'], 8);
      await vaciarCola();

      expect(create).toHaveBeenCalledTimes(1);
      expect(opciones().header).toBe('2 de 8 TAGs no se enviaron');
      expect(opciones().message).toContain('TAGs: 6000, 6001.');
    });

    it('solo con TAGs que no se enviaron, dice que se reintentará solo y no habla de duda', async () => {
      void servicio.avisarFalloLote(['6000'], 3);
      await vaciarCola();

      expect(opciones().message).toContain('Se reintentará solo cuando haya señal.');
      expect(opciones().message).not.toContain('sin confirmar');
      expect(opciones().message).not.toContain('No lo vuelvas');
    });

    describe('con TAGs sin confirmar', () => {
      it('solo sin confirmar: lo dice en el título y pide no recontar', async () => {
        void servicio.avisarFalloLote([], 5, ['7001', '7002']);
        await vaciarCola();

        expect(create).toHaveBeenCalledTimes(1);
        expect(opciones().header).toBe('2 de 5 TAGs sin confirmar');
        expect(opciones().message).toContain('Sin confirmar: 7001, 7002.');
        expect(opciones().message).toContain('no los vuelvas a contar');
        expect(opciones().message).not.toContain('No se enviaron');
      });

      it('los dos casos juntos van en UN diálogo y se distinguen', async () => {
        void servicio.avisarFalloLote(['6000'], 5, ['7001']);
        await vaciarCola();

        expect(create).toHaveBeenCalledTimes(1);
        expect(opciones().header).toBe('2 de 5 TAGs con problemas de envío');
        expect(opciones().message).toContain('No se enviaron: 6000.');
        expect(opciones().message).toContain('Sin confirmar: 7001.');
      });

      it('sin códigos conocidos, igual avisa', async () => {
        void servicio.avisarFalloLote([], 4, [null]);
        await vaciarCola();

        expect(opciones().header).toBe('1 de 4 TAGs sin confirmar');
        expect(opciones().message).not.toContain('Sin confirmar:');
      });
    });

    // Si todos subieron, el aviso de fallo no tiene nada que decir: el éxito lo
    // informa la pantalla con una toast.
    it('sin fallidos no muestra nada', async () => {
      await servicio.avisarFalloLote([], 8);
      await servicio.avisarFalloLote([], 8, []);

      expect(create).not.toHaveBeenCalled();
    });
  });
});
