import { SODIMAC_SCHEMA_SQL, SODIMAC_TABLE_NAMES } from './sodimac.schema';
import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';

/*
 * Las cuatro tablas de zonificación: existen, aceptan lo que deben y rechazan lo
 * que el CHECK prohíbe. La cola de envío es la que importa: un operacion_uid
 * repetido o un estado inventado tienen que fallar en la base, no depender de
 * que el código que escribe se acuerde.
 */
const ENVIO = `INSERT INTO sod_zonificacion_envio
  (operacion_uid, id_agenda, numero_agenda, tipo, datos_json, operador_login, operador_rut, fecha_hora_local, fecha_creacion)
  VALUES (?, 3120, 'AG-20261023-1604-01', ?, '{}', 'op@taxo.cl', '199955349', '2026-10-23 10:00:00', '2026-10-23 10:00:00')`;

describe('esquema de zonificación', () => {
  let db: ConexionFalsa;

  beforeEach(async () => {
    db = await crearConexionEnMemoria(SODIMAC_SCHEMA_SQL);
  });

  afterEach(() => db?.cerrar());

  it('crea las cuatro tablas y las declara en SODIMAC_TABLE_NAMES', async () => {
    const nombres = ['sod_zonificacion_catalogo', 'sod_zonificacion_agendas', 'sod_zonificacion_estado', 'sod_zonificacion_envio'];
    const creadas = ((await db.query(`SELECT name FROM sqlite_master WHERE type = 'table'`)).values ?? []).map((r) => r['name']);
    for (const nombre of nombres) {
      expect(creadas).toContain(nombre);
      expect(SODIMAC_TABLE_NAMES as readonly string[]).toContain(nombre);
    }
  });

  it('aplicar el esquema dos veces no falla ni borra datos (IF NOT EXISTS)', async () => {
    await db.run(ENVIO, ['uid-1', 'CONFIRMAR']);
    await db.execute(SODIMAC_SCHEMA_SQL);
    const filas = (await db.query('SELECT COUNT(*) AS n FROM sod_zonificacion_envio')).values ?? [];
    expect(filas[0]['n']).toBe(1);
  });

  describe('catálogo', () => {
    it('admite una sola fila', async () => {
      await db.run(`INSERT INTO sod_zonificacion_catalogo (id, version, catalogo_json, fecha_descarga) VALUES (1, 'v1', '{}', 'ahora')`);
      await expectAsync(
        db.run(`INSERT INTO sod_zonificacion_catalogo (id, version, catalogo_json, fecha_descarga) VALUES (2, 'v2', '{}', 'ahora')`),
      ).toBeRejected();
    });
  });

  describe('cola de envío', () => {
    it('una fila nueva queda PENDIENTE, sin intentos', async () => {
      await db.run(ENVIO, ['uid-1', 'GUARDAR_RANGO']);
      const fila = ((await db.query('SELECT estado, intentos, codigo_error FROM sod_zonificacion_envio')).values ?? [])[0];
      expect(fila).toEqual({ estado: 'PENDIENTE', intentos: 0, codigo_error: null });
    });

    it('rechaza un operacion_uid repetido: el mismo envío no se encola dos veces', async () => {
      await db.run(ENVIO, ['uid-1', 'GUARDAR_RANGO']);
      await expectAsync(db.run(ENVIO, ['uid-1', 'GUARDAR_RANGO'])).toBeRejected();
    });

    it('rechaza un tipo de operación que no existe', async () => {
      await expectAsync(db.run(ENVIO, ['uid-2', 'BORRAR_TODO'])).toBeRejected();
    });

    it('acepta los cinco tipos del contrato', async () => {
      const tipos = ['GUARDAR_RANGO', 'ELIMINAR_RANGO', 'ANULAR_TAG', 'CONFIRMAR', 'REABRIR'];
      for (const [i, tipo] of tipos.entries()) {
        await db.run(ENVIO, [`uid-${i}`, tipo]);
      }
      const filas = (await db.query('SELECT COUNT(*) AS n FROM sod_zonificacion_envio')).values ?? [];
      expect(filas[0]['n']).toBe(5);
    });

    it('solo existen los estados PENDIENTE y RECHAZADO', async () => {
      await db.run(ENVIO, ['uid-1', 'CONFIRMAR']);
      await db.run(`UPDATE sod_zonificacion_envio SET estado = 'RECHAZADO' WHERE operacion_uid = 'uid-1'`);
      await expectAsync(db.run(`UPDATE sod_zonificacion_envio SET estado = 'ENVIADO' WHERE operacion_uid = 'uid-1'`)).toBeRejected();
    });
  });
});
