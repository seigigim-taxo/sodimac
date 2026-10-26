import { TestBed } from '@angular/core/testing';
import { NetworkError } from '../../domain/shared/errors/network.error';
import { ContextoAgendaZonificacionService } from './contexto-agenda-zonificacion.service';
import { DescartarRechazadaZonificacionUseCase } from './descartar-rechazada-zonificacion.use-case';
import { ListarRechazadasZonificacionUseCase } from './listar-rechazadas-zonificacion.use-case';
import { AGENDA, IDENTIDAD, Entorno, crearEntorno } from './zonificacion-pruebas';
import { NuevaOperacion } from '../../domain/zonificacion/repositories/zonificacion-local.repository';

const op = (uid: string, extra: Partial<NuevaOperacion> = {}): NuevaOperacion => ({
  operacionUid: uid,
  idAgenda: AGENDA.idAgenda,
  numeroAgenda: AGENDA.numeroAgenda,
  tipo: 'GUARDAR_RANGO',
  claveRango: null,
  datos: { id_zonificacion_det: null, codigo_zona: 'ALTILLO', tag_desde: 1138, tag_hasta: 1145 },
  operadorLogin: 'o',
  operadorRut: '1',
  fechaHoraLocal: '2026-10-23 10:42:00',
  ...extra,
});

describe('Envíos rechazados', () => {
  let e: Entorno;

  beforeEach(async () => {
    e = await crearEntorno();
    e.api.obtenerEstado.and.resolveTo(e.estado);
  });

  afterEach(() => e.db.cerrar());

  const rechazar = async (nueva: NuevaOperacion, codigo: 'RANGO_CRUZADO' | 'ZONIFICACION_CONFIRMADA', data: Record<string, unknown> = {}) => {
    const creada = await e.local.encolar(nueva);
    await e.local.marcarRechazada(creada.id, { codigo, data }, 'texto del servidor');
    return creada;
  };

  describe('listarlos', () => {
    let uc: ListarRechazadasZonificacionUseCase;
    beforeEach(() => (uc = TestBed.inject(ListarRechazadasZonificacionUseCase)));

    it('sin rechazos, lista vacía', async () => {
      expect(await uc.execute()).toEqual([]);
    });

    it('cada uno dice qué se intentó, el motivo en una palabra y en una frase', async () => {
      const a = await rechazar(op('a'), 'RANGO_CRUZADO', { con: { id_zonificacion_det: 758, tag_desde: 1128, tag_hasta: 1131 } });

      expect(await uc.execute()).toEqual([
        {
          id: a.id,
          idAgenda: 2092,
          numeroAgenda: 'AG-20260909-4081-01',
          titulo: 'Guardar rango 1138–1145',
          etiqueta: 'Cruce',
          motivo: 'El rango se cruza con otro (1128–1131).',
          fechaHoraLocal: '2026-10-23 10:42:00',
        },
      ]);
    });

    it('eliminar un rango dice cuál era, si todavía está en lo último descargado', async () => {
      await rechazar(op('b', { tipo: 'ELIMINAR_RANGO', datos: { id_zonificacion_det: 758 } }), 'ZONIFICACION_CONFIRMADA');

      const [r] = await uc.execute();

      expect(r.titulo).toBe('Eliminar rango 1128–1131');
      expect(r.etiqueta).toBe('Confirmada');
      expect(r.motivo).toBe('La zonificación está confirmada. Reábrela para editarla.');
    });

    it('si el rango ya no está en lo descargado, queda genérico', async () => {
      await rechazar(op('b', { tipo: 'ELIMINAR_RANGO', datos: { id_zonificacion_det: 99999 } }), 'ZONIFICACION_CONFIRMADA');
      expect((await uc.execute())[0].titulo).toBe('Eliminar un rango');
    });

    it('trae los de todas las agendas, en orden, y no las pendientes', async () => {
      await rechazar(op('a'), 'RANGO_CRUZADO');
      await rechazar(op('b', { idAgenda: 3151, numeroAgenda: 'AG-2' }), 'ZONIFICACION_CONFIRMADA');
      await e.local.encolar(op('c'));

      expect((await uc.execute()).map((r) => r.numeroAgenda)).toEqual(['AG-20260909-4081-01', 'AG-2']);
    });
  });

  describe('descartar todos', () => {
    let uc: DescartarRechazadaZonificacionUseCase;
    beforeEach(() => (uc = TestBed.inject(DescartarRechazadaZonificacionUseCase)));

    it('quita todos los rechazados y pide el estado una sola vez por agenda', async () => {
      await rechazar(op('a'), 'RANGO_CRUZADO');
      await rechazar(op('b'), 'ZONIFICACION_CONFIRMADA');
      await rechazar(op('c', { idAgenda: 3151, numeroAgenda: 'AG-2' }), 'ZONIFICACION_CONFIRMADA');

      expect(await uc.descartarTodas()).toBe(3);

      expect(await e.local.contarRechazadas()).toBe(0);
      expect(e.api.obtenerEstado).toHaveBeenCalledTimes(2);
      expect(e.api.obtenerEstado).toHaveBeenCalledWith(IDENTIDAD, 2092, 'AG-20260909-4081-01');
      expect(e.api.obtenerEstado).toHaveBeenCalledWith(IDENTIDAD, 3151, 'AG-2');
    });

    it('no toca lo pendiente', async () => {
      await rechazar(op('a'), 'RANGO_CRUZADO');
      await e.local.encolar(op('b'));

      await uc.descartarTodas();

      expect(await e.local.contarPendientes()).toBe(1);
    });

    it('sin rechazados no hace nada', async () => {
      expect(await uc.descartarTodas()).toBe(0);
      expect(e.api.obtenerEstado).not.toHaveBeenCalled();
    });

    it('aunque no se pueda refrescar el estado, los rechazados se descartan', async () => {
      await rechazar(op('a'), 'RANGO_CRUZADO');
      e.api.obtenerEstado.and.rejectWith(new NetworkError('sin red'));
      spyOn(console, 'error');

      expect(await uc.descartarTodas()).toBe(1);
      expect(await e.local.contarRechazadas()).toBe(0);
    });
  });

  describe('el envío en segundo plano tras una acción', () => {
    let contexto: ContextoAgendaZonificacionService;
    beforeEach(() => (contexto = TestBed.inject(ContextoAgendaZonificacionService)));

    const encolar = () => contexto.encolar(AGENDA, IDENTIDAD, 'CONFIRMAR', {});
    const esperar = async () => {
      for (let i = 0; i < 6; i++) await Promise.resolve();
    };

    it('empuja el envío de esa agenda', async () => {
      await encolar();
      expect(e.enviar.execute).toHaveBeenCalledOnceWith({ idAgenda: 2092 });
    });

    it('si algo quedó esperando (sin señal), arma el reintento con espera creciente', async () => {
      e.enviar.execute.and.resolveTo({ enviadas: 0, rechazadas: 0, reintentables: 1, cortadoPorRed: false });

      await encolar();
      await esperar();

      expect(e.reintento.programarTrasFallo).toHaveBeenCalledTimes(1);
    });

    it('si salió todo, no arma ningún reintento', async () => {
      e.enviar.execute.and.resolveTo({ enviadas: 1, rechazadas: 0, reintentables: 0, cortadoPorRed: false });

      await encolar();
      await esperar();

      expect(e.reintento.programarTrasFallo).not.toHaveBeenCalled();
    });

    it('un error del envío no rompe la acción del operador', async () => {
      e.enviar.execute.and.rejectWith(new Error('falló'));
      spyOn(console, 'error');

      await expectAsync(encolar()).toBeResolved();
      await esperar();

      expect(console.error).toHaveBeenCalled();
    });
  });
});
