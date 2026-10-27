import { TestBed } from '@angular/core/testing';
import { AnularTagUseCase } from './anular-tag.use-case';
import { ConfirmarZonificacionUseCase } from './confirmar-zonificacion.use-case';
import { ReabrirZonificacionUseCase } from './reabrir-zonificacion.use-case';
import { AGENDA, Entorno, crearEntorno, sembrarEstado } from './zonificacion-pruebas';

describe('Anular TAG, confirmar y reabrir', () => {
  let e: Entorno;

  beforeEach(async () => {
    e = await crearEntorno();
  });

  afterEach(() => e.db.cerrar());

  describe('AnularTagUseCase', () => {
    let uc: AnularTagUseCase;
    beforeEach(() => (uc = TestBed.inject(AnularTagUseCase)));

    it('queda en la cola con el motivo sin espacios sobrantes y se empuja el envío', async () => {
      const r = await uc.execute(AGENDA, 1133, '  No se encontro el TAG en la tienda  ');

      expect(r).toEqual({ ok: true });
      const [op] = await e.local.listarPendientes(AGENDA.idAgenda);
      expect(op).toEqual(jasmine.objectContaining({ tipo: 'ANULAR_TAG', datos: { numero_tag: 1133, motivo: 'No se encontro el TAG en la tienda' } }));
      expect(e.enviar.execute).toHaveBeenCalledWith({ idAgenda: AGENDA.idAgenda });
    });

    it('motivo demasiado corto (el mínimo sale del catálogo)', async () => {
      expect(await uc.execute(AGENDA, 1133, 'rota')).toEqual({ ok: false, codigo: 'MOTIVO_CORTO', data: { minimo: 10 } });
      expect(await e.local.contarPendientes()).toBe(0);
    });

    it('un TAG que no está en ningún rango', async () => {
      expect(await uc.execute(AGENDA, 2500, 'no existe en la tienda')).toEqual({ ok: false, codigo: 'TAG_NO_EXISTE', data: { numero_tag: 2500 } });
    });

    it('un TAG que ya está anulado pendiente no se anula dos veces', async () => {
      await uc.execute(AGENDA, 1133, 'etiqueta rota en bodega');
      expect(await uc.execute(AGENDA, 1133, 'etiqueta rota en bodega')).toEqual({ ok: false, codigo: 'TAG_YA_ANULADO', data: { numero_tag: 1133 } });
      expect(await e.local.contarPendientes()).toBe(1);
    });

    it('se puede anular aunque la zonificación esté confirmada', async () => {
      await sembrarEstado(e, (s) => ({ ...s, zonificacion: { ...s.zonificacion, estado: 'CONFIRMADA' } }));
      expect((await uc.execute(AGENDA, 1133, 'etiqueta rota en bodega')).ok).toBeTrue();
    });

    it('agenda de solo lectura', async () => {
      await sembrarEstado(e, (s) => ({ ...s, agenda: { ...s.agenda, soloLectura: true } }));
      expect(await uc.execute(AGENDA, 1133, 'etiqueta rota en bodega')).toEqual({ ok: false, codigo: 'AGENDA_SOLO_LECTURA', data: {} });
    });
  });

  describe('ConfirmarZonificacionUseCase', () => {
    let uc: ConfirmarZonificacionUseCase;
    beforeEach(() => (uc = TestBed.inject(ConfirmarZonificacionUseCase)));

    it('con rangos válidos queda en la cola y se empuja el envío', async () => {
      expect(await uc.execute(AGENDA)).toEqual({ ok: true });
      const [op] = await e.local.listarPendientes(AGENDA.idAgenda);
      expect(op).toEqual(jasmine.objectContaining({ tipo: 'CONFIRMAR', datos: {} }));
      expect(e.enviar.execute).toHaveBeenCalledWith({ idAgenda: AGENDA.idAgenda });
    });

    it('sin rangos no se confirma', async () => {
      await sembrarEstado(e, (s) => ({ ...s, rangos: [] }));
      expect(await uc.execute(AGENDA)).toEqual({ ok: false, codigo: 'ZONIFICACION_VACIA', data: {} });
      expect(await e.local.contarPendientes()).toBe(0);
    });

    it('si ya hay una confirmación pendiente no se pide otra', async () => {
      await uc.execute(AGENDA);
      const r = await uc.execute(AGENDA);
      expect(!r.ok && r.codigo).toBe('ZONIFICACION_CONFIRMADA');
      expect(await e.local.contarPendientes()).toBe(1);
    });

    it('un rango cuya zona ya no tiene tipo en el catálogo bloquea la confirmación', async () => {
      await e.local.guardarCatalogo({ ...e.catalogo, zonas: e.catalogo.zonas.map((z) => ({ ...z, idTipoUbicacion: null, codigoTipoUbicacion: null })) });
      const r = await uc.execute(AGENDA);
      expect(!r.ok && r.codigo).toBe('ZONA_SIN_TIPO');
    });

    it('sale DESPUÉS de lo que ya estaba en la cola de esa agenda', async () => {
      await TestBed.inject(AnularTagUseCase).execute(AGENDA, 1133, 'etiqueta rota en bodega');
      await uc.execute(AGENDA);
      expect((await e.local.listarPendientes(AGENDA.idAgenda)).map((o) => o.tipo)).toEqual(['ANULAR_TAG', 'CONFIRMAR']);
    });

    it('sin catálogo o sin sesión', async () => {
      e.identidad.obtener.and.resolveTo(null);
      expect(await uc.execute(AGENDA)).toEqual({ ok: false, codigo: 'SIN_SESION', data: {} });
    });
  });

  describe('ReabrirZonificacionUseCase', () => {
    let uc: ReabrirZonificacionUseCase;
    beforeEach(() => (uc = TestBed.inject(ReabrirZonificacionUseCase)));

    it('una zonificación confirmada se reabre', async () => {
      await sembrarEstado(e, (s) => ({ ...s, zonificacion: { ...s.zonificacion, estado: 'CONFIRMADA' } }));

      expect(await uc.execute(AGENDA)).toEqual({ ok: true });
      expect((await e.local.listarPendientes(AGENDA.idAgenda)).map((o) => o.tipo)).toEqual(['REABRIR']);
      expect(e.enviar.execute).toHaveBeenCalledWith({ idAgenda: AGENDA.idAgenda });
    });

    it('una en BORRADOR no se reabre', async () => {
      expect(await uc.execute(AGENDA)).toEqual({ ok: false, codigo: 'ZONIFICACION_NO_CONFIRMADA', data: { estado: 'BORRADOR' } });
      expect(await e.local.contarPendientes()).toBe(0);
    });

    it('confirmar y luego reabrir sin que haya salido nada: ambas quedan en la cola, en ese orden', async () => {
      await TestBed.inject(ConfirmarZonificacionUseCase).execute(AGENDA);
      expect((await uc.execute(AGENDA)).ok).toBeTrue();
      expect((await e.local.listarPendientes(AGENDA.idAgenda)).map((o) => o.tipo)).toEqual(['CONFIRMAR', 'REABRIR']);
    });

    it('agenda de solo lectura', async () => {
      await sembrarEstado(e, (s) => ({ ...s, agenda: { ...s.agenda, soloLectura: true }, zonificacion: { ...s.zonificacion, estado: 'CONFIRMADA' } }));
      expect(await uc.execute(AGENDA)).toEqual({ ok: false, codigo: 'AGENDA_SOLO_LECTURA', data: {} });
    });
  });
});
