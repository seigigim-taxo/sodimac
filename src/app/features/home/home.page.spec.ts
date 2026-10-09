import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { HomePage } from './home.page';
import { AuthFacade } from '../../state/auth/auth.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { Evento, EventoFacade } from '../../state/evento/evento.facade';
import { ConteoListFacade } from '../../state/conteo/conteo-list.facade';
import { EventoConResumen, ResumenEventoFacade } from '../../state/conteo/resumen-evento.facade';
import { NuevoConteoFacade } from '../../state/asignacion/nuevo-conteo.facade';
import { BuscadorService } from '../../shared/services/buscador.service';
import { NetworkService } from '../../shared/services/network.service';
import { OfertaActualizacionService } from '../../shared/services/oferta-actualizacion.service';
import { VigenciaDiaService } from '../../shared/services/vigencia-dia.service';
import { ReintentoAutomaticoService } from '../../shared/services/reintento-automatico.service';
import { etiquetaDia, hoySql, sumarDias } from '../../shared/utils/fecha.utils';

/*
 * Lo que se prueba acá es lo que el operador VE en Inicio: qué jornadas se
 * ofrecen, cómo se llama cada una y qué dicen los avisos. La regla de fechas
 * vive en fecha.utils; acá se comprueba que la pantalla la use completa y que
 * la misma fecha se lea igual en todos los rincones.
 *
 * Las fechas van calculadas desde el día real, no fijas: un literal deja el spec
 * verde hoy y roto mañana.
 */
const HOY = hoySql();
const AYER = sumarDias(HOY, -1);
const EN_3_DIAS = sumarDias(HOY, 3);   // la próxima jornada de un viernes: el lunes
const EN_5_DIAS = sumarDias(HOY, 5);
const EN_20_DIAS = sumarDias(HOY, 20); // más allá del horizonte de la ventana

const NOMBRE_CORTO = /^(Lun|Mar|Mié|Jue|Vie|Sáb|Dom) \d{2}\/\d{2}$/;

const evento = (id: number, fechaProgramada: string, estado: Evento['estado'] = 'ABIERTO'): Evento => ({
  id, sucursalId: 1, nombre: `EVENTO ${id}`,
  fechaProgramada, fechaEjecucion: null, estado,
  fechaRegistro: `${fechaProgramada} 08:00:00`,
});

const conResumen = (e: Evento): EventoConResumen => ({
  evento: e,
  resumen: { totalMuestra: 10, contados: 3, tagsFinalizados: 1, iteracion: 1, qContado: 5 },
});

describe('HomePage — jornadas que se ofrecen', () => {
  let fixture: ComponentFixture<HomePage>;
  let component: HomePage;
  let eventos: ReturnType<typeof signal<Evento[]>>;
  let finalizados: ReturnType<typeof signal<EventoConResumen[]>>;
  let jornadaCerrada: ReturnType<typeof signal<string | null>>;
  let reintento: jasmine.SpyObj<ReintentoAutomaticoService>;

  beforeEach(async () => {
    eventos = signal<Evento[]>([]);
    finalizados = signal<EventoConResumen[]>([]);
    jornadaCerrada = signal<string | null>(null);

    reintento = jasmine.createSpyObj('ReintentoAutomaticoService', ['disparar']);

    const stub = <T>(valor: unknown): T => valor as T;

    await TestBed.configureTestingModule({ imports: [HomePage] })
      /*
       * Sin los componentes de Ionic ni el encabezado: acá se prueba el texto y
       * la estructura de las tarjetas, no cómo Ionic dibuja un botón.
       */
      .overrideComponent(HomePage, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .overrideProvider(Router, { useValue: { navigate: jasmine.createSpy('navigate') } })
      .overrideProvider(AuthFacade, { useValue: stub<AuthFacade>({ session: () => ({ operadorId: 7 }) }) })
      .overrideProvider(PdaFacade, { useValue: stub<PdaFacade>({ pdaId: () => 1 }) })
      .overrideProvider(SucursalFacade, {
        useValue: stub<SucursalFacade>({
          currentStore: signal({ id: 1, codigoTienda: '4012', nombre: 'HC SAN MIGUEL' }),
          loading: signal(false),
          error: signal(null),
          noStores: signal(false),
          loadSucursales: () => Promise.resolve(),
        }),
      })
      .overrideProvider(EventoFacade, {
        useValue: stub<EventoFacade>({
          events: eventos,
          selectedEvent: signal(null),
          loading: signal(false),
          error: signal(null),
          noEvents: signal(false),
          loadEventos: () => Promise.resolve(),
          selectEvento: jasmine.createSpy('selectEvento'),
        }),
      })
      .overrideProvider(ConteoListFacade, { useValue: stub<ConteoListFacade>({ load: () => Promise.resolve() }) })
      .overrideProvider(ResumenEventoFacade, {
        useValue: stub<ResumenEventoFacade>({
          conAvance: finalizados,
          cargarConAvance: () => Promise.resolve(),
        }),
      })
      .overrideProvider(NuevoConteoFacade, {
        useValue: stub<NuevoConteoFacade>({
          buscando: signal(false),
          sinNovedad: signal(false),
          error: signal(null),
          limpiar: () => undefined,
        }),
      })
      .overrideProvider(BuscadorService, { useValue: stub<BuscadorService>({ abrir: () => undefined }) })
      .overrideProvider(NetworkService, { useValue: stub<NetworkService>({ isOnline: signal(true) }) })
      .overrideProvider(OfertaActualizacionService, {
        useValue: stub<OfertaActualizacionService>({
          ofrecible: signal(false),
          disponible: signal(null),
          descargando: signal(false),
          porcentaje: signal(null),
          buscarEnSilencio: () => Promise.resolve(),
          confirmarInstalacion: () => Promise.resolve(),
        }),
      })
      // El Inicio pide un reintento al entrar; sin el doble arrastraría la cadena real de envíos.
      .overrideProvider(ReintentoAutomaticoService, { useValue: reintento })
      .overrideProvider(VigenciaDiaService, {
        useValue: stub<VigenciaDiaService>({
          jornadaCerrada,
          descartarAvisoJornadaCerrada: () => undefined,
        }),
      })
      .compileComponents();

    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
  });

  /* Pinta con los eventos dados y deja el DOM listo para consultar. */
  const pintar = (lista: Evento[]): void => {
    eventos.set(lista);
    fixture.detectChanges();
  };

  const texto = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const filas = (rotulo: string): HTMLElement[] =>
    (Array.from(fixture.nativeElement.querySelectorAll('.store-row')) as HTMLElement[])
      .filter((f) => texto(f.querySelector('.store-label')) === rotulo);

  /* Lo que lee el operador en cada tarjeta de jornada, en orden de pantalla. */
  const nombresDeTarjetas = (): string[] =>
    filas('Evento').map((f) => texto(f.querySelector('.store-value')));

  const etiquetasDeTarjetas = (): string[] =>
    filas('Fecha programada').map((f) => texto(f.querySelector('.badge')));

  const fechasDeTarjetas = (): string[] =>
    filas('Fecha programada').map((f) => texto(f.querySelector('.store-value')).match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '');

  describe('qué jornadas aparecen', () => {
    it('hoy y la próxima jornada', () => {
      pintar([evento(1, HOY), evento(2, EN_3_DIAS)]);

      expect(nombresDeTarjetas()).toEqual(['EVENTO 1', 'EVENTO 2']);
    });

    it('con varias futuras, solo la más cercana', () => {
      pintar([evento(1, HOY), evento(3, EN_5_DIAS), evento(2, EN_3_DIAS)]);

      expect(nombresDeTarjetas()).toEqual(['EVENTO 1', 'EVENTO 2']);
    });

    it('sin jornada hoy, solo la próxima', () => {
      pintar([evento(2, EN_3_DIAS), evento(3, EN_5_DIAS)]);

      expect(nombresDeTarjetas()).toEqual(['EVENTO 2']);
    });

    it('ordenadas por fecha aunque lleguen al revés', () => {
      pintar([evento(2, EN_3_DIAS), evento(1, HOY)]);

      expect(nombresDeTarjetas()).toEqual(['EVENTO 1', 'EVENTO 2']);
    });

    it('una jornada más allá del horizonte no se ofrece', () => {
      pintar([evento(1, HOY), evento(9, EN_20_DIAS)]);

      expect(nombresDeTarjetas()).toEqual(['EVENTO 1']);
    });

    it('lo de ayer no se ofrece', () => {
      pintar([evento(1, AYER), evento(2, HOY)]);

      expect(nombresDeTarjetas()).toEqual(['EVENTO 2']);
    });

    it('solo las ABIERTAS: una de hoy en análisis no ocupa tarjeta', () => {
      pintar([evento(1, HOY, 'EN_ANALISIS'), evento(2, EN_3_DIAS)]);

      expect(nombresDeTarjetas()).toEqual(['EVENTO 2']);
    });

    it('una por día: si hay dos para la misma fecha, la más nueva', () => {
      pintar([evento(1, HOY), evento(2, HOY)]);

      expect(nombresDeTarjetas()).toEqual(['EVENTO 2']);
    });
  });

  /*
   * El operador distingue las tarjetas por esta etiqueta; si miente, elige mal.
   * Un viernes, la próxima es el lunes: llamarla "Mañana" sería falso.
   */
  describe('cómo se llama cada jornada', () => {
    it('hoy y mañana', () => {
      pintar([evento(1, HOY), evento(2, sumarDias(HOY, 1))]);

      expect(etiquetasDeTarjetas()).toEqual(['Hoy', 'Mañana']);
    });

    it('una próxima que no es mañana lleva el día de la semana y la fecha corta', () => {
      pintar([evento(1, HOY), evento(2, EN_3_DIAS)]);

      const [hoy, proxima] = etiquetasDeTarjetas();
      expect(hoy).toBe('Hoy');
      expect(proxima).toMatch(NOMBRE_CORTO);
      expect(proxima).not.toBe('Mañana');
    });

    it('la fecha corta coincide con la fecha completa de la misma tarjeta', () => {
      pintar([evento(1, HOY), evento(2, EN_3_DIAS)]);

      const [, proxima] = etiquetasDeTarjetas();
      const [diaMes] = proxima.split(' ').slice(1);
      const [, mes, dia] = EN_3_DIAS.split('-');

      expect(diaMes).toBe(`${dia}/${mes}`);
    });

    it('solo la tarjeta de hoy lleva el distintivo verde', () => {
      pintar([evento(1, HOY), evento(2, EN_3_DIAS)]);

      const verdes = Array.from(fixture.nativeElement.querySelectorAll('.badge-success')) as HTMLElement[];

      expect(verdes.map((v) => texto(v))).toEqual(['Hoy']);
    });

    it('la tarjeta sigue mostrando la fecha completa junto a la etiqueta', () => {
      pintar([evento(1, HOY), evento(2, EN_3_DIAS)]);

      expect(fechasDeTarjetas()).toEqual([HOY, EN_3_DIAS]);
    });
  });

  /*
   * La misma fecha tiene que llamarse igual en la tarjeta, en el aviso de
   * "jornada cerrada" y en el de "Actualizar maestra" (ver
   * actualizar-muestra.service.spec). Todos salen de etiquetaDia().
   */
  describe('un solo nombre por fecha', () => {
    it('la tarjeta y el aviso usan el mismo nombre', () => {
      const e = evento(2, EN_3_DIAS);

      expect(component.diaRelativo(e)).toBe(etiquetaDia(EN_3_DIAS));
      expect(component.nombreDia(EN_3_DIAS)).toBe(component.diaRelativo(e));
    });
  });

  describe('sin jornadas que ofrecer', () => {
    const MENSAJE = 'No tienes un conteo asignado para hoy ni para los próximos días';

    it('sin eventos, el vacío habla de hoy y de los próximos días', () => {
      pintar([]);

      expect(texto(fixture.nativeElement)).toContain(MENSAJE);
    });

    it('con solo una jornada lejana pasa lo mismo', () => {
      pintar([evento(9, EN_20_DIAS)]);

      expect(nombresDeTarjetas()).toEqual([]);
      expect(texto(fixture.nativeElement)).toContain(MENSAJE);
    });

    it('con solo lo de ayer pasa lo mismo', () => {
      pintar([evento(1, AYER)]);

      expect(texto(fixture.nativeElement)).toContain(MENSAJE);
    });

    // Con la próxima jornada a la vista no hay vacío que explicar.
    it('si solo hay próxima jornada, no aparece el mensaje de vacío', () => {
      pintar([evento(2, EN_3_DIAS)]);

      expect(texto(fixture.nativeElement)).not.toContain('No tienes un conteo asignado');
    });
  });

  describe('aviso de jornada cerrada', () => {
    const DIA_CERRADO = sumarDias(HOY, -3);

    beforeEach(() => {
      jornadaCerrada.set(DIA_CERRADO);
      pintar([evento(1, HOY)]);
    });

    it('nombra la jornada como las tarjetas, no con la fecha cruda', () => {
      const aviso = texto(fixture.nativeElement.querySelector('.status-banner-warning'));

      expect(aviso).toContain(etiquetaDia(DIA_CERRADO));
      expect(aviso).not.toContain(DIA_CERRADO);
    });

    it('no manda a "la jornada de hoy": con la próxima a la vista sería falso', () => {
      const aviso = texto(fixture.nativeElement.querySelector('.status-banner-warning'));

      expect(aviso).toContain('Selecciona una jornada para seguir');
      expect(aviso).not.toContain('jornada de hoy');
    });

    it('sigue avisando que lo sin enviar no se manda', () => {
      const aviso = texto(fixture.nativeElement.querySelector('.status-banner-warning'));

      expect(aviso).toContain('ya no se envía');
    });
  });

  /*
   * El historial se corta con la MISMA regla que las tarjetas: si cortara en
   * hoy, el operador que sigue con la próxima jornada vería desaparecer lo que
   * ya finalizó.
   */
  describe('conteos realizados', () => {
    const seccion = (): string => {
      const rotulo = fixture.nativeElement.querySelector('.section-label') as HTMLElement | null;
      return texto(rotulo?.nextElementSibling ?? null);
    };

    it('incluye los de hoy y los de la próxima jornada', () => {
      finalizados.set([conResumen(evento(1, HOY)), conResumen(evento(2, EN_3_DIAS))]);
      pintar([evento(1, HOY), evento(2, EN_3_DIAS)]);

      expect(seccion()).toContain('EVENTO 1');
      expect(seccion()).toContain('EVENTO 2');
    });

    it('deja afuera lo de ayer', () => {
      finalizados.set([conResumen(evento(1, AYER)), conResumen(evento(2, HOY))]);
      pintar([evento(2, HOY)]);

      expect(seccion()).toContain('EVENTO 2');
      expect(seccion()).not.toContain('EVENTO 1');
    });

    /*
     * Con hoy y la próxima jornada finalizadas, el nombre solo no dice cuál es
     * cuál: cada conteo lleva el día, con el mismo nombre que las tarjetas.
     */
    describe('el día de cada conteo', () => {
      const insignias = (): HTMLElement[] => {
        const rotulo = fixture.nativeElement.querySelector('.section-label') as HTMLElement | null;
        const lista = rotulo?.nextElementSibling;
        return Array.from(lista?.querySelectorAll('.badge') ?? []) as HTMLElement[];
      };

      it('cada conteo lleva el día en que se hizo', () => {
        finalizados.set([conResumen(evento(1, HOY)), conResumen(evento(2, EN_3_DIAS))]);
        pintar([evento(1, HOY), evento(2, EN_3_DIAS)]);

        const dias = insignias().map((b) => texto(b));

        expect(dias.length).toBe(2);
        expect(dias).toContain('Hoy');
        expect(dias).toContain(etiquetaDia(EN_3_DIAS));
      });

      it('queda pegado al conteo correcto, no solo presente en la lista', () => {
        finalizados.set([conResumen(evento(1, HOY)), conResumen(evento(2, EN_3_DIAS))]);
        pintar([evento(1, HOY), evento(2, EN_3_DIAS)]);

        const rotulo = fixture.nativeElement.querySelector('.section-label') as HTMLElement;
        const tarjetas = Array.from(rotulo.nextElementSibling?.children ?? []) as HTMLElement[];
        const diaDe = (nombre: string): string =>
          texto(tarjetas.find((t) => texto(t).includes(nombre))?.querySelector('.badge') ?? null);

        expect(diaDe('EVENTO 1')).toBe('Hoy');
        expect(diaDe('EVENTO 2')).toBe(etiquetaDia(EN_3_DIAS));
      });

      it('se llama igual que en la tarjeta de la misma jornada', () => {
        finalizados.set([conResumen(evento(2, EN_3_DIAS))]);
        pintar([evento(2, EN_3_DIAS)]);

        const enTarjeta = texto(filas('Fecha programada')[0]?.querySelector('.badge') ?? null);

        expect(insignias().map((b) => texto(b))).toEqual([enTarjeta]);
        expect(enTarjeta).toMatch(NOMBRE_CORTO);
      });

      it('solo el conteo de hoy lleva el distintivo verde', () => {
        finalizados.set([conResumen(evento(1, HOY)), conResumen(evento(2, EN_3_DIAS))]);
        pintar([evento(1, HOY), evento(2, EN_3_DIAS)]);

        const verdes = insignias().filter((b) => b.classList.contains('badge-success'));

        expect(verdes.map((b) => texto(b))).toEqual(['Hoy']);
      });

      it('lo que queda fuera de la ventana no aparece, tampoco su día', () => {
        finalizados.set([conResumen(evento(1, AYER)), conResumen(evento(2, HOY))]);
        pintar([evento(2, HOY)]);

        expect(insignias().map((b) => texto(b))).toEqual(['Hoy']);
      });
    });

    it('deja afuera lo que está más allá del horizonte', () => {
      finalizados.set([conResumen(evento(9, EN_20_DIAS)), conResumen(evento(2, HOY))]);
      pintar([evento(2, HOY)]);

      expect(seccion()).not.toContain('EVENTO 9');
    });
  });

  /*
   * Entrar al Inicio es uno de los momentos en que la PDA reintenta sola los envíos
   * pendientes (ver ReintentoAutomaticoService).
   */
  describe('reintento automático de envíos', () => {
    it('al entrar al Inicio pide un reintento', () => {
      component.ionViewWillEnter();

      expect(reintento.disparar).toHaveBeenCalledTimes(1);
    });
  });
});
