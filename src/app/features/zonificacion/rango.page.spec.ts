import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { EstadoCargado } from '../../application/zonificacion/cargar-estado-zonificacion.use-case';
import { AgendaRef, ResultadoAccion } from '../../application/zonificacion/resultado-accion';
import { ESTADO_V1_DATA } from '../../data/zonificacion/zonificacion.fixtures';
import { parsearRespuestaEstado } from '../../data/zonificacion/zonificacion.parser';
import { CatalogoCargado } from '../../application/zonificacion/cargar-catalogo-zonificacion.use-case';
import { CatalogoZonificacion } from '../../domain/zonificacion/models/catalogo-zonificacion.model';
import { CATALOGO_V1 } from '../../domain/zonificacion/utils/reglas-zonificacion.fixtures';
import { aplicarPendientes } from '../../domain/zonificacion/utils/vista-con-pendientes.utils';
import { NetworkService } from '../../shared/services/network.service';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';
import { ZonificacionRangoPage } from './rango.page';

const AGENDA: AgendaRef = { idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01' };
const evento = (value: string): Event => new CustomEvent('ionInput', { detail: { value } });

describe('ZonificacionRangoPage', () => {
  let fixture: ComponentFixture<ZonificacionRangoPage>;
  let page: ZonificacionRangoPage;
  let navigate: jasmine.Spy;
  let guardarRango: jasmine.Spy;
  let estado: ReturnType<typeof signal<EstadoCargado | null>>;
  let agenda: ReturnType<typeof signal<AgendaRef | null>>;
  let catalogo: ReturnType<typeof signal<CatalogoCargado | null>>;
  let idEnRuta: string;
  let rangoEnRuta: string | null;

  const cargar = (cat: CatalogoZonificacion | null = CATALOGO_V1): void => {
    const e = parsearRespuestaEstado(ESTADO_V1_DATA);
    estado.set({ estado: e, vista: aplicarPendientes(e, []), origen: 'SERVIDOR', fechaDescarga: null, error: null });
    catalogo.set({ catalogo: cat, origen: 'SERVIDOR', fechaDescarga: null });
  };

  beforeEach(async () => {
    navigate = jasmine.createSpy('navigate').and.resolveTo(true);
    guardarRango = jasmine.createSpy('guardarRango').and.resolveTo({ ok: true } as ResultadoAccion);
    estado = signal<EstadoCargado | null>(null);
    agenda = signal<AgendaRef | null>(AGENDA);
    catalogo = signal<CatalogoCargado | null>(null);
    idEnRuta = '2092';
    rangoEnRuta = null;

    await TestBed.configureTestingModule({ imports: [ZonificacionRangoPage] })
      .overrideComponent(ZonificacionRangoPage, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .overrideProvider(Router, { useValue: { navigate } })
      .overrideProvider(ActivatedRoute, {
        useValue: { snapshot: { paramMap: { get: () => idEnRuta }, queryParamMap: { get: () => rangoEnRuta } } },
      })
      .overrideProvider(NetworkService, { useValue: { isOnline: signal(true) } })
      .overrideProvider(ZonificacionFacade, { useValue: { agenda, estado, catalogo, guardarRango } })
      .compileComponents();

    fixture = TestBed.createComponent(ZonificacionRangoPage);
    page = fixture.componentInstance;
  });

  const pintar = (): HTMLElement => {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const texto = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const el = (d: HTMLElement, id: string) => d.querySelector(`[data-testid="${id}"]`);
  const escribir = (desde: string, hasta: string, referencia = ''): void => {
    page.onDesde(evento(desde));
    page.onHasta(evento(hasta));
    page.onReferencia(evento(referencia));
  };

  describe('al entrar', () => {
    it('sin la agenda abierta vuelve a la lista', () => {
      cargar();
      idEnRuta = '999';
      page.ionViewWillEnter();
      expect(navigate).toHaveBeenCalledOnceWith(['/zonificacion'], { replaceUrl: true });
    });

    it('sin estado descargado vuelve a la lista', () => {
      page.ionViewWillEnter();
      expect(navigate).toHaveBeenCalledOnceWith(['/zonificacion'], { replaceUrl: true });
    });

    it('un rango nuevo parte con los campos vacíos y el título "Nuevo rango"', () => {
      cargar();
      page.ionViewWillEnter();
      pintar();

      expect(page.titulo()).toBe('Nuevo rango');
      expect([page.desde(), page.hasta(), page.referencia()]).toEqual(['', '', '']);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('editar carga los datos del rango y cambia el título', () => {
      cargar();
      rangoEnRuta = '758';

      page.ionViewWillEnter();

      expect(page.titulo()).toBe('Editar rango');
      expect([page.desde(), page.hasta(), page.referencia()]).toEqual(['1128', '1131', 'P48']);
      expect(page.idRango()).toBe(758);
    });
  });

  describe('mientras escribe', () => {
    beforeEach(() => {
      cargar();
      page.ionViewWillEnter();
    });

    it('con el primer TAG ya detecta la zona y muestra su banda', () => {
      page.onDesde(evento('1135'));

      const d = pintar();

      expect(texto(el(d, 'zona-nombre'))).toBe('ALTILLO');
      expect(texto(el(d, 'banda'))).toBe('Rango permitido: 1000–2999');
      expect(texto(el(d, 'cantidad'))).toBe('—');
    });

    it('con los dos TAG calcula la cantidad y deja guardar', () => {
      escribir('1135', '1140', 'P49');

      const d = pintar();

      expect(texto(el(d, 'cantidad'))).toBe('6 TAG');
      expect(page.puedeGuardar()).toBeTrue();
    });

    it('un cruce muestra el aviso con el rango y NO deja guardar', () => {
      escribir('1130', '1135');

      const d = pintar();

      expect(texto(el(d, 'bloqueo'))).toBe('El rango se cruza con otro (1128–1131).');
      expect(page.puedeGuardar()).toBeFalse();
    });

    it('un primer TAG sin zona se señala en su campo', () => {
      escribir('999', '1010');
      expect(texto(el(pintar(), 'error-desde'))).toContain('no pertenece a ninguna zona');
    });

    it('un último TAG en otra zona se señala en su campo, con la banda permitida', () => {
      escribir('2990', '3001');
      expect(texto(el(pintar(), 'error-hasta'))).toBe('El TAG final queda fuera de la zona: debe estar entre 1000 y 2999.');
    });

    it('avisa cuando la agenda ya tiene TAG usados por el conteo', () => {
      const e = parsearRespuestaEstado(ESTADO_V1_DATA);
      estado.set({ estado: { ...e, resumen: { ...e.resumen, tagsUsados: 4 } }, vista: aplicarPendientes(e, []), origen: 'SERVIDOR', fechaDescarga: null, error: null });

      expect(texto(el(pintar(), 'aviso-usados'))).toContain('4 TAG utilizados');
    });

    it('cantidad alta (umbral del catálogo): avisa y deja guardar', () => {
      cargar({ ...CATALOGO_V1, parametros: { ...CATALOGO_V1.parametros, cantidadAdvertencia: 3 } });
      escribir('1135', '1140');

      const d = pintar();

      expect(texto(el(d, 'advertencia'))).toBe('Son 6 TAG. Revisa que el último TAG sea correcto.');
      expect(page.puedeGuardar()).toBeTrue();
    });

    it('sin catálogo lo dice y no muestra el formulario', () => {
      cargar(null);
      const d = pintar();

      expect(el(d, 'sin-catalogo')).not.toBeNull();
      expect(el(d, 'desde')).toBeNull();
    });
  });

  describe('guardar', () => {
    beforeEach(() => {
      cargar();
      page.ionViewWillEnter();
    });

    it('un rango nuevo manda la zona detectada y vuelve al resumen', async () => {
      escribir('1135', '1140', 'P49');

      await page.guardar();

      expect(guardarRango).toHaveBeenCalledOnceWith({
        agenda: AGENDA,
        idRango: null,
        codigoZona: 'ALTILLO',
        tagDesde: 1135,
        tagHasta: 1140,
        referenciaUbicacion: 'P49',
      });
      expect(navigate).toHaveBeenCalledWith(['/zonificacion', 2092], { replaceUrl: true });
    });

    it('una referencia en blanco se manda como nula', async () => {
      escribir('1135', '1140', '   ');
      await page.guardar();
      expect(guardarRango.calls.mostRecent().args[0].referenciaUbicacion).toBeNull();
    });

    it('editar manda el id del rango', async () => {
      rangoEnRuta = '758';
      page.ionViewWillEnter();
      page.onReferencia(evento('P50'));

      await page.guardar();

      expect(guardarRango.calls.mostRecent().args[0]).toEqual(jasmine.objectContaining({ idRango: 758, referenciaUbicacion: 'P50' }));
    });

    it('no guarda si el formulario no es válido', async () => {
      escribir('1130', '1135');
      await page.guardar();
      expect(guardarRango).not.toHaveBeenCalled();
    });

    it('si el caso de uso lo rechaza, se queda en la pantalla y explica por qué', async () => {
      guardarRango.and.resolveTo({ ok: false, codigo: 'RANGO_EN_ENVIO', data: {} });
      escribir('1135', '1140');

      await page.guardar();

      expect(navigate).not.toHaveBeenCalled();
      expect(texto(el(pintar(), 'error-guardar'))).toBe('El rango se está enviando. Intenta de nuevo en un momento.');
      expect(page.guardando()).toBeFalse();
    });

    it('apretar dos veces no guarda dos veces', async () => {
      escribir('1135', '1140');
      let liberar!: (r: ResultadoAccion) => void;
      guardarRango.and.returnValue(new Promise<ResultadoAccion>((ok) => (liberar = ok)));

      const primero = page.guardar();
      await page.guardar();
      liberar({ ok: true });
      await primero;

      expect(guardarRango).toHaveBeenCalledTimes(1);
    });

    it('al escribir de nuevo se borra el error anterior', async () => {
      guardarRango.and.resolveTo({ ok: false, codigo: 'RANGO_EN_ENVIO', data: {} });
      escribir('1135', '1140');
      await page.guardar();

      page.onHasta(evento('1141'));

      expect(page.errorGuardar()).toBeNull();
    });

    it('Enter en el primer TAG pone el cursor en el segundo (el escáner termina cada TAG con Enter)', () => {
      jasmine.clock().install();
      try {
        const setFocus = jasmine.createSpy('setFocus');
        page.hastaEl = { nativeElement: { setFocus } } as never;

        page.enterEnDesde();
        jasmine.clock().tick(100);

        expect(setFocus).toHaveBeenCalledTimes(1);
      } finally {
        jasmine.clock().uninstall();
      }
    });

    it('Enter en el segundo TAG guarda si se puede', async () => {
      escribir('1135', '1140');
      page.enterEnHasta();
      await Promise.resolve();
      expect(guardarRango).toHaveBeenCalledTimes(1);
    });

    it('Enter en el segundo TAG no guarda si falta algo', () => {
      escribir('1135', '');
      page.enterEnHasta();
      expect(guardarRango).not.toHaveBeenCalled();
    });

    it('Cancelar vuelve al resumen sin guardar', async () => {
      await page.volver();
      expect(navigate).toHaveBeenCalledWith(['/zonificacion', 2092], { replaceUrl: true });
      expect(guardarRango).not.toHaveBeenCalled();
    });
  });
});
