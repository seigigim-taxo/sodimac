import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AgendasCargadas } from '../../application/zonificacion/cargar-agendas-zonificacion.use-case';
import { AgendaDeLista } from '../../domain/zonificacion/models/estado-agenda.model';
import { NetworkService } from '../../shared/services/network.service';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';
import { ZonificacionAgendasPage, filaDeAgenda } from './agendas.page';

const HOY = '2026-10-23';

const agenda = (extra: Partial<AgendaDeLista> = {}): AgendaDeLista => ({
  idAgenda: 3120,
  numeroAgenda: 'AG-20261023-1604-01',
  fechaAgenda: HOY,
  tienda: { idTienda: 78, codigoTienda: '1604', nombreTienda: 'HC TAXO' },
  codigoEstado: 'EN_CONTEO',
  operable: true,
  soloLectura: false,
  zonificacion: { estado: 'BORRADOR', cantidadZonas: 3, tagsZonificados: 11, tagsCapturados: 4 },
  ...extra,
});

describe('filaDeAgenda', () => {
  it('arma el título con el día, la tienda y el número de agenda', () => {
    const f = filaDeAgenda(agenda(), HOY);
    expect(f.titulo).toBe('Hoy');
    expect(f.tienda).toBe('HC TAXO');
    expect(f.numeroAgenda).toBe('AG-20261023-1604-01');
  });

  it('una agenda de otro día se llama por su fecha', () => {
    expect(filaDeAgenda(agenda({ fechaAgenda: '2026-10-26' }), HOY).titulo).toBe('Lun 26/10');
  });

  it('con capturas y sin confirmar el estado es "Pendiente en conteo" y el detalle cuenta rangos, TAG y capturados', () => {
    const f = filaDeAgenda(agenda(), HOY);
    expect(f.etiquetaEstado).toBe('Pendiente en conteo');
    expect(f.tono).toBe('aviso');
    expect(f.detalle).toBe('3 rangos · 11 TAG · 4 capturados');
  });

  it('un solo rango se dice en singular', () => {
    const f = filaDeAgenda(agenda({ zonificacion: { estado: 'BORRADOR', cantidadZonas: 1, tagsZonificados: 6, tagsCapturados: 0 } }), HOY);
    expect(f.detalle).toBe('1 rango · 6 TAG');
    expect(f.etiquetaEstado).toBe('Borrador');
  });

  it('sin zonificar no tiene detalle y se marca neutro', () => {
    const f = filaDeAgenda(agenda({ zonificacion: { estado: 'SIN_ZONIFICACION', cantidadZonas: 0, tagsZonificados: 0, tagsCapturados: 0 } }), HOY);
    expect(f.etiquetaEstado).toBe('Sin zonificar');
    expect(f.tono).toBe('neutro');
    expect(f.detalle).toBe('');
  });

  it('confirmada es verde', () => {
    const f = filaDeAgenda(agenda({ zonificacion: { estado: 'CONFIRMADA', cantidadZonas: 3, tagsZonificados: 11, tagsCapturados: 11 } }), HOY);
    expect(f.etiquetaEstado).toBe('Confirmada');
    expect(f.tono).toBe('ok');
  });

  it('dice por qué no se puede modificar', () => {
    expect(filaDeAgenda(agenda(), HOY).restriccion).toBeNull();
    expect(filaDeAgenda(agenda({ soloLectura: true }), HOY).restriccion).toBe('Solo lectura');
    expect(filaDeAgenda(agenda({ operable: false, codigoEstado: 'CERRADA' }), HOY).restriccion).toBe('Cerrada');
    expect(filaDeAgenda(agenda({ operable: false, codigoEstado: 'SUSPENDIDA' }), HOY).restriccion).toBe('Suspendida');
  });
});

describe('ZonificacionAgendasPage', () => {
  let fixture: ComponentFixture<ZonificacionAgendasPage>;
  let navigate: jasmine.Spy;
  let cargadas: ReturnType<typeof signal<AgendasCargadas | null>>;
  let cargando: ReturnType<typeof signal<boolean>>;
  let cargarAgendas: jasmine.Spy;

  const cargada = (agendas: AgendaDeLista[], extra: Partial<AgendasCargadas> = {}): AgendasCargadas => ({
    lista: { hoy: HOY, agendas },
    origen: 'SERVIDOR',
    fechaDescarga: null,
    error: null,
    ...extra,
  });

  beforeEach(async () => {
    cargadas = signal<AgendasCargadas | null>(null);
    cargando = signal(false);
    cargarAgendas = jasmine.createSpy('cargarAgendas').and.resolveTo();
    navigate = jasmine.createSpy('navigate');

    await TestBed.configureTestingModule({ imports: [ZonificacionAgendasPage] })
      .overrideComponent(ZonificacionAgendasPage, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .overrideProvider(Router, { useValue: { navigate } })
      .overrideProvider(NetworkService, { useValue: { isOnline: signal(true) } })
      .overrideProvider(ZonificacionFacade, { useValue: { agendas: cargadas, cargandoAgendas: cargando, cargarAgendas } })
      .compileComponents();

    fixture = TestBed.createComponent(ZonificacionAgendasPage);
  });

  const pintar = (): HTMLElement => {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const texto = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('al entrar descarga la lista', async () => {
    await fixture.componentInstance.ionViewWillEnter();
    expect(cargarAgendas).toHaveBeenCalledTimes(1);
  });

  it('muestra una tarjeta por agenda con su estado', () => {
    cargadas.set(cargada([agenda(), agenda({ idAgenda: 3151, numeroAgenda: 'AG-20261026-1604-01', fechaAgenda: '2026-10-26', zonificacion: { estado: 'SIN_ZONIFICACION', cantidadZonas: 0, tagsZonificados: 0, tagsCapturados: 0 } })]));

    const dom = pintar();

    const primera = dom.querySelector('[data-testid="agenda-3120"]');
    const segunda = dom.querySelector('[data-testid="agenda-3151"]');
    expect(texto(primera)).toContain('Hoy');
    expect(texto(primera)).toContain('Pendiente en conteo');
    expect(texto(primera)).toContain('HC TAXO · AG-20261023-1604-01');
    expect(texto(segunda)).toContain('Lun 26/10');
    expect(texto(segunda)).toContain('Sin zonificar');
    expect(texto(segunda)).toContain('Sin rangos todavía');
  });

  it('tocar una agenda abre su resumen', () => {
    cargadas.set(cargada([agenda()]));
    const dom = pintar();

    (dom.querySelector('[data-testid="agenda-3120"]') as HTMLElement).click();

    expect(navigate).toHaveBeenCalledOnceWith(['/zonificacion', 3120]);
  });

  it('recuerda que solo se muestran hoy y la siguiente jornada', () => {
    cargadas.set(cargada([agenda()]));
    expect(texto(pintar())).toContain('Solo se muestran hoy y la siguiente jornada.');
  });

  it('sin red muestra la última lista y avisa de cuándo es', () => {
    cargadas.set(cargada([agenda()], { origen: 'COPIA', fechaDescarga: '2026-10-23 08:15:00' }));

    const dom = pintar();

    expect(texto(dom.querySelector('[data-testid="aviso-copia"]'))).toContain('2026-10-23 08:15:00');
    expect(dom.querySelector('[data-testid="agenda-3120"]')).not.toBeNull();
  });

  it('con red no hay aviso de copia', () => {
    cargadas.set(cargada([agenda()]));
    expect(pintar().querySelector('[data-testid="aviso-copia"]')).toBeNull();
  });

  it('sin red y sin copia lo dice, sin inventar una lista vacía', () => {
    cargadas.set({ lista: null, origen: 'NINGUNO', fechaDescarga: null, error: new Error('x') });

    const dom = pintar();

    expect(dom.querySelector('[data-testid="sin-datos"]')).not.toBeNull();
    expect(dom.querySelector('[data-testid="sin-agendas"]')).toBeNull();
  });

  it('el servidor dice que no hay agendas asignadas: mensaje, no error', () => {
    cargadas.set(cargada([]));

    const dom = pintar();

    expect(texto(dom.querySelector('[data-testid="sin-agendas"]'))).toContain('No tienes agendas asignadas');
    expect(dom.querySelector('[data-testid="sin-datos"]')).toBeNull();
  });

  it('mientras carga por primera vez no muestra mensajes de vacío', () => {
    cargando.set(true);
    cargadas.set(null);

    const dom = pintar();

    expect(dom.querySelector('[data-testid="sin-agendas"]')).toBeNull();
    expect(dom.querySelector('[data-testid="sin-datos"]')).toBeNull();
  });

  it('una agenda de solo lectura lo indica', () => {
    cargadas.set(cargada([agenda({ soloLectura: true })]));
    expect(texto(pintar().querySelector('[data-testid="agenda-3120"]'))).toContain('Solo lectura');
  });
});
