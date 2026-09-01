import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AlertController } from '@ionic/angular/standalone';
import { OfertaActualizacionService } from './oferta-actualizacion.service';
import { ActualizacionFacade } from '../../state/actualizacion/actualizacion.facade';
import { VersionDisponible } from '../../domain/actualizacion/models/version-disponible.model';

/*
 * Lo que se prueba acá es CUÁNDO se le ofrece la actualización al operador, que
 * es la parte que puede molestarlo: la app se cierra para instalarse, así que
 * ofrecerla de más interrumpe un turno y ofrecerla de menos deja PDAs viejas
 * en terreno.
 *
 * El facade va doblado —es la puerta a la red y al instalador de Android—, el
 * servicio es real.
 */
const VERSION = (versionCode: number, obligatoria = false): VersionDisponible => ({
  versionCode,
  versionName: `1.0.${versionCode}`,
  url: 'http://servidor/app.apk',
  sha256: 'abc',
  obligatoria,
  notas: null,
} as VersionDisponible);

describe('OfertaActualizacionService', () => {
  let servicio: OfertaActualizacionService;
  let buscar: jasmine.Spy;
  let disponible: ReturnType<typeof signal<VersionDisponible | null>>;
  let hayActualizacion: ReturnType<typeof signal<boolean>>;
  let instalada: ReturnType<typeof signal<number>>;

  beforeEach(() => {
    disponible = signal<VersionDisponible | null>(null);
    hayActualizacion = signal(false);
    instalada = signal(8);
    buscar = jasmine.createSpy('buscar').and.callFake(async () => hayActualizacion());

    TestBed.configureTestingModule({
      providers: [
        OfertaActualizacionService,
        {
          provide: ActualizacionFacade,
          useValue: {
            buscar,
            disponible,
            hayActualizacion,
            instalada,
            buscando: signal(false),
            descargando: signal(false),
            porcentaje: signal(null),
            error: signal(null),
          },
        },
        {
          provide: AlertController,
          useValue: { create: jasmine.createSpy('create').and.resolveTo({ present: () => Promise.resolve() }) },
        },
      ],
    });
    servicio = TestBed.inject(OfertaActualizacionService);
  });

  /*
   * El operador entra y sale de Inicio muchas veces por turno. Sin la pausa,
   * cada vuelta seria una consulta al servidor preguntando lo mismo.
   */
  describe('consulta silenciosa', () => {
    it('consulta la primera vez', async () => {
      await servicio.buscarEnSilencio();

      expect(buscar).toHaveBeenCalledTimes(1);
    });

    it('no vuelve a consultar si se entra de nuevo enseguida', async () => {
      await servicio.buscarEnSilencio();
      await servicio.buscarEnSilencio();
      await servicio.buscarEnSilencio();

      expect(buscar).toHaveBeenCalledTimes(1);
    });

    it('vuelve a consultar pasado el intervalo', async () => {
      const t0 = Date.now();
      spyOn(Date, 'now').and.returnValue(t0);
      await servicio.buscarEnSilencio();

      (Date.now as jasmine.Spy).and.returnValue(t0 + 6 * 60_000);
      await servicio.buscarEnSilencio();

      expect(buscar).toHaveBeenCalledTimes(2);
    });
  });

  describe('que se le ofrece al operador', () => {
    it('no ofrece nada si no hay version nueva', () => {
      expect(servicio.ofrecible()).toBeFalse();
    });

    it('ofrece cuando hay una version nueva', () => {
      hayActualizacion.set(true);
      disponible.set(VERSION(9));

      expect(servicio.ofrecible()).toBeTrue();
    });

    /*
     * Con la version instalada desconocida (0) la comparacion dice que
     * cualquier version del servidor es mas nueva. La consulta del menu ofrece
     * igual --el operador pregunto-- pero esta franja se pinta sola y se
     * quedaria puesta para siempre.
     */
    it('no ofrece nada si no se pudo leer la version instalada', () => {
      hayActualizacion.set(true);
      disponible.set(VERSION(9));
      instalada.set(0);

      expect(servicio.ofrecible()).toBeFalse();
    });

    // Ni siquiera una obligatoria, que es la que no se puede descartar: dejarla
    // pasar seria dejar al operador con un aviso que no se va ni tocandolo.
    it('tampoco una obligatoria con la version instalada desconocida', () => {
      hayActualizacion.set(true);
      disponible.set(VERSION(9, true));
      instalada.set(0);

      expect(servicio.ofrecible()).toBeFalse();
    });

    /*
     * "Ahora no" tiene que callar el aviso. Si reapareciera en cada vuelta a
     * Inicio, el operador terminaria ignorando la franja entera --incluida la
     * vez que si importa.
     */
    it('deja de ofrecer la version que el operador descarto', () => {
      hayActualizacion.set(true);
      disponible.set(VERSION(9));

      servicio.descartar();

      expect(servicio.ofrecible()).toBeFalse();
    });

    // Descartar la 9 no puede tapar la 10.
    it('vuelve a ofrecer si sale una version posterior', () => {
      hayActualizacion.set(true);
      disponible.set(VERSION(9));
      servicio.descartar();

      disponible.set(VERSION(10));

      expect(servicio.ofrecible()).toBeTrue();
    });

    /*
     * El servidor marco esa version como no apta para seguir trabajando: no se
     * puede despachar.
     */
    it('una version obligatoria no se puede descartar', () => {
      hayActualizacion.set(true);
      disponible.set(VERSION(9, true));

      servicio.descartar();

      expect(servicio.ofrecible()).toBeTrue();
    });
  });

  /*
   * La consulta del menu contesta siempre, aunque no haya nada: el operador
   * toco un boton y se quedo mirando.
   */
  describe('consulta desde el menu', () => {
    it('avisa que la app esta al dia cuando no hay nada', async () => {
      const alertController = TestBed.inject(AlertController);

      await servicio.buscarYResponder();

      expect(alertController.create).toHaveBeenCalled();
    });

    it('consulta aunque se acabe de consultar en silencio', async () => {
      await servicio.buscarEnSilencio();
      await servicio.buscarYResponder();

      expect(buscar).toHaveBeenCalledTimes(2);
    });
  });
});
