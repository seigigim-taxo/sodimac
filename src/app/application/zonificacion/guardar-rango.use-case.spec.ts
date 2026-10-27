import { TestBed } from '@angular/core/testing';
import { EnvioEnCursoService } from '../sincronizacion/envio-en-curso.service';
import { ContextoAgendaZonificacionService } from './contexto-agenda-zonificacion.service';
import { claveCandado } from './enviar-zonificacion.use-case';
import { GuardarRangoEntrada, GuardarRangoUseCase } from './guardar-rango.use-case';
import { AGENDA, Entorno, crearEntorno, sembrarEstado } from './zonificacion-pruebas';

const rango = (extra: Partial<GuardarRangoEntrada> = {}): GuardarRangoEntrada => ({
  agenda: AGENDA,
  idRango: null,
  codigoZona: 'ALTILLO',
  tagDesde: 1135,
  tagHasta: 1140,
  referenciaUbicacion: 'P49',
  ...extra,
});

describe('GuardarRangoUseCase', () => {
  let e: Entorno;
  let uc: GuardarRangoUseCase;

  beforeEach(async () => {
    e = await crearEntorno();
    uc = TestBed.inject(GuardarRangoUseCase);
  });

  afterEach(() => e.db.cerrar());

  const vista = async () => (await TestBed.inject(ContextoAgendaZonificacionService).cargar(AGENDA.idAgenda)).vista;

  describe('un rango nuevo', () => {
    it('queda en la cola PENDIENTE con el contenido del contrato y se empuja el envío', async () => {
      const r = await uc.execute(rango());

      expect(r).toEqual({ ok: true, cantidad: 6, advertencia: false });
      const [op] = await e.local.listarPendientes(AGENDA.idAgenda);
      expect(op).toEqual(
        jasmine.objectContaining({
          tipo: 'GUARDAR_RANGO',
          estado: 'PENDIENTE',
          operadorLogin: 'operador1@prueba.local',
          datos: { id_zonificacion_det: null, codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140, referencia_ubicacion: 'P49' },
        }),
      );
      expect(op.operacionUid.length).toBeGreaterThan(0);
      expect(op.operacionUid.length).toBeLessThanOrEqual(64);
      expect(e.enviar.execute).toHaveBeenCalledOnceWith({ idAgenda: AGENDA.idAgenda });
    });

    it('aparece de inmediato en la vista, marcado pendiente', async () => {
      await uc.execute(rango());

      const nuevo = (await vista()).rangos.find((x) => x.pendiente);
      expect(nuevo).toEqual(jasmine.objectContaining({ tagDesde: 1135, tagHasta: 1140, cantidad: 6, idServidor: null }));
    });

    it('avisa cuando la cantidad pasa el umbral de advertencia del catálogo, pero la guarda', async () => {
      await e.local.guardarCatalogo({ ...e.catalogo, parametros: { ...e.catalogo.parametros, cantidadAdvertencia: 5 } });

      expect(await uc.execute(rango())).toEqual({ ok: true, cantidad: 6, advertencia: true });
      expect(await e.local.contarPendientes()).toBe(1);
    });
  });

  describe('lo que la app no deja hacer', () => {
    const sinRastro = async () => {
      expect(await e.local.contarPendientes()).toBe(0);
      expect(e.enviar.execute).not.toHaveBeenCalled();
    };

    it('sin sesión', async () => {
      e.identidad.obtener.and.resolveTo(null);
      expect(await uc.execute(rango())).toEqual({ ok: false, codigo: 'SIN_SESION', data: {} });
      await sinRastro();
    });

    it('sin catálogo descargado', async () => {
      await e.db.run('DELETE FROM sod_zonificacion_catalogo');
      expect(await uc.execute(rango())).toEqual({ ok: false, codigo: 'SIN_CATALOGO', data: {} });
      await sinRastro();
    });

    it('agenda que nunca se descargó', async () => {
      expect(await uc.execute(rango({ agenda: { idAgenda: 999, numeroAgenda: 'AG-X' } }))).toEqual({ ok: false, codigo: 'SIN_ESTADO', data: {} });
      await sinRastro();
    });

    it('agenda de solo lectura', async () => {
      await sembrarEstado(e, (s) => ({ ...s, agenda: { ...s.agenda, soloLectura: true } }));
      expect(await uc.execute(rango())).toEqual({ ok: false, codigo: 'AGENDA_SOLO_LECTURA', data: {} });
      await sinRastro();
    });

    it('agenda cerrada o suspendida', async () => {
      await sembrarEstado(e, (s) => ({ ...s, agenda: { ...s.agenda, operable: false, codigoEstado: 'CERRADA' } }));
      expect(await uc.execute(rango())).toEqual({ ok: false, codigo: 'AGENDA_NO_OPERABLE', data: { codigo_estado: 'CERRADA' } });
      await sinRastro();
    });

    it('zonificación confirmada', async () => {
      await sembrarEstado(e, (s) => ({ ...s, zonificacion: { ...s.zonificacion, estado: 'CONFIRMADA' } }));
      const r = await uc.execute(rango());
      expect(!r.ok && r.codigo).toBe('ZONIFICACION_CONFIRMADA');
      await sinRastro();
    });

    it('un confirmar pendiente también bloquea: el estado efectivo ya es CONFIRMADA', async () => {
      await e.local.encolar({
        operacionUid: 'c', idAgenda: AGENDA.idAgenda, numeroAgenda: AGENDA.numeroAgenda, tipo: 'CONFIRMAR', claveRango: null,
        datos: {}, operadorLogin: 'o', operadorRut: '1', fechaHoraLocal: '2026-10-23 10:00:00',
      });
      const r = await uc.execute(rango());
      expect(!r.ok && r.codigo).toBe('ZONIFICACION_CONFIRMADA');
    });

    it('cruce con un rango que ya está en el servidor', async () => {
      const r = await uc.execute(rango({ tagDesde: 1130, tagHasta: 1135 }));
      expect(!r.ok && r.codigo).toBe('RANGO_CRUZADO');
      await sinRastro();
    });

    it('cruce con un rango que todavía no salió', async () => {
      await uc.execute(rango());
      const r = await uc.execute(rango({ tagDesde: 1138, tagHasta: 1145 }));
      expect(!r.ok && r.codigo).toBe('RANGO_CRUZADO');
      expect(await e.local.contarPendientes()).toBe(1);
    });

    it('fuera de la banda de la zona', async () => {
      const r = await uc.execute(rango({ tagDesde: 3000, tagHasta: 3001 }));
      expect(!r.ok && r.codigo).toBe('RANGO_FUERA_DE_ZONA');
      await sinRastro();
    });

    it('editar un rango que no existe', async () => {
      expect(await uc.execute(rango({ idRango: 99999 }))).toEqual({ ok: false, codigo: 'RANGO_NO_ENCONTRADO', data: { id_zonificacion_det: 99999 } });
    });
  });

  describe('editar', () => {
    it('un rango del servidor crea una operación nueva que lleva el id del servidor', async () => {
      const r = await uc.execute(rango({ idRango: 758, tagDesde: 1128, tagHasta: 1131, referenciaUbicacion: 'P50' }));

      expect(r.ok).toBeTrue();
      const [op] = await e.local.listarPendientes(AGENDA.idAgenda);
      expect(op.datos).toEqual({ id_zonificacion_det: 758, codigo_zona: 'ALTILLO', tag_desde: 1128, tag_hasta: 1131, referencia_ubicacion: 'P50' });
    });

    it('un rango que todavía no salió cambia SU operación: sin operación nueva y con el mismo operacion_uid', async () => {
      await uc.execute(rango());
      const [original] = await e.local.listarPendientes(AGENDA.idAgenda);
      const id = (await vista()).rangos.find((x) => x.pendiente)!.id;

      const r = await uc.execute(rango({ idRango: id, tagHasta: 1145 }));

      expect(r).toEqual({ ok: true, cantidad: 11, advertencia: false });
      const cola = await e.local.listarPendientes(AGENDA.idAgenda);
      expect(cola.length).toBe(1);
      expect(cola[0].operacionUid).toBe(original.operacionUid);
      expect(cola[0].datos['tag_hasta']).toBe(1145);
    });

    it('editar sobre sí mismo no cuenta como cruce', async () => {
      const r = await uc.execute(rango({ idRango: 761, tagDesde: 1132, tagHasta: 1136 }));
      expect(r.ok).toBeTrue();
    });

    it('si el rango se está enviando justo ahora, no se toca', async () => {
      await uc.execute(rango());
      const [original] = await e.local.listarPendientes(AGENDA.idAgenda);
      const id = (await vista()).rangos.find((x) => x.pendiente)!.id;
      TestBed.inject(EnvioEnCursoService).tomar(claveCandado(AGENDA.idAgenda));

      const r = await uc.execute(rango({ idRango: id, tagHasta: 1145 }));

      expect(r).toEqual({ ok: false, codigo: 'RANGO_EN_ENVIO', data: {} });
      expect((await e.local.listarPendientes(AGENDA.idAgenda))[0].datos).toEqual(original.datos);
    });
  });
});
