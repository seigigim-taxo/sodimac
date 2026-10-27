import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RechazoZonificacion } from '../../application/zonificacion/listar-rechazadas-zonificacion.use-case';
import { NetworkService } from '../../shared/services/network.service';
import { hoySql, sumarDias } from '../../shared/utils/fecha.utils';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';
import { ZonificacionRechazadosPage, cuandoSeHizo } from './rechazados.page';

const HOY = hoySql();

const rechazo = (extra: Partial<RechazoZonificacion> = {}): RechazoZonificacion => ({
  id: 1,
  idAgenda: 3120,
  numeroAgenda: 'AG-20261023-1604-01',
  titulo: 'Guardar rango 1138–1145',
  etiqueta: 'Cruce',
  motivo: 'El rango se cruza con otro (1135–1140).',
  fechaHoraLocal: `${HOY} 10:42:00`,
  ...extra,
});

describe('cuandoSeHizo', () => {
  it('hoy y mañana se llaman así, con la hora sin segundos', () => {
    expect(cuandoSeHizo(`${HOY} 10:42:07`)).toBe('Hoy 10:42');
    expect(cuandoSeHizo(`${sumarDias(HOY, 1)} 08:00:00`)).toBe('Mañana 08:00');
  });

  it('otro día lleva el día de la semana y la fecha corta', () => {
    expect(cuandoSeHizo('2026-10-26 09:15:00', '2026-10-23')).toBe('Lun 26/10 09:15');
  });
});

describe('ZonificacionRechazadosPage', () => {
  let fixture: ComponentFixture<ZonificacionRechazadosPage>;
  let rechazos: ReturnType<typeof signal<RechazoZonificacion[]>>;
  let facade: { rechazos: typeof rechazos; cargarRechazos: jasmine.Spy; descartarRechazo: jasmine.Spy; descartarTodasLasRechazadas: jasmine.Spy };

  beforeEach(async () => {
    rechazos = signal<RechazoZonificacion[]>([]);
    facade = {
      rechazos,
      cargarRechazos: jasmine.createSpy('cargarRechazos').and.resolveTo(),
      descartarRechazo: jasmine.createSpy('descartarRechazo').and.resolveTo(),
      descartarTodasLasRechazadas: jasmine.createSpy('descartarTodasLasRechazadas').and.resolveTo(),
    };

    await TestBed.configureTestingModule({ imports: [ZonificacionRechazadosPage] })
      .overrideComponent(ZonificacionRechazadosPage, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .overrideProvider(NetworkService, { useValue: { isOnline: signal(true) } })
      .overrideProvider(ZonificacionFacade, { useValue: facade })
      .compileComponents();

    fixture = TestBed.createComponent(ZonificacionRechazadosPage);
  });

  const pintar = (): HTMLElement => {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const texto = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const dom = (d: HTMLElement, id: string) => d.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;

  it('al entrar carga los rechazados', async () => {
    await fixture.componentInstance.ionViewWillEnter();
    expect(facade.cargarRechazos).toHaveBeenCalledTimes(1);
  });

  it('recuerda que descartar solo los quita de esta PDA', () => {
    expect(texto(pintar())).toContain('Descartarlos solo los quita de esta PDA. No cambia nada en el SGO.');
  });

  it('sin rechazados lo dice y no ofrece descartar', () => {
    const d = pintar();
    expect(dom(d, 'sin-rechazos')).not.toBeNull();
    expect(dom(d, 'descartar-todas')).toBeNull();
  });

  it('cada rechazo dice qué se intentó, en qué agenda y cuándo, la etiqueta y el motivo', () => {
    rechazos.set([rechazo()]);

    const t = texto(dom(pintar(), 'rechazo-1'));

    expect(t).toContain('Guardar rango 1138–1145');
    expect(t).toContain('Agenda AG-20261023-1604-01 · Hoy 10:42');
    expect(t).toContain('Cruce');
    expect(t).toContain('El rango se cruza con otro (1135–1140).');
  });

  it('descartar uno lo pide por su id', () => {
    rechazos.set([rechazo({ id: 7 }), rechazo({ id: 8 })]);
    const d = pintar();

    (dom(d, 'rechazo-7')!.querySelector('[data-testid="descartar"]') as HTMLElement).click();

    expect(facade.descartarRechazo).toHaveBeenCalledOnceWith(7);
  });

  it('con más de uno, "Descartar todos"; con uno solo no hace falta', () => {
    rechazos.set([rechazo({ id: 7 })]);
    expect(dom(pintar(), 'descartar-todas')).toBeNull();

    rechazos.set([rechazo({ id: 7 }), rechazo({ id: 8 })]);
    fixture.detectChanges();
    const boton = dom(fixture.nativeElement, 'descartar-todas')!;
    boton.click();

    expect(facade.descartarTodasLasRechazadas).toHaveBeenCalledTimes(1);
  });

  it('un rechazo de otra agenda se distingue por su número', () => {
    rechazos.set([rechazo({ id: 1 }), rechazo({ id: 2, numeroAgenda: 'AG-20261026-1604-01' })]);
    const d = pintar();
    expect(texto(dom(d, 'rechazo-2'))).toContain('AG-20261026-1604-01');
  });
});
