import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { EstadoCargado } from '../../application/zonificacion/cargar-estado-zonificacion.use-case';
import { AgendaRef } from '../../application/zonificacion/resultado-accion';
import { ESTADO_V1_DATA } from '../../data/zonificacion/zonificacion.fixtures';
import { parsearRespuestaEstado } from '../../data/zonificacion/zonificacion.parser';
import { EstadoAgenda } from '../../domain/zonificacion/models/estado-agenda.model';
import { OperacionEnCola } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { aplicarPendientes } from '../../domain/zonificacion/utils/vista-con-pendientes.utils';
import { NetworkService } from '../../shared/services/network.service';
import { ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';
import { ZonificacionResumenPage, filaDeRechazo } from './resumen.page';

const op = (tipo: OperacionEnCola['tipo'], datos: Record<string, unknown>, extra: Partial<OperacionEnCola> = {}): OperacionEnCola => ({
  id: 1,
  operacionUid: `uid-${tipo}`,
  idAgenda: 2092,
  numeroAgenda: 'AG-20260909-4081-01',
  tipo,
  claveRango: null,
  datos,
  operadorLogin: 'o',
  operadorRut: '1',
  fechaHoraLocal: '2026-10-23 10:00:00',
  estado: 'PENDIENTE',
  error: null,
  mensajeError: null,
  intentos: 0,
  fechaCreacion: '2026-10-23 10:00:00',
  fechaUltimoIntento: null,
  ...extra,
});

describe('filaDeRechazo', () => {
  it('explica qué se intentó y por qué el servidor no lo aceptó', () => {
    const f = filaDeRechazo(op('GUARDAR_RANGO', {}, { id: 7, estado: 'RECHAZADO', error: { codigo: 'RANGO_CRUZADO', data: { con: { tag_desde: 1128, tag_hasta: 1131 } } } }));
    expect(f).toEqual({ id: 7, accion: 'Guardar un rango', motivo: 'El rango se cruza con otro (1128–1131).' });
  });

  it('sin código conocido usa el mensaje que mandó el servidor', () => {
    expect(filaDeRechazo(op('CONFIRMAR', {}, { estado: 'RECHAZADO', mensajeError: 'Algo raro' })).motivo).toBe('Algo raro');
  });

  it('sin nada, un mensaje general', () => {
    expect(filaDeRechazo(op('REABRIR', {}, { estado: 'RECHAZADO' })).motivo).toBe('El servidor la rechazó.');
  });
});

describe('ZonificacionResumenPage', () => {
  let fixture: ComponentFixture<ZonificacionResumenPage>;
  let navigate: jasmine.Spy;
  let cargado: ReturnType<typeof signal<EstadoCargado | null>>;
  let cargando: ReturnType<typeof signal<boolean>>;
  let agendaActual: ReturnType<typeof signal<AgendaRef | null>>;
  let facade: Record<string, unknown>;
  let idEnRuta: string;

  const base = (): EstadoAgenda => parsearRespuestaEstado(ESTADO_V1_DATA);

  const cargar = (estado: EstadoAgenda | null, cola: OperacionEnCola[] = [], extra: Partial<EstadoCargado> = {}): void => {
    cargado.set({ estado, vista: aplicarPendientes(estado, cola), origen: 'SERVIDOR', fechaDescarga: null, error: null, ...extra });
  };

  beforeEach(async () => {
    cargado = signal<EstadoCargado | null>(null);
    cargando = signal(false);
    agendaActual = signal<AgendaRef | null>({ idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01' });
    navigate = jasmine.createSpy('navigate');
    idEnRuta = '2092';
    facade = {
      agendas: signal({ lista: { hoy: '2026-09-09', agendas: [{ idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01' }] } }),
      agenda: agendaActual,
      estado: cargado,
      cargandoEstado: cargando,
      abrirAgenda: jasmine.createSpy('abrirAgenda').and.resolveTo(),
      refrescarEstado: jasmine.createSpy('refrescarEstado').and.resolveTo(),
      descartarRechazada: jasmine.createSpy('descartarRechazada').and.resolveTo(),
    };

    await TestBed.configureTestingModule({ imports: [ZonificacionResumenPage] })
      .overrideComponent(ZonificacionResumenPage, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } })
      .overrideProvider(Router, { useValue: { navigate } })
      .overrideProvider(ActivatedRoute, { useValue: { snapshot: { paramMap: { get: () => idEnRuta } } } })
      .overrideProvider(NetworkService, { useValue: { isOnline: signal(true) } })
      .overrideProvider(ZonificacionFacade, { useValue: facade })
      .compileComponents();

    fixture = TestBed.createComponent(ZonificacionResumenPage);
  });

  const pintar = (): HTMLElement => {
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };
  const texto = (el: Element | null): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const dom = (id: string, raiz: HTMLElement) => raiz.querySelector(`[data-testid="${id}"]`);

  describe('al entrar', () => {
    it('abre la agenda de la ruta con el número que sale de la lista descargada', async () => {
      await fixture.componentInstance.ionViewWillEnter();
      expect(facade['abrirAgenda']).toHaveBeenCalledOnceWith({ idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01' });
    });

    it('una agenda que no está en la lista ni es la abierta vuelve a la lista', async () => {
      idEnRuta = '999';
      await fixture.componentInstance.ionViewWillEnter();
      expect(navigate).toHaveBeenCalledOnceWith(['/zonificacion'], { replaceUrl: true });
      expect(facade['abrirAgenda']).not.toHaveBeenCalled();
    });

    it('si ya es la agenda abierta (se volvió de otra pantalla) solo refresca', async () => {
      idEnRuta = '2092';
      (facade['agendas'] as ReturnType<typeof signal>).set(null);
      await fixture.componentInstance.ionViewWillEnter();
      expect(facade['refrescarEstado']).toHaveBeenCalledTimes(1);
    });
  });

  describe('lo que se ve', () => {
    it('el estado de la agenda, los tres totales y el avance del conteo', () => {
      cargar(base());

      const d = pintar();

      expect(texto(dom('estado', d))).toBe('Borrador');
      expect(texto(dom('zonificados', d))).toBe(String(base().rangos.reduce((s, r) => s + (r.tagHasta - r.tagDesde + 1), 0)));
      expect(texto(dom('usados', d))).toBe('0');
      expect(texto(d)).toContain('Avance del conteo');
    });

    it('una fila por rango, con zona, TAG, referencia y usados', () => {
      cargar(base());

      const fila = dom('rango-758', pintar());

      expect(texto(fila)).toContain('ALTILLO');
      expect(texto(fila)).toContain('1128–1131 · P48');
      expect(texto(fila)).toContain('0 de 4 usados');
    });

    it('el título lleva el número de agenda', () => {
      cargar(base());
      pintar();
      expect(fixture.componentInstance.titulo()).toBe('Agenda AG-20260909-4081-01');
    });

    it('sin rangos lo dice', () => {
      cargar({ ...base(), rangos: [] });
      expect(dom('sin-rangos', pintar())).not.toBeNull();
    });
  });

  describe('lo que todavía no salió', () => {
    it('un rango nuevo se ve de inmediato, marcado "Pendiente de envío"', () => {
      cargar(base(), [op('GUARDAR_RANGO', { id_zonificacion_det: null, codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140, referencia_ubicacion: 'P49' })]);

      const d = pintar();

      expect(texto(dom('rango-uid-GUARDAR_RANGO', d))).toContain('Pendiente de envío');
      expect(texto(dom('rango-uid-GUARDAR_RANGO', d))).toContain('1135–1140 · P49');
      expect(texto(dom('pendientes', d))).toContain('1 cambio sin enviar');
    });

    it('varios cambios se cuentan en plural', () => {
      cargar(base(), [
        op('GUARDAR_RANGO', { id_zonificacion_det: null, codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140 }),
        op('ELIMINAR_RANGO', { id_zonificacion_det: 761 }, { operacionUid: 'uid-2', id: 2 }),
      ]);
      expect(texto(dom('pendientes', pintar()))).toContain('2 cambios sin enviar');
    });

    it('un rango eliminado pendiente desaparece de la lista', () => {
      cargar(base(), [op('ELIMINAR_RANGO', { id_zonificacion_det: 758 })]);
      expect(dom('rango-758', pintar())).toBeNull();
    });

    it('una confirmación pendiente se avisa y el estado ya es Confirmada', () => {
      cargar(base(), [op('CONFIRMAR', {})]);

      const d = pintar();

      expect(dom('confirmacion-pendiente', d)).not.toBeNull();
      expect(texto(dom('estado', d))).toBe('Confirmada');
    });

    it('sin nada pendiente no hay avisos de envío', () => {
      cargar(base());
      const d = pintar();
      expect(dom('pendientes', d)).toBeNull();
      expect(dom('confirmacion-pendiente', d)).toBeNull();
    });
  });

  describe('lo que el servidor rechazó', () => {
    const rechazada = op('GUARDAR_RANGO', {}, { id: 7, estado: 'RECHAZADO', error: { codigo: 'ZONIFICACION_CONFIRMADA', data: {} } });

    it('se muestra con qué se intentó y el motivo en palabras', () => {
      cargar(base(), [rechazada]);

      const aviso = dom('rechazo-7', pintar());

      expect(texto(aviso)).toContain('Guardar un rango');
      expect(texto(aviso)).toContain('La zonificación está confirmada. Reábrela para editarla.');
    });

    it('descartarla le pide al facade quitarla de la cola', () => {
      cargar(base(), [rechazada]);
      const d = pintar();

      (dom('rechazo-7', d)!.querySelector('ion-button') as HTMLElement).click();

      expect(facade['descartarRechazada']).toHaveBeenCalledOnceWith(7);
    });

    it('lo rechazado no cuenta como cambio sin enviar', () => {
      cargar(base(), [rechazada]);
      expect(dom('pendientes', pintar())).toBeNull();
    });
  });

  describe('avisos del estado', () => {
    it('TAG usados fuera de zonificación, con el total y ejemplos, y el estado pide ajuste', () => {
      const e = base();
      cargar({ ...e, tagsFuera: { total: 3, ejemplos: [1150, 1151, 1152] } });

      const d = pintar();

      expect(texto(dom('tags-fuera', d))).toContain('3 TAG usados quedaron fuera');
      expect(texto(dom('tags-fuera', d))).toContain('1150, 1151, 1152');
      expect(texto(dom('estado', d))).toBe('Requiere ajuste');
    });

    it('con TAG usados por el conteo el estado es "Pendiente en conteo"', () => {
      const e = base();
      cargar({ ...e, resumen: { ...e.resumen, tagsUsados: 4 } });
      expect(texto(dom('estado', pintar()))).toBe('Pendiente en conteo');
    });

    it('agenda de solo lectura o cerrada lo explica', () => {
      const e = base();
      cargar({ ...e, agenda: { ...e.agenda, soloLectura: true } });
      expect(texto(dom('restriccion', pintar()))).toContain('Solo lectura');

      cargar({ ...e, agenda: { ...e.agenda, operable: false, codigoEstado: 'CERRADA' } });
      fixture.detectChanges();
      expect(texto(dom('restriccion', fixture.nativeElement))).toContain('cerrada');
    });

    it('lista los TAG anulados, y marca el que aún no salió', () => {
      cargar(base(), [op('ANULAR_TAG', { numero_tag: 1129, motivo: 'etiqueta rota' })]);

      const t = texto(pintar());

      expect(t).toContain('TAG anulados');
      expect(t).toContain('1129');
      expect(t).toContain('etiqueta rota');
    });
  });

  describe('sin red', () => {
    it('muestra la última copia y avisa de cuándo es', () => {
      cargar(base(), [], { origen: 'COPIA', fechaDescarga: '2026-10-23 08:15:00' });
      expect(texto(dom('aviso-copia', pintar()))).toContain('2026-10-23 08:15:00');
    });

    it('sin copia ni nada pendiente dice que la agenda no se descargó', () => {
      cargar(null, [], { origen: 'NINGUNO' });
      expect(dom('sin-datos', pintar())).not.toBeNull();
    });

    it('sin copia pero con un rango pendiente igual se ve lo que hizo el operador', () => {
      cargar(null, [op('GUARDAR_RANGO', { id_zonificacion_det: null, codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140 })], { origen: 'NINGUNO' });

      const d = pintar();

      expect(dom('sin-datos', d)).toBeNull();
      expect(dom('rango-uid-GUARDAR_RANGO', d)).not.toBeNull();
    });
  });
});
