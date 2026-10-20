import { TestBed } from '@angular/core/testing';
import { SqliteConnectionService } from './sqlite-connection.service';
import { conexionCruda } from './conexion-serializada';
import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';

const BD = 'sodimac';
const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/*
 * El servicio REAL, con el plugin reemplazado por la base en memoria. Lo que se
 * prueba es el cableado: que getConnection entregue la conexión serializada y
 * que enTransaccion use el mismo turno de escritura. Si alguno de los dos
 * volviera a entregar la conexión cruda, la carrera de la descarga inicial
 * —una escritura ajena que revierte la transacción— reaparecería sin que
 * ningún otro test lo note.
 */
describe('SqliteConnectionService — escrituras serializadas', () => {
  let servicio: SqliteConnectionService;
  let cruda: ConexionFalsa & { open(): Promise<void>; delete(): Promise<void> };
  let creaciones: number;

  beforeEach(async () => {
    cruda = Object.assign(
      await crearConexionEnMemoria(`
        CREATE TABLE padre (id INTEGER PRIMARY KEY);
        CREATE TABLE hijo  (id INTEGER PRIMARY KEY, padre_id INTEGER NOT NULL REFERENCES padre(id));
        CREATE TABLE marca (clave TEXT PRIMARY KEY, valor TEXT);
      `),
      { open: async () => undefined, delete: async () => undefined }
    );
    creaciones = 0;

    servicio = TestBed.inject(SqliteConnectionService);
    spyOnProperty(servicio, 'isSupported', 'get').and.returnValue(true);
    (servicio as unknown as { sqlite: unknown }).sqlite = {
      checkConnectionsConsistency: async () => ({ result: false }),
      isConnection: async () => ({ result: false }),
      retrieveConnection: async () => cruda,
      createConnection: async () => { creaciones++; return cruda; },
      closeConnection: async () => undefined,
    };
  });

  afterEach(() => cruda.cerrar());

  const existe = async (tabla: string, where = '1=1') =>
    ((await cruda.query(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${where}`)).values?.[0]?.['n'] as number) > 0;

  describe('getConnection', () => {
    it('entrega siempre la misma conexión, y detrás está la del plugin', async () => {
      const a = await servicio.getConnection(BD);
      const b = await servicio.getConnection(BD);

      expect(a).toBe(b);
      expect(conexionCruda(a)).toBe(cruda as never);
      expect(creaciones).toBe(1);
    });

    it('un run sin tercer argumento llega al plugin con transaction = false', async () => {
      const espia = spyOn(cruda, 'run').and.callThrough();
      const db = await servicio.getConnection(BD);

      await db.run(`INSERT INTO marca VALUES ('a', '1')`);

      expect(espia.calls.mostRecent().args[2]).toBeFalse();
    });

    it('tras deleteDatabase la próxima conexión es nueva', async () => {
      const antes = await servicio.getConnection(BD);

      await servicio.deleteDatabase(BD);
      const despues = await servicio.getConnection(BD);

      expect(creaciones).toBe(2);
      expect(despues).not.toBe(antes);
    });
  });

  describe('la carrera de la descarga inicial', () => {
    it('una escritura ajena por la conexión normal no revierte la transacción', async () => {
      const normal = await servicio.getConnection(BD);
      let ajena!: Promise<unknown>;

      await servicio.enTransaccion(BD, async (db) => {
        await db.run(`INSERT INTO padre VALUES (1)`, [], false);
        // llega una escritura ajena (la cola de reportes, marcar un envío…) con el modo por defecto
        ajena = normal.run(`INSERT INTO marca VALUES ('a', '1')`);
        await pausa(5);
        await db.run(`INSERT INTO hijo VALUES (1, 1)`, [], false);
      });
      await ajena;

      expect(await existe('padre')).toBeTrue();
      expect(await existe('hijo')).toBeTrue();
      expect(await existe('marca')).toBeTrue();
      expect(cruda.transaccionAbierta).toBeFalse();
    });

    it('aunque la escritura ajena pida explícitamente su propia transacción (true)', async () => {
      const normal = await servicio.getConnection(BD);
      let ajena!: Promise<unknown>;

      await servicio.enTransaccion(BD, async (db) => {
        await db.run(`INSERT INTO padre VALUES (1)`, [], false);
        ajena = normal.run(`INSERT INTO marca VALUES ('a', '1')`, [], true);
        await pausa(5);
        await db.run(`INSERT INTO hijo VALUES (1, 1)`, [], false);
      });
      await ajena;

      expect(await existe('hijo')).toBeTrue();
      expect(await existe('marca')).toBeTrue();
    });

    it('también si la ajena es un execute o un executeSet', async () => {
      const normal = await servicio.getConnection(BD);
      let ajenas!: Promise<unknown>;

      await servicio.enTransaccion(BD, async (db) => {
        await db.run(`INSERT INTO padre VALUES (1)`, [], false);
        ajenas = Promise.all([
          normal.execute(`INSERT INTO marca VALUES ('e', '1')`),
          normal.executeSet([{ statement: `INSERT INTO marca VALUES ('s', '1')`, values: [] }]),
        ]);
        await pausa(5);
        await db.run(`INSERT INTO hijo VALUES (1, 1)`, [], false);
      });
      await ajenas;

      expect(await existe('hijo')).toBeTrue();
      expect(await existe('marca', `clave = 'e'`)).toBeTrue();
      expect(await existe('marca', `clave = 's'`)).toBeTrue();
      expect(cruda.transaccionAbierta).toBeFalse();
    });

    it('dos transacciones a la vez no se pisan', async () => {
      const t = (id: number) => servicio.enTransaccion(BD, async (db) => {
        await db.run(`INSERT INTO padre VALUES (${id})`, [], false);
        await pausa(5);
      });

      await Promise.all([t(1), t(2), t(3)]);

      expect(await existe('padre', 'id = 1')).toBeTrue();
      expect(await existe('padre', 'id = 2')).toBeTrue();
      expect(await existe('padre', 'id = 3')).toBeTrue();
      expect(cruda.transaccionAbierta).toBeFalse();
    });

    it('si la transacción falla, la escritura ajena igual se guarda y lo suyo se revierte', async () => {
      const normal = await servicio.getConnection(BD);
      let ajena!: Promise<unknown>;

      await expectAsync(
        servicio.enTransaccion(BD, async (db) => {
          await db.run(`INSERT INTO padre VALUES (1)`, [], false);
          ajena = normal.run(`INSERT INTO marca VALUES ('a', '1')`);
          await pausa(5);
          throw new Error('la descarga falló');
        })
      ).toBeRejectedWithError('la descarga falló');
      await ajena;

      expect(await existe('padre')).toBeFalse();
      expect(await existe('marca')).toBeTrue();
    });
  });
});
