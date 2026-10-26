import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ActionSheetController, AlertController } from '@ionic/angular/standalone';
import { EstadoCargado } from '../../application/zonificacion/cargar-estado-zonificacion.use-case';
import { AgendaRef } from '../../application/zonificacion/resultado-accion';
import { ESTADO_V1_DATA } from '../../data/zonificacion/zonificacion.fixtures';
import { parsearRespuestaEstado } from '../../data/zonificacion/zonificacion.parser';
import { EstadoAgenda } from '../../domain/zonificacion/models/estado-agenda.model';
import { OperacionEnCola } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { aplicarPendientes } from '../../domain/zonificacion/utils/vista-con-pendientes.utils';
import { NetworkService } from '../../shared/services/network.service';
import { MensajeZonificacion, ZonificacionFacade } from '../../state/zonificacion/zonificacion.facade';
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
  let mensajePendiente: MensajeZonificacion | null;
  let hoja: { create: jasmine.Spy; creada: { present: jasmine.Spy } };
  let alerta: { create: jasmine.Spy; creada: { present: jasmine.Spy } };

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
    mensajePendiente = null;
    hoja = { creada: { present: jasmine.createSpy('present').and.resolveTo() }, create: jasmine.createSpy('create') };
    hoja.create.and.callFake(async () => hoja.creada);
    alerta = { creada: { present: jasmine.createSpy('present').and.resolveTo() }, create: jasmine.createSpy('create') };
    alerta.create.and.callFake(async () => alerta.creada);
    facade = {
      consumirMensaje: () => {
        const m = mensajePendiente;
        mensajePendiente = null;
        return m;
      },
      eliminarRango: jasmine.createSpy('eliminarRango').and.resolveTo({ ok: true }),
      confirmarZonificacion: jasmine.createSpy('confirmarZonificacion').and.resolveTo({ ok: true }),
      reabrirZonificacion: jasmine.createSpy('reabrirZonificacion').and.resolveTo({ ok: true }),
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
      .overrideProvider(ActionSheetController, { useValue: hoja })
      .overrideProvider(AlertController, { useValue: alerta })
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

  describe('acciones', () => {
    it('con la agenda editable ofrece "Nuevo rango" y "Anular TAG"', () => {
      cargar(base());
      const d = pintar();
      expect(dom('nuevo-rango', d)).not.toBeNull();
      expect(dom('anular-tag', d)).not.toBeNull();
    });

    it('"Nuevo rango" y "Anular TAG" llevan a su pantalla', () => {
      cargar(base());
      const d = pintar();

      (dom('nuevo-rango', d) as HTMLElement).click();
      (dom('anular-tag', d) as HTMLElement).click();

      expect(navigate).toHaveBeenCalledWith(['/zonificacion', 2092, 'rango']);
      expect(navigate).toHaveBeenCalledWith(['/zonificacion', 2092, 'anular']);
    });

    it('sin rangos no hay nada que anular: solo "Nuevo rango"', () => {
      cargar({ ...base(), rangos: [] });
      const d = pintar();
      expect(dom('nuevo-rango', d)).not.toBeNull();
      expect(dom('anular-tag', d)).toBeNull();
    });

    it('confirmada: solo se puede anular TAG (para editar rangos hay que reabrir)', () => {
      const e = base();
      cargar({ ...e, zonificacion: { ...e.zonificacion, estado: 'CONFIRMADA' } });
      const d = pintar();
      expect(dom('nuevo-rango', d)).toBeNull();
      expect(dom('anular-tag', d)).not.toBeNull();
    });

    it('solo lectura o agenda cerrada: ninguna acción', () => {
      const e = base();
      cargar({ ...e, agenda: { ...e.agenda, soloLectura: true } });
      expect(dom('acciones', pintar())).toBeNull();

      cargar({ ...e, agenda: { ...e.agenda, operable: false, codigoEstado: 'CERRADA' } });
      fixture.detectChanges();
      expect(dom('acciones', fixture.nativeElement)).toBeNull();
    });

    it('cada rango dice que ya está enviado, y la lista invita a tocarlos', () => {
      cargar(base());
      const d = pintar();
      expect(texto(dom('rango-758', d))).toContain('Enviado');
      expect(texto(d)).toContain('toca uno para editarlo');
    });
  });

  describe('tocar un rango', () => {
    beforeEach(() => cargar(base()));

    it('abre la hoja con la zona, el rango y el detalle', async () => {
      const fila = fixture.componentInstance.filas()[0];

      await fixture.componentInstance.abrirFila(fila);

      const opciones = hoja.create.calls.mostRecent().args[0];
      expect(opciones.header).toBe('ALTILLO · 1128–1131');
      expect(opciones.subHeader).toBe('4 TAG · P48 · 0 usados');
      expect(opciones.buttons.map((b: { text: string }) => b.text)).toEqual(['Editar rango', 'Eliminar rango', 'Cerrar']);
      expect(hoja.creada.present).toHaveBeenCalled();
    });

    it('"Editar rango" abre el formulario con ese rango', async () => {
      await fixture.componentInstance.abrirFila(fixture.componentInstance.filas()[0]);

      hoja.create.calls.mostRecent().args[0].buttons[0].handler();

      expect(navigate).toHaveBeenCalledWith(['/zonificacion', 2092, 'rango'], { queryParams: { rango: '758' } });
    });

    it('"Eliminar rango" pide confirmación y recién entonces elimina', async () => {
      await fixture.componentInstance.abrirFila(fixture.componentInstance.filas()[0]);

      hoja.create.calls.mostRecent().args[0].buttons[1].handler();
      await Promise.resolve();
      await Promise.resolve();

      const confirmacion = alerta.create.calls.mostRecent().args[0];
      expect(confirmacion.message).toBe('¿Eliminar el rango ALTILLO 1128–1131? Los TAG ya capturados no se tocan.');
      expect(facade['eliminarRango']).not.toHaveBeenCalled();

      confirmacion.buttons[1].handler();
      await Promise.resolve();
      await Promise.resolve();

      expect(facade['eliminarRango']).toHaveBeenCalledOnceWith({ idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01' }, 758);
    });

    it('cancelar la confirmación no elimina nada', async () => {
      await fixture.componentInstance.abrirFila(fixture.componentInstance.filas()[0]);
      hoja.create.calls.mostRecent().args[0].buttons[1].handler();
      await Promise.resolve();
      await Promise.resolve();

      const cancelar = alerta.create.calls.mostRecent().args[0].buttons[0];

      expect(cancelar.role).toBe('cancel');
      expect(facade['eliminarRango']).not.toHaveBeenCalled();
    });

    it('si eliminar se rechaza, lo dice en un aviso', async () => {
      (facade['eliminarRango'] as jasmine.Spy).and.resolveTo({ ok: false, codigo: 'RANGO_EN_ENVIO', data: {} });
      await fixture.componentInstance.abrirFila(fixture.componentInstance.filas()[0]);
      hoja.create.calls.mostRecent().args[0].buttons[1].handler();
      await Promise.resolve();
      await Promise.resolve();
      alerta.create.calls.mostRecent().args[0].buttons[1].handler();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(texto(dom('mensaje', pintar()))).toBe('El rango se está enviando. Intenta de nuevo en un momento.');
    });

    it('en una agenda que no se puede editar, tocar un rango no hace nada', async () => {
      const e = base();
      cargar({ ...e, zonificacion: { ...e.zonificacion, estado: 'CONFIRMADA' } });

      await fixture.componentInstance.abrirFila(fixture.componentInstance.filas()[0]);

      expect(hoja.create).not.toHaveBeenCalled();
    });
  });

  describe('mensaje de lo último que se hizo', () => {
    it('se muestra al volver de guardar, y solo una vez', async () => {
      mensajePendiente = { tipo: 'ok', texto: 'Rango guardado.' };
      cargar(base());

      await fixture.componentInstance.ionViewWillEnter();

      expect(texto(dom('mensaje', pintar()))).toBe('Rango guardado.');
      await fixture.componentInstance.ionViewWillEnter();
      expect(fixture.componentInstance.mensaje()).toBeNull();
    });

    it('sin mensaje pendiente no se muestra nada', async () => {
      cargar(base());
      await fixture.componentInstance.ionViewWillEnter();
      expect(dom('mensaje', pintar())).toBeNull();
    });
  });

  describe('confirmar y reabrir', () => {
    const esperar = async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    };
    const confirmada = (): EstadoAgenda => {
      const e = base();
      return { ...e, zonificacion: { ...e.zonificacion, estado: 'CONFIRMADA' } };
    };

    describe('los botones', () => {
      it('en borrador: Nuevo rango, Anular TAG y Confirmar (sin Reabrir)', () => {
        cargar(base());
        const d = pintar();
        expect(dom('nuevo-rango', d)).not.toBeNull();
        expect(dom('anular-tag', d)).not.toBeNull();
        expect(dom('confirmar', d)).not.toBeNull();
        expect(dom('reabrir', d)).toBeNull();
      });

      it('confirmada: Anular TAG y Reabrir (sin Nuevo rango ni Confirmar)', () => {
        cargar(confirmada());
        const d = pintar();
        expect(dom('nuevo-rango', d)).toBeNull();
        expect(dom('confirmar', d)).toBeNull();
        expect(dom('anular-tag', d)).not.toBeNull();
        expect(dom('reabrir', d)).not.toBeNull();
      });

      it('una confirmación pendiente ya ofrece Reabrir, no Confirmar otra vez', () => {
        cargar(base(), [op('CONFIRMAR', {})]);
        const d = pintar();
        expect(dom('confirmar', d)).toBeNull();
        expect(dom('reabrir', d)).not.toBeNull();
      });

      it('solo lectura o agenda cerrada: ni Confirmar ni Reabrir', () => {
        const e = confirmada();
        cargar({ ...e, agenda: { ...e.agenda, soloLectura: true } });
        const d = pintar();
        expect(dom('confirmar', d)).toBeNull();
        expect(dom('reabrir', d)).toBeNull();
      });

      it('una agenda sin rangos igual ofrece Confirmar (el error se explica al tocarlo)', () => {
        cargar({ ...base(), rangos: [] });
        expect(dom('confirmar', pintar())).not.toBeNull();
      });
    });

    describe('Confirmar', () => {
      it('con todo en orden pide confirmar con los TAG y rangos, y recién al aceptar la manda', async () => {
        cargar(base());

        await fixture.componentInstance.confirmar();

        const dialogo = alerta.create.calls.mostRecent().args[0];
        expect(dialogo.header).toBe('Confirmar zonificación');
        expect(dialogo.message).toContain('Se validarán los TAG ya utilizados.');
        expect(dialogo.buttons.map((b: { text: string }) => b.text)).toEqual(['Cancelar', 'Confirmar']);
        expect(facade['confirmarZonificacion']).not.toHaveBeenCalled();

        dialogo.buttons[1].handler();
        await esperar();

        expect(facade['confirmarZonificacion']).toHaveBeenCalledOnceWith({ idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01' });
      });

      it('cancelar no manda nada', async () => {
        cargar(base());
        await fixture.componentInstance.confirmar();

        expect(alerta.create.calls.mostRecent().args[0].buttons[0].role).toBe('cancel');
        expect(facade['confirmarZonificacion']).not.toHaveBeenCalled();
      });

      it('con envíos pendientes avisa que hay que esperar y no ofrece confirmar', async () => {
        cargar(base(), [op('GUARDAR_RANGO', { id_zonificacion_det: null, codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140 })]);

        await fixture.componentInstance.confirmar();

        const dialogo = alerta.create.calls.mostRecent().args[0];
        expect(dialogo.header).toBe('Hay envíos pendientes');
        expect(dialogo.message).toBe('Espera a que se envíen 1 cambio para poder confirmar.');
        expect(dialogo.buttons.map((b: { text: string }) => b.text)).toEqual(['Entendido']);
        expect(facade['confirmarZonificacion']).not.toHaveBeenCalled();
      });

      it('con TAG usados sin rango explica cuáles y no ofrece confirmar', async () => {
        cargar({ ...base(), tagsFuera: { total: 2, ejemplos: [5000, 5001] } });

        await fixture.componentInstance.confirmar();

        const dialogo = alerta.create.calls.mostRecent().args[0];
        expect(dialogo.header).toBe('No se puede confirmar');
        expect(dialogo.message).toBe('Hay 2 TAG usados sin rango: 5000, 5001. Agrega rangos que los cubran.');
      });

      it('sin rangos no hay diálogo: el aviso sale en el resumen', async () => {
        cargar({ ...base(), rangos: [] });

        await fixture.componentInstance.confirmar();

        expect(alerta.create).not.toHaveBeenCalled();
        expect(texto(dom('mensaje', pintar()))).toBe('Debes registrar al menos un rango antes de confirmar.');
      });

      it('tras confirmar se muestra el aviso que dejó el facade', async () => {
        cargar(base());
        mensajePendiente = { tipo: 'ok', texto: 'Zonificación confirmada: 3 rangos, 11 TAG instalados.' };
        await fixture.componentInstance.confirmar();

        alerta.create.calls.mostRecent().args[0].buttons[1].handler();
        await esperar();

        expect(texto(dom('mensaje', pintar()))).toBe('Zonificación confirmada: 3 rangos, 11 TAG instalados.');
      });

      it('si el caso de uso la rechaza, el motivo sale en el resumen', async () => {
        cargar(base());
        (facade['confirmarZonificacion'] as jasmine.Spy).and.resolveTo({ ok: false, codigo: 'AGENDA_SOLO_LECTURA', data: {} });
        await fixture.componentInstance.confirmar();

        alerta.create.calls.mostRecent().args[0].buttons[1].handler();
        await esperar();

        expect(texto(dom('mensaje', pintar()))).toBe('No puedes modificar esta agenda.');
      });
    });

    describe('Reabrir', () => {
      it('pide confirmación, y avisa del conteo si ya hay TAG usados', async () => {
        const e = confirmada();
        cargar({ ...e, resumen: { ...e.resumen, tagsUsados: 4 } });

        await fixture.componentInstance.reabrir();

        const dialogo = alerta.create.calls.mostRecent().args[0];
        expect(dialogo.header).toBe('Reabrir zonificación');
        expect(dialogo.message).toContain('El conteo ya tiene TAG utilizados');
        expect(dialogo.buttons.map((b: { text: string }) => b.text)).toEqual(['Cancelar', 'Reabrir']);
        expect(facade['reabrirZonificacion']).not.toHaveBeenCalled();
      });

      it('sin TAG usados el texto es corto', async () => {
        cargar(confirmada());
        await fixture.componentInstance.reabrir();
        expect(alerta.create.calls.mostRecent().args[0].message).toBe('¿Reabrir para modificar sus rangos?');
      });

      it('al aceptar la manda y muestra el aviso', async () => {
        cargar(confirmada());
        mensajePendiente = { tipo: 'info', texto: 'La zonificación volvió a borrador.' };
        await fixture.componentInstance.reabrir();

        alerta.create.calls.mostRecent().args[0].buttons[1].handler();
        await esperar();

        expect(facade['reabrirZonificacion']).toHaveBeenCalledOnceWith({ idAgenda: 2092, numeroAgenda: 'AG-20260909-4081-01' });
        expect(texto(dom('mensaje', pintar()))).toBe('La zonificación volvió a borrador.');
      });
    });

    describe('textos del SGO', () => {
      it('confirmada: "Para editar rangos, reábrela."', () => {
        cargar(confirmada());
        expect(texto(pintar())).toContain('Zonificación confirmada. Para editar rangos, reábrela.');
      });

      it('solo lectura: "Puedes ver esta agenda, pero no modificarla."', () => {
        const e = base();
        cargar({ ...e, agenda: { ...e.agenda, soloLectura: true } });
        expect(texto(dom('restriccion', pintar()))).toContain('Puedes ver esta agenda, pero no modificarla.');
      });

      it('TAG usados fuera en una confirmada: pide reabrirla; en un borrador, solo agregar rangos', () => {
        cargar({ ...confirmada(), tagsFuera: { total: 2, ejemplos: [5000, 5001] } });
        expect(texto(dom('tags-fuera', pintar()))).toContain('Reabre la zonificación y agrega un rango que los cubra.');

        cargar({ ...base(), tagsFuera: { total: 2, ejemplos: [5000, 5001] } });
        fixture.detectChanges();
        expect(texto(dom('tags-fuera', fixture.nativeElement))).toContain('Agrega rangos que los cubran.');
        expect(texto(dom('tags-fuera', fixture.nativeElement))).not.toContain('Reabre');
      });

      it('con TAG usados fuera, aun confirmada, el estado pide ajuste', () => {
        cargar({ ...confirmada(), tagsFuera: { total: 2, ejemplos: [5000, 5001] } });
        expect(texto(dom('estado', pintar()))).toBe('Requiere ajuste');
      });

      it('agenda sin rangos: la tarjeta del SGO "Sin rangos de zonificación"', () => {
        cargar({ ...base(), rangos: [] });
        expect(texto(dom('sin-rangos', pintar()))).toContain('Sin rangos de zonificación');
        expect(texto(dom('sin-rangos', fixture.nativeElement))).toContain('Esta agenda parte sin rangos. Usa Nuevo rango y registra el rango real instalado.');
      });
    });
  });
});
