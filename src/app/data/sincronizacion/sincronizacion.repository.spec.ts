import { TestBed } from '@angular/core/testing';
import { SqliteSincronizacionRepository } from './sincronizacion.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_SCHEMA_SQL } from '../../core/database/sodimac.schema';
import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';
import { hoySql } from '../../shared/utils/fecha.utils';

/*
 * La regla que se prueba acá es de negocio, no técnica: un conteo vale para la
 * jornada a la que pertenece, y si no alcanzó a subir ese día se da por perdido.
 *
 * Es fácil de deshacer sin querer —basta con "arreglar" la consulta para que
 * devuelva todos los pendientes— y el efecto sería mandarle al SGO conteos con
 * la fecha corrida, que es peor que no mandarlos.
 */
const AYER = '2026-08-25';

const SEMILLA = `
  INSERT OR IGNORE INTO sod_rol (id, nombre) VALUES (1, 'Operador');
  INSERT INTO sod_user (id, rol_id, rut, rut_dv, correo) VALUES (1, 1, 18306696, 'K', 'op@taxo.cl');
  INSERT INTO sod_sucursal (id, codigo_tienda, nombre) VALUES (1, 'T01', 'Maipú');
  INSERT INTO sod_pda (id, codigo) VALUES (1, 'PDA-01');
`;

describe('SqliteSincronizacionRepository', () => {
  let repo: SqliteSincronizacionRepository;
  let db: ConexionFalsa;

  /* Deja un TAG pendiente de envío para un evento con la fecha indicada. */
  async function pendienteDeEvento(eventoId: number, fechaProgramada: string, cargaUid: string) {
    await db.run(
      `INSERT OR IGNORE INTO sod_evento_inventario (id, sucursal_id, nombre, fecha_programada)
       VALUES (?, 1, 'Inventario', ?)`,
      [eventoId, fechaProgramada]
    );
    await repo.guardarSyncTag({
      eventoId, pdaId: 1, iteracion: 1, perfil: 'OPERADOR',
      conteoId: null, ubicacionId: null, operadorId: 1,
      cargaUid,
      // El payload no importa para esta regla; solo tiene que existir.
      payload: { carga_uid: cargaUid, detalles: [] } as never,
    });
  }

  beforeEach(async () => {
    db = await crearConexionEnMemoria(SODIMAC_SCHEMA_SQL + SEMILLA);

    TestBed.configureTestingModule({
      providers: [SqliteSincronizacionRepository, SqliteConnectionService],
    });
    const conexion = TestBed.inject(SqliteConnectionService);
    spyOn(conexion, 'getConnection').and.resolveTo(db as never);
    repo = TestBed.inject(SqliteSincronizacionRepository);
  });

  afterEach(() => db?.cerrar());

  describe('listarPendientes', () => {
    it('ofrece los pendientes del día en curso', async () => {
      await pendienteDeEvento(1, hoySql(), 'UID-HOY');

      const pendientes = await repo.listarPendientes();

      expect(pendientes.map((p) => p.cargaUid)).toEqual(['UID-HOY']);
    });

    /*
     * El corazón de la regla. Estos TAGs siguen en la tabla —se pueden auditar—
     * pero no se vuelven a ofrecer para envío.
     */
    it('NO ofrece los de un día anterior', async () => {
      await pendienteDeEvento(9, AYER, 'UID-AYER');

      expect(await repo.listarPendientes()).toEqual([]);
    });

    it('con los dos mezclados, devuelve solo el de hoy', async () => {
      await pendienteDeEvento(9, AYER, 'UID-AYER');
      await pendienteDeEvento(1, hoySql(), 'UID-HOY');

      const pendientes = await repo.listarPendientes();

      expect(pendientes.map((p) => p.cargaUid)).toEqual(['UID-HOY']);
    });

    // Que no se ofrezcan no significa que se borren: quedan como registro de lo
    // que no llegó, que es lo que permitió diagnosticar el caso del 26/08.
    it('los vencidos siguen guardados en la tabla', async () => {
      await pendienteDeEvento(9, AYER, 'UID-AYER');

      const filas = await db.query(`SELECT carga_uid FROM sod_sincronizacion`);

      expect(filas.values?.length).toBe(1);
    });

    it('un envío que falló también deja de ofrecerse al día siguiente', async () => {
      await pendienteDeEvento(9, AYER, 'UID-AYER');
      await repo.marcarError('UID-AYER', 'Failed to fetch');

      expect(await repo.listarPendientes()).toEqual([]);
    });

    it('un envío que falló hoy sí se puede reintentar', async () => {
      await pendienteDeEvento(1, hoySql(), 'UID-HOY');
      await repo.marcarError('UID-HOY', 'Failed to fetch');

      expect((await repo.listarPendientes()).map((p) => p.cargaUid)).toEqual(['UID-HOY']);
    });

    it('lo ya enviado no se vuelve a ofrecer', async () => {
      await pendienteDeEvento(1, hoySql(), 'UID-HOY');
      await repo.marcarEnviado('UID-HOY', 2);

      expect(await repo.listarPendientes()).toEqual([]);
    });
  });
});
