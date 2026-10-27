import { TestBed } from '@angular/core/testing';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { AGENDAS_V1_DATA, CATALOGO_V1_DATA } from '../../data/zonificacion/zonificacion.fixtures';
import { parsearCatalogo, parsearListaAgendas } from '../../data/zonificacion/zonificacion.parser';
import { CargarAgendasZonificacionUseCase } from './cargar-agendas-zonificacion.use-case';
import { CargarCatalogoZonificacionUseCase } from './cargar-catalogo-zonificacion.use-case';
import { CargarEstadoZonificacionUseCase } from './cargar-estado-zonificacion.use-case';
import { ContarPendientesZonificacionUseCase } from './contar-pendientes-zonificacion.use-case';
import { DescartarRechazadaZonificacionUseCase } from './descartar-rechazada-zonificacion.use-case';
import { AGENDA, IDENTIDAD, Entorno, crearEntorno } from './zonificacion-pruebas';

const SIN_RED = new NetworkError('Sin conexión', true, false);

describe('Cargar catálogo, agendas y estado', () => {
  let e: Entorno;

  afterEach(() => e.db.cerrar());

  describe('catálogo', () => {
    let uc: CargarCatalogoZonificacionUseCase;
    beforeEach(async () => {
      e = await crearEntorno({ sembrar: false });
      uc = TestBed.inject(CargarCatalogoZonificacionUseCase);
    });

    it('con red lo descarga y lo guarda', async () => {
      e.api.obtenerCatalogo.and.resolveTo(parsearCatalogo(CATALOGO_V1_DATA));

      const r = await uc.execute();

      expect(r.origen).toBe('SERVIDOR');
      expect(r.catalogo?.zonas.length).toBe(5);
      expect((await e.local.obtenerCatalogo())?.valor.version).toBe('2026-10-21');
    });

    it('sin red usa la última copia y dice de cuándo es', async () => {
      await e.local.guardarCatalogo(parsearCatalogo(CATALOGO_V1_DATA));
      e.api.obtenerCatalogo.and.rejectWith(SIN_RED);
      spyOn(console, 'error');

      const r = await uc.execute();

      expect(r.origen).toBe('COPIA');
      expect(r.catalogo?.zonas.length).toBe(5);
      expect(r.fechaDescarga).toMatch(/^\d{4}-\d{2}-\d{2} /);
    });

    it('sin red y sin copia: no hay catálogo', async () => {
      e.api.obtenerCatalogo.and.rejectWith(SIN_RED);
      spyOn(console, 'error');
      expect(await uc.execute()).toEqual({ catalogo: null, origen: 'NINGUNO', fechaDescarga: null });
    });
  });

  describe('agendas', () => {
    let uc: CargarAgendasZonificacionUseCase;
    beforeEach(async () => {
      e = await crearEntorno({ sembrar: false });
      uc = TestBed.inject(CargarAgendasZonificacionUseCase);
    });

    it('con red descarga la lista del operador y la guarda a su nombre', async () => {
      e.api.listarAgendas.and.resolveTo(parsearListaAgendas(AGENDAS_V1_DATA));

      const r = await uc.execute();

      expect(e.api.listarAgendas).toHaveBeenCalledOnceWith(IDENTIDAD);
      expect(r.origen).toBe('SERVIDOR');
      expect(r.lista?.agendas.length).toBe(2);
      expect((await e.local.obtenerListaAgendas('operador1@prueba.local'))?.valor.agendas.length).toBe(2);
    });

    it('sin red muestra la última lista, con el fallo a mano', async () => {
      await e.local.guardarListaAgendas('operador1@prueba.local', parsearListaAgendas(AGENDAS_V1_DATA));
      e.api.listarAgendas.and.rejectWith(SIN_RED);

      const r = await uc.execute();

      expect(r.origen).toBe('COPIA');
      expect(r.lista?.agendas.length).toBe(2);
      expect(r.error).toBe(SIN_RED);
    });

    it('sin red y sin copia: no hay lista', async () => {
      e.api.listarAgendas.and.rejectWith(SIN_RED);
      const r = await uc.execute();
      expect(r).toEqual({ lista: null, origen: 'NINGUNO', fechaDescarga: null, error: SIN_RED });
    });

    it('una lista vacía del servidor es la verdad: no se reemplaza por una copia vieja', async () => {
      await e.local.guardarListaAgendas('operador1@prueba.local', parsearListaAgendas(AGENDAS_V1_DATA));
      e.api.listarAgendas.and.resolveTo({ hoy: '2026-10-26', agendas: [] });

      const r = await uc.execute();

      expect(r.origen).toBe('SERVIDOR');
      expect(r.lista?.agendas).toEqual([]);
    });

    it('la copia es de cada operador: otro login no ve la lista de este', async () => {
      await e.local.guardarListaAgendas('otro@prueba.local', parsearListaAgendas(AGENDAS_V1_DATA));
      e.api.listarAgendas.and.rejectWith(SIN_RED);
      expect((await uc.execute()).origen).toBe('NINGUNO');
    });

    it('sin sesión no hay nada que cargar', async () => {
      e.identidad.obtener.and.resolveTo(null);
      expect(await uc.execute()).toEqual({ lista: null, origen: 'NINGUNO', fechaDescarga: null, error: null });
      expect(e.api.listarAgendas).not.toHaveBeenCalled();
    });
  });

  describe('estado de una agenda', () => {
    let uc: CargarEstadoZonificacionUseCase;
    beforeEach(async () => {
      e = await crearEntorno({ sembrar: false });
      uc = TestBed.inject(CargarEstadoZonificacionUseCase);
    });

    it('con red pide el estado, lo guarda y lo muestra', async () => {
      e.api.obtenerEstado.and.resolveTo(e.estado);

      const r = await uc.execute(AGENDA);

      expect(e.api.obtenerEstado).toHaveBeenCalledOnceWith(IDENTIDAD, 2092, 'AG-20260909-4081-01');
      expect(r.origen).toBe('SERVIDOR');
      expect(r.vista.rangos.length).toBe(e.estado.rangos.length);
      expect(await e.local.obtenerEstado(2092)).not.toBeNull();
    });

    it('le aplica encima lo que el operador hizo y no salió: el rango pendiente se ve con su marca', async () => {
      e.api.obtenerEstado.and.resolveTo(e.estado);
      await e.local.encolar({
        operacionUid: 'p1', idAgenda: 2092, numeroAgenda: AGENDA.numeroAgenda, tipo: 'GUARDAR_RANGO', claveRango: null,
        datos: { id_zonificacion_det: null, codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140, referencia_ubicacion: null },
        operadorLogin: 'o', operadorRut: '1', fechaHoraLocal: '2026-10-23 10:00:00',
      });

      const r = await uc.execute(AGENDA);

      expect(r.vista.rangos.length).toBe(e.estado.rangos.length + 1);
      expect(r.vista.rangos.filter((x) => x.pendiente).length).toBe(1);
      expect(r.vista.pendientes.length).toBe(1);
    });

    it('sin red usa la última copia y dice de cuándo es', async () => {
      await e.local.guardarEstado(e.estado);
      e.api.obtenerEstado.and.rejectWith(SIN_RED);

      const r = await uc.execute(AGENDA);

      expect(r.origen).toBe('COPIA');
      expect(r.error).toBe(SIN_RED);
      expect(r.fechaDescarga).toMatch(/^\d{4}-\d{2}-\d{2} /);
      expect(r.vista.rangos.length).toBe(e.estado.rangos.length);
    });

    it('sin red y sin copia: la vista parte vacía', async () => {
      e.api.obtenerEstado.and.rejectWith(SIN_RED);

      const r = await uc.execute(AGENDA);

      expect(r.origen).toBe('NINGUNO');
      expect(r.estado).toBeNull();
      expect(r.vista.estado).toBe('SIN_ZONIFICACION');
    });

    it('sin sesión se queda con la copia y no llama al servidor', async () => {
      await e.local.guardarEstado(e.estado);
      e.identidad.obtener.and.resolveTo(null);

      const r = await uc.execute(AGENDA);

      expect(e.api.obtenerEstado).not.toHaveBeenCalled();
      expect(r.origen).toBe('COPIA');
    });
  });

  describe('descartar un rechazo y contar pendientes', () => {
    beforeEach(async () => {
      e = await crearEntorno();
      e.api.obtenerEstado.and.resolveTo(e.estado);
    });

    const encolar = (uid: string) =>
      e.local.encolar({
        operacionUid: uid, idAgenda: 2092, numeroAgenda: AGENDA.numeroAgenda, tipo: 'CONFIRMAR', claveRango: null,
        datos: {}, operadorLogin: 'o', operadorRut: '1', fechaHoraLocal: '2026-10-23 10:00:00',
      });

    it('una rechazada se descarta y la agenda vuelve a pedir su estado', async () => {
      const op = await encolar('a');
      await e.local.marcarRechazada(op.id, { codigo: 'ZONIFICACION_CONFIRMADA', data: {} }, null);

      expect(await TestBed.inject(DescartarRechazadaZonificacionUseCase).execute(op.id)).toBeTrue();

      expect(await e.local.obtenerOperacion(op.id)).toBeNull();
      expect(e.api.obtenerEstado).toHaveBeenCalledOnceWith(IDENTIDAD, 2092, AGENDA.numeroAgenda);
    });

    it('una pendiente NO se descarta: todavía puede salir', async () => {
      const op = await encolar('a');

      expect(await TestBed.inject(DescartarRechazadaZonificacionUseCase).execute(op.id)).toBeFalse();
      expect(await e.local.obtenerOperacion(op.id)).not.toBeNull();
    });

    it('descartar algo que no existe no falla', async () => {
      expect(await TestBed.inject(DescartarRechazadaZonificacionUseCase).execute(12345)).toBeFalse();
    });

    it('el rechazo se descarta aunque no se pueda refrescar el estado', async () => {
      const op = await encolar('a');
      await e.local.marcarRechazada(op.id, { codigo: 'ZONIFICACION_CONFIRMADA', data: {} }, null);
      e.api.obtenerEstado.and.rejectWith(SIN_RED);
      spyOn(console, 'error');

      expect(await TestBed.inject(DescartarRechazadaZonificacionUseCase).execute(op.id)).toBeTrue();
    });

    it('cuenta por separado los pendientes (aviso rojo) y los rechazados (aviso aparte)', async () => {
      await encolar('a');
      await encolar('b');
      const c = await encolar('c');
      await e.local.marcarRechazada(c.id, { codigo: 'RANGO_CRUZADO', data: {} }, null);

      expect(await TestBed.inject(ContarPendientesZonificacionUseCase).execute()).toEqual({ pendientes: 2, rechazadas: 1 });
    });
  });
});
