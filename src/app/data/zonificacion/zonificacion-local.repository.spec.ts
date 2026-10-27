import { TestBed } from '@angular/core/testing';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_SCHEMA_SQL } from '../../core/database/sodimac.schema';
import { NuevaOperacion } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';
import { SqliteZonificacionRepository } from './zonificacion-local.repository';
import { parsearCatalogo, parsearListaAgendas, parsearRespuestaEstado } from './zonificacion.parser';
import { AGENDAS_V1_DATA, CATALOGO_V1_DATA, ESTADO_V1_DATA } from './zonificacion.fixtures';

/*
 * Contra SQLite real en memoria: la cola de envío es lo que impide perder lo
 * que el operador hizo sin señal, así que se prueba con el motor de verdad y no
 * con un doble.
 */
const op = (uid: string, extra: Partial<NuevaOperacion> = {}): NuevaOperacion => ({
  operacionUid: uid,
  idAgenda: 3120,
  numeroAgenda: 'AG-20261023-1604-01',
  tipo: 'GUARDAR_RANGO',
  claveRango: 'local-1',
  datos: { codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140 },
  operadorLogin: 'op@taxo.cl',
  operadorRut: '199955349',
  fechaHoraLocal: '2026-10-23 10:00:00',
  ...extra,
});

describe('SqliteZonificacionRepository', () => {
  let repo: SqliteZonificacionRepository;
  let db: ConexionFalsa;

  beforeEach(async () => {
    db = await crearConexionEnMemoria(SODIMAC_SCHEMA_SQL);
    TestBed.configureTestingModule({ providers: [SqliteZonificacionRepository, SqliteConnectionService] });
    spyOn(TestBed.inject(SqliteConnectionService), 'getConnection').and.resolveTo(db as never);
    repo = TestBed.inject(SqliteZonificacionRepository);
  });

  afterEach(() => db?.cerrar());

  describe('copias para trabajar sin red', () => {
    it('el catálogo guardado se lee igual, con su fecha de descarga', async () => {
      const catalogo = parsearCatalogo(CATALOGO_V1_DATA);
      expect(await repo.obtenerCatalogo()).toBeNull();

      await repo.guardarCatalogo(catalogo);

      const copia = await repo.obtenerCatalogo();
      expect(copia?.valor).toEqual(catalogo);
      expect(copia?.fechaDescarga).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    it('guardar un catálogo nuevo reemplaza al anterior (queda una sola fila)', async () => {
      const catalogo = parsearCatalogo(CATALOGO_V1_DATA);
      await repo.guardarCatalogo(catalogo);
      await repo.guardarCatalogo({ ...catalogo, version: '2026-11-01' });

      expect((await repo.obtenerCatalogo())?.valor.version).toBe('2026-11-01');
      const n = ((await db.query('SELECT COUNT(*) AS n FROM sod_zonificacion_catalogo')).values ?? [])[0]['n'];
      expect(n).toBe(1);
    });

    it('la lista de agendas es por operador: cada uno ve la suya', async () => {
      const lista = parsearListaAgendas(AGENDAS_V1_DATA);
      await repo.guardarListaAgendas('a@taxo.cl', lista);
      await repo.guardarListaAgendas('b@taxo.cl', { hoy: '2026-10-23', agendas: [] });

      expect((await repo.obtenerListaAgendas('a@taxo.cl'))?.valor).toEqual(lista);
      expect((await repo.obtenerListaAgendas('b@taxo.cl'))?.valor.agendas).toEqual([]);
      expect(await repo.obtenerListaAgendas('c@taxo.cl')).toBeNull();
    });

    it('el último estado de cada agenda se reemplaza al guardar uno nuevo', async () => {
      const estado = parsearRespuestaEstado(ESTADO_V1_DATA);
      await repo.guardarEstado(estado);
      await repo.guardarEstado({ ...estado, resumen: { ...estado.resumen, cantidadZonas: 9 } });

      expect((await repo.obtenerEstado(2092))?.valor.resumen.cantidadZonas).toBe(9);
      expect(await repo.obtenerEstado(1)).toBeNull();
    });
  });

  describe('cola de envío', () => {
    it('una operación nueva entra PENDIENTE, sin intentos y con su contenido intacto', async () => {
      const e = await repo.encolar(op('uid-1'));

      expect(e).toEqual(
        jasmine.objectContaining({
          operacionUid: 'uid-1',
          estado: 'PENDIENTE',
          intentos: 0,
          tipo: 'GUARDAR_RANGO',
          claveRango: 'local-1',
          datos: { codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140 },
          error: null,
          fechaUltimoIntento: null,
        }),
      );
      expect(e.id).toBeGreaterThan(0);
    });

    it('el mismo operacion_uid no se encola dos veces', async () => {
      await repo.encolar(op('uid-1'));
      await expectAsync(repo.encolar(op('uid-1'))).toBeRejected();
    });

    it('sale en orden de llegada, por agenda', async () => {
      await repo.encolar(op('a'));
      await repo.encolar(op('b', { idAgenda: 3151 }));
      await repo.encolar(op('c'));

      expect((await repo.listarPendientes(3120)).map((x) => x.operacionUid)).toEqual(['a', 'c']);
      expect((await repo.listarPendientes(3151)).map((x) => x.operacionUid)).toEqual(['b']);
      expect((await repo.listarPendientes()).map((x) => x.operacionUid)).toEqual(['a', 'b', 'c']);
    });

    it('cuenta los pendientes de todas las agendas (el aviso rojo)', async () => {
      expect(await repo.contarPendientes()).toBe(0);
      await repo.encolar(op('a'));
      await repo.encolar(op('b', { idAgenda: 3151 }));
      expect(await repo.contarPendientes()).toBe(2);
    });

    it('editar un rango pendiente cambia su contenido y no su operacion_uid ni su lugar en la cola', async () => {
      const a = await repo.encolar(op('a'));
      await repo.encolar(op('b'));

      await repo.actualizarDatos(a.id, { codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1145 });

      const cola = await repo.listarPendientes(3120);
      expect(cola.map((x) => x.operacionUid)).toEqual(['a', 'b']);
      expect(cola[0].datos['tag_hasta']).toBe(1145);
    });

    it('un intento fallido (transitorio) lo deja PENDIENTE y suma el intento', async () => {
      const a = await repo.encolar(op('a'));

      await repo.registrarIntentoFallido(a.id);
      await repo.registrarIntentoFallido(a.id);

      const despues = await repo.obtenerOperacion(a.id);
      expect(despues?.estado).toBe('PENDIENTE');
      expect(despues?.intentos).toBe(2);
      expect(despues?.fechaUltimoIntento).not.toBeNull();
    });

    it('un rechazo definitivo guarda el código y los datos, y sale de los pendientes', async () => {
      const a = await repo.encolar(op('a'));
      await repo.encolar(op('b'));

      await repo.marcarRechazada(a.id, { codigo: 'RANGO_CRUZADO', data: { con: { id_zonificacion_det: 758 } } }, 'El rango se cruza.');

      const r = await repo.obtenerOperacion(a.id);
      expect(r?.estado).toBe('RECHAZADO');
      expect(r?.error).toEqual({ codigo: 'RANGO_CRUZADO', data: { con: { id_zonificacion_det: 758 } } });
      expect(r?.mensajeError).toBe('El rango se cruza.');
      expect((await repo.listarPendientes()).map((x) => x.operacionUid)).toEqual(['b']);
      expect((await repo.listarRechazadas()).map((x) => x.operacionUid)).toEqual(['a']);
      expect(await repo.contarRechazadas()).toBe(1);
      expect(await repo.contarPendientes()).toBe(1);
    });

    it('una operación rechazada ya no se edita', async () => {
      const a = await repo.encolar(op('a'));
      await repo.marcarRechazada(a.id, { codigo: 'ZONIFICACION_CONFIRMADA', data: {} }, null);

      await repo.actualizarDatos(a.id, { cambiado: true });

      expect((await repo.obtenerOperacion(a.id))?.datos).toEqual({ codigo_zona: 'ALTILLO', tag_desde: 1135, tag_hasta: 1140 });
    });

    it('al aplicarse (o descartarse) la operación sale de la cola', async () => {
      const a = await repo.encolar(op('a'));
      await repo.eliminar(a.id);

      expect(await repo.obtenerOperacion(a.id)).toBeNull();
      expect(await repo.contarPendientes()).toBe(0);
    });

    it('un mismo uid puede volver a encolarse después de salir de la cola', async () => {
      const a = await repo.encolar(op('a'));
      await repo.eliminar(a.id);
      await expectAsync(repo.encolar(op('a'))).toBeResolved();
    });
  });
});
