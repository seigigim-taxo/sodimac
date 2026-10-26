import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { CatalogoCargado } from '../../application/zonificacion/cargar-catalogo-zonificacion.use-case';
import { EstadoCargado } from '../../application/zonificacion/cargar-estado-zonificacion.use-case';
import { AgendaRef, ResultadoAccion } from '../../application/zonificacion/resultado-accion';
import { ESTADO_V1_DATA } from '../../data/zonificacion/zonificacion.fixtures';
import { parsearRespuestaEstado } from '../../data/zonificacion/zonificacion.parser';
import { CATALOGO_V1 } from '../../domain/zonificacion/utils/reglas-zonificacion.fixtures';
import { aplicarPendientes } from '../../domain/zonificacion/utils/vista-con-pendientes.utils';
import { NetworkService } from '../../shared/services/network.service';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';
import { ZonificacionAnularTagPage } from './anular-tag.page';

const AGENDA: AgendaRef = { idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01' };
const evento = (value: string): Event => new CustomEvent('ionInput', { detail: { value } });

describe('ZonificacionAnularTagPage', () => {
  let fixture: ComponentFixture<ZonificacionAnularTagPage>;
  let page: ZonificacionAnularTagPage;
  let navigate: jasmine.Spy;
  let anularTag: jasmine.Spy;
  let estado: ReturnType<typeof signal<EstadoCargado | null>>;
  let catalogo: ReturnType<typeof signal<CatalogoCargado | null>>;
  let idEnRuta: string;

  beforeEach(async () => {
    navigate = jasmine.createSpy('navigate').and.resolveTo(true);
    anularTag = jasmine.createSpy('anularTag').and.resolveTo({ ok: true } as ResultadoAccion);
    const e = parsearRespuestaEstado(ESTADO_V1_DATA);
    estado = signal<EstadoCargado | null>({ estado: e, vista: aplicarPendientes(e, []), origen: 'SERVIDOR', fechaDescarga: null, error: null });
    catalogo = signal<CatalogoCargado | null>({ catalogo: CATALOGO_V1, origen: 'SERVIDOR', fechaDescarga: null });
    idEnRuta = '2092';

    await TestBed.configureTestingModule({ imports: [ZonificacionAnularTagPage] })
      .overrideComponent(ZonificacionAnularTagPage, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .overrideProvider(Router, { useValue: { navigate } })
      .overrideProvider(ActivatedRoute, { useValue: { snapshot: { paramMap: { get: () => idEnRuta } } } })
      .overrideProvider(NetworkService, { useValue: { isOnline: signal(true) } })
      .overrideProvider(ZonificacionFacade, { useValue: { agenda: signal(AGENDA), estado, catalogo, anularTag } })
      .compileComponents();

    fixture = TestBed.createComponent(ZonificacionAnularTagPage);
    page = fixture.componentInstance;
    page.ionViewWillEnter();
  });

  const pintar = (): HTMLElement => {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const texto = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const el = (d: HTMLElement, id: string) => d.querySelector(`[data-testid="${id}"]`);

  it('sin la agenda abierta vuelve a la lista', () => {
    navigate.calls.reset();
    idEnRuta = '999';
    page.ionViewWillEnter();
    expect(navigate).toHaveBeenCalledOnceWith(['/zonificacion'], { replaceUrl: true });
  });

  it('parte vacío y sin poder anular', () => {
    const d = pintar();

    expect(page.puedeAnular()).toBeFalse();
    expect(el(d, 'rango')).toBeNull();
    expect(texto(el(d, 'contador'))).toBe('0 caracteres · mínimo 10');
  });

  it('con un TAG de un rango dice en cuál está y cuánto baja', () => {
    page.onNumero(evento('1129'));

    const d = pintar();

    expect(texto(el(d, 'rango'))).toContain('ALTILLO');
    expect(texto(el(d, 'rango'))).toContain('Rango 1128–1131 · baja de 4 a 3 TAG');
  });

  it('cuenta los caracteres del motivo', () => {
    page.onMotivo(evento('No se encontró en la tienda'));
    expect(texto(el(pintar(), 'contador'))).toBe('27 caracteres · mínimo 10');
  });

  it('un TAG que no está en ningún rango se avisa', () => {
    page.onNumero(evento('2500'));
    page.onMotivo(evento('No se encontró en la tienda'));

    expect(texto(el(pintar(), 'error-numero'))).toBe('El TAG 2500 no pertenece a ningún rango de esta agenda.');
    expect(page.puedeAnular()).toBeFalse();
  });

  it('un motivo corto avisa en rojo y no deja anular', () => {
    page.onNumero(evento('1129'));
    page.onMotivo(evento('rota'));

    pintar();

    expect(page.evaluacion()?.errorMotivo).toBe('El motivo debe tener al menos 10 caracteres.');
    expect(page.puedeAnular()).toBeFalse();
  });

  it('sin catálogo no deja anular (no se sabe el mínimo del motivo)', () => {
    catalogo.set({ catalogo: null, origen: 'NINGUNO', fechaDescarga: null });
    page.onNumero(evento('1129'));
    page.onMotivo(evento('No se encontró en la tienda'));

    expect(el(pintar(), 'sin-catalogo')).not.toBeNull();
    expect(page.puedeAnular()).toBeFalse();
  });

  describe('anular', () => {
    beforeEach(() => {
      page.onNumero(evento('1129'));
      page.onMotivo(evento('No se encontró en la tienda'));
    });

    it('manda el TAG y el motivo y vuelve al resumen', async () => {
      expect(page.puedeAnular()).toBeTrue();

      await page.anular();

      expect(anularTag).toHaveBeenCalledOnceWith(AGENDA, 1129, 'No se encontró en la tienda');
      expect(navigate).toHaveBeenCalledWith(['/zonificacion', 2092], { replaceUrl: true });
    });

    it('si se rechaza, se queda y explica por qué', async () => {
      anularTag.and.resolveTo({ ok: false, codigo: 'TAG_YA_ANULADO', data: { numero_tag: 1129 } });

      await page.anular();

      expect(navigate).not.toHaveBeenCalled();
      expect(texto(el(pintar(), 'error-anular'))).toBe('Ese TAG ya está anulado.');
    });

    it('no anula dos veces si se aprieta de nuevo', async () => {
      let liberar!: (r: ResultadoAccion) => void;
      anularTag.and.returnValue(new Promise<ResultadoAccion>((ok) => (liberar = ok)));

      const primero = page.anular();
      await page.anular();
      liberar({ ok: true });
      await primero;

      expect(anularTag).toHaveBeenCalledTimes(1);
    });

    it('Cancelar vuelve sin anular', async () => {
      await page.volver();
      expect(anularTag).not.toHaveBeenCalled();
      expect(navigate).toHaveBeenCalledWith(['/zonificacion', 2092], { replaceUrl: true });
    });
  });
});
