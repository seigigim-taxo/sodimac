import { ConexionFalsa, crearConexionEnMemoria } from '../../../testing/sqlite-en-memoria';
import { ExclusionDeEscrituras } from './exclusion-de-escrituras';
import { conexionCruda, ejecutarEnTransaccion, serializarConexion } from './conexion-serializada';

const pausa = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/*
 * La carrera de terreno: la descarga inicial guarda dentro de una transacción
 * y, en medio, otra parte de la app escribe con el modo por defecto del plugin.
 * Sin serializar, esa escritura REVIERTE la transacción de la descarga (ver el
 * doble de SQLite). Estos tests fijan que con la conexión serializada no pasa.
 */
describe('conexión serializada', () => {
  let cruda: ConexionFalsa;
  let exclusion: ExclusionDeEscrituras;
  let conn: ConexionFalsa;

  beforeEach(async () => {
    cruda = await crearConexionEnMemoria(`
      CREATE TABLE padre (id INTEGER PRIMARY KEY);
      CREATE TABLE hijo  (id INTEGER PRIMARY KEY, padre_id INTEGER NOT NULL REFERENCES padre(id));
      CREATE TABLE marca (clave TEXT PRIMARY KEY, valor TEXT);
    `);
    exclusion = new ExclusionDeEscrituras();
    conn = serializarConexion(cruda, exclusion);
  });

  afterEach(() => cruda.cerrar());

  const existe = async (tabla: string, where = '1=1') =>
    ((await cruda.query(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${where}`)).values?.[0]?.['n'] as number) > 0;

  describe('escritor ajeno durante una transacción', () => {
    it('SIN serializar revienta (control: es la carrera real)', async () => {
      await cruda.beginTransaction();
      await cruda.run(`INSERT INTO padre VALUES (1)`, [], false);
      await cruda.run(`INSERT INTO marca VALUES ('a', '1')`).catch(() => undefined);

      await expectAsync(cruda.run(`INSERT INTO hijo VALUES (1, 1)`, [], false))
        .toBeRejectedWithError(/FOREIGN KEY constraint failed/);
    });

    it('serializada: la transacción termina completa y el escritor ajeno se aplica después', async () => {
      let ajeno!: Promise<unknown>;

      await ejecutarEnTransaccion(conn, exclusion, async (db) => {
        await db.run(`INSERT INTO padre VALUES (1)`, [], false);
        // llega un escritor ajeno, por la conexión normal y SIN tercer argumento
        ajeno = conn.run(`INSERT INTO marca VALUES ('a', '1')`);
        await pausa(5);
        await db.run(`INSERT INTO hijo VALUES (1, 1)`, [], false);
      });
      await ajeno;

      expect(await existe('padre')).toBeTrue();
      expect(await existe('hijo')).toBeTrue();
      expect(await existe('marca')).toBeTrue();
      expect(cruda.transaccionAbierta).toBeFalse();
    });

    it('el escritor ajeno no corre mientras la transacción sigue abierta', async () => {
      const orden: string[] = [];
      let ajeno!: Promise<unknown>;

      await ejecutarEnTransaccion(conn, exclusion, async (db) => {
        ajeno = conn.run(`INSERT INTO marca VALUES ('a', '1')`).then(() => orden.push('ajeno'));
        await pausa(10);
        orden.push('fin de la transacción');
        await db.run(`INSERT INTO padre VALUES (1)`, [], false);
      });
      await ajeno;

      expect(orden).toEqual(['fin de la transacción', 'ajeno']);
    });

    it('si la transacción falla, se revierte SOLO lo suyo y el escritor ajeno sobrevive', async () => {
      let ajeno!: Promise<unknown>;

      await expectAsync(
        ejecutarEnTransaccion(conn, exclusion, async (db) => {
          await db.run(`INSERT INTO padre VALUES (1)`, [], false);
          ajeno = conn.run(`INSERT INTO marca VALUES ('a', '1')`);
          await pausa(5);
          throw new Error('la descarga falló');
        })
      ).toBeRejectedWithError('la descarga falló');
      await ajeno;

      expect(await existe('padre')).toBeFalse();
      expect(await existe('marca')).toBeTrue();
      expect(cruda.transaccionAbierta).toBeFalse();
    });

    it('un escritor ajeno que falla no arrastra a la transacción', async () => {
      let ajeno!: Promise<unknown>;

      await ejecutarEnTransaccion(conn, exclusion, async (db) => {
        await db.run(`INSERT INTO padre VALUES (1)`, [], false);
        ajeno = conn.run(`INSERT INTO tabla_que_no_existe VALUES (1)`).catch((e) => e);
        await pausa(5);
        await db.run(`INSERT INTO hijo VALUES (1, 1)`, [], false);
      });

      expect(await ajeno).toBeInstanceOf(Error);
      expect(await existe('hijo')).toBeTrue();
    });
  });

  describe('transacciones entre sí', () => {
    it('dos transacciones simultáneas se serializan: ninguna lanza "Already in transaction"', async () => {
      const orden: string[] = [];
      const t = (nombre: string, id: number) =>
        ejecutarEnTransaccion(conn, exclusion, async (db) => {
          orden.push(`${nombre}:inicio`);
          await db.run(`INSERT INTO padre VALUES (${id})`, [], false);
          await pausa(5);
          orden.push(`${nombre}:fin`);
        });

      await Promise.all([t('A', 1), t('B', 2)]);

      expect(orden).toEqual(['A:inicio', 'A:fin', 'B:inicio', 'B:fin']);
      expect(await existe('padre', 'id = 1')).toBeTrue();
      expect(await existe('padre', 'id = 2')).toBeTrue();
    });

    it('una transacción que falla no frena a la siguiente', async () => {
      const falla = ejecutarEnTransaccion(conn, exclusion, async () => { throw new Error('boom'); });
      const sigue = ejecutarEnTransaccion(conn, exclusion, async (db) => {
        await db.run(`INSERT INTO padre VALUES (7)`, [], false);
      });

      await expectAsync(falla).toBeRejectedWithError('boom');
      await sigue;

      expect(await existe('padre', 'id = 7')).toBeTrue();
      expect(cruda.transaccionAbierta).toBeFalse();
    });
  });

  describe('qué se serializa y con qué modo', () => {
    it('run sin tercer argumento se ejecuta con transaction = false', async () => {
      const espia = spyOn(cruda, 'run').and.callThrough();

      await conn.run(`INSERT INTO marca VALUES ('a', '1')`);

      expect(espia).toHaveBeenCalledWith(`INSERT INTO marca VALUES ('a', '1')`, undefined, false);
    });

    it('un true explícito se respeta', async () => {
      const espia = spyOn(cruda, 'run').and.callThrough();

      await conn.run(`INSERT INTO marca VALUES ('a', '1')`, [], true);

      expect(espia).toHaveBeenCalledWith(`INSERT INTO marca VALUES ('a', '1')`, [], true);
    });

    it('execute y executeSet conservan su default y también esperan su turno', async () => {
      const espiaExecute = spyOn(cruda, 'execute').and.callThrough();
      const orden: string[] = [];
      let ocupada!: Promise<unknown>;

      await ejecutarEnTransaccion(conn, exclusion, async (db) => {
        ocupada = Promise.all([
          conn.execute(`INSERT INTO marca VALUES ('e', '1')`).then(() => orden.push('execute')),
          conn.executeSet([{ statement: `INSERT INTO marca VALUES ('s', '1')` }]).then(() => orden.push('executeSet')),
        ]);
        await pausa(10);
        orden.push('fin de la transacción');
        await db.run(`INSERT INTO padre VALUES (1)`, [], false);
      });
      await ocupada;

      expect(orden).toEqual(['fin de la transacción', 'execute', 'executeSet']);
      expect(espiaExecute).toHaveBeenCalledWith(`INSERT INTO marca VALUES ('e', '1')`);
    });

    it('las lecturas no esperan a la cola', async () => {
      let lecturaTermino = false;

      await ejecutarEnTransaccion(conn, exclusion, async (db) => {
        await db.run(`INSERT INTO padre VALUES (1)`, [], false);
        await conn.query(`SELECT COUNT(*) AS n FROM padre`);
        lecturaTermino = true;
      });

      expect(lecturaTermino).toBeTrue();
    });
  });

  describe('aviso de espera: de quién se trata', () => {
    it('nombra a la escritura que espera con el comienzo de su SQL', async () => {
      const aviso = spyOn(console, 'warn');
      const lenta = new ExclusionDeEscrituras(5);
      const conLenta = serializarConexion(cruda, lenta);

      await ejecutarEnTransaccion(conLenta, lenta, async (db) => {
        await db.run(`INSERT INTO padre VALUES (1)`);
        const ajena = conLenta.run(`INSERT INTO marca   VALUES ('a', '1')`);
        await pausa(40);
        void ajena;
      });
      await pausa(5);

      const textos = aviso.calls.allArgs().map((a) => String(a[0]));
      expect(textos.some((t) => t.includes(`"run: INSERT INTO marca VALUES ('a', '1')"`))).toBeTrue();
    });
  });

  describe('la conexión que recibe el callback de una transacción', () => {
    it('un run, execute o executeSet sin bandera NO abre una transacción propia ni revierte la actual', async () => {
      await ejecutarEnTransaccion(conn, exclusion, async (db) => {
        await db.run(`INSERT INTO padre VALUES (1)`);
        await db.execute(`INSERT INTO marca VALUES ('e', '1')`);
        await db.executeSet([{ statement: `INSERT INTO marca VALUES ('s', '1')` }]);
        await db.run(`INSERT INTO hijo VALUES (1, 1)`);
      });

      expect(await existe('padre')).toBeTrue();
      expect(await existe('hijo')).toBeTrue();
      expect(await existe('marca', `clave = 'e'`)).toBeTrue();
      expect(await existe('marca', `clave = 's'`)).toBeTrue();
      expect(cruda.transaccionAbierta).toBeFalse();
    });

    it('CONTROL: con la conexión cruda, ese mismo run sin bandera revierte la propia transacción', async () => {
      await expectAsync(
        ejecutarEnTransaccion(cruda, exclusion, async () => {
          await cruda.run(`INSERT INTO padre VALUES (1)`, [], false);
          await cruda.run(`INSERT INTO marca VALUES ('a', '1')`).catch(() => undefined); // revierte la transacción
          await cruda.run(`INSERT INTO hijo VALUES (1, 1)`, [], false);
        })
      ).toBeRejectedWithError(/FOREIGN KEY constraint failed/);
    });

    it('un run sin bandera llega al plugin con transaction = false', async () => {
      const espia = spyOn(cruda, 'run').and.callThrough();

      await ejecutarEnTransaccion(conn, exclusion, async (db) => {
        await db.run(`INSERT INTO padre VALUES (1)`);
      });

      expect(espia.calls.mostRecent().args[2]).toBeFalse();
    });

    it('un true explícito se respeta (y sigue siendo un error, como siempre)', async () => {
      const espia = spyOn(cruda, 'run').and.callThrough();

      await expectAsync(
        ejecutarEnTransaccion(conn, exclusion, async (db) => {
          await db.run(`INSERT INTO padre VALUES (1)`, [], true);
        })
      ).toBeRejectedWithError(/Already in transaction/);

      expect(espia.calls.mostRecent().args[2]).toBeTrue();
    });

    it('sigue entregando la conexión cruda detrás', async () => {
      await ejecutarEnTransaccion(conn, exclusion, async (db) => {
        expect(conexionCruda(db)).toBe(cruda);
      });
    });
  });

  describe('conexionCruda', () => {
    it('devuelve la conexión sin envolver detrás de la envuelta', () => {
      expect(conexionCruda(conn)).toBe(cruda);
    });

    it('una conexión que no estaba envuelta se devuelve tal cual', () => {
      expect(conexionCruda(cruda)).toBe(cruda);
    });
  });
});
