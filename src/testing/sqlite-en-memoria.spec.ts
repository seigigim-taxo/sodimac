import { ConexionFalsa, crearConexionEnMemoria } from './sqlite-en-memoria';

/*
 * El doble tiene que comportarse como el plugin REAL en lo que hace peligroso
 * a su modo por defecto. Cada caso de acá se comprobó contra
 * @capacitor-community/sqlite en una PDA (Meferi ME40K); si el doble dejara de
 * reproducirlo, los tests de la carrera de transacciones pasarían sin probar
 * nada.
 */
describe('doble de SQLite en memoria — fidelidad con el plugin', () => {
  let db: ConexionFalsa;

  beforeEach(async () => {
    db = await crearConexionEnMemoria(`
      CREATE TABLE padre (id INTEGER PRIMARY KEY);
      CREATE TABLE hijo  (id INTEGER PRIMARY KEY, padre_id INTEGER NOT NULL REFERENCES padre(id));
      CREATE TABLE marca (clave TEXT PRIMARY KEY, valor TEXT);
    `);
  });

  afterEach(() => db.cerrar());

  const existe = async (tabla: string, where = '1=1') =>
    ((await db.query(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${where}`)).values?.[0]?.['n'] as number) > 0;

  describe('la carrera que se vio en terreno', () => {
    it('un run SIN tercer argumento dentro de una transacción ajena falla con "Already in transaction"', async () => {
      await db.beginTransaction();

      await expectAsync(db.run(`INSERT INTO marca VALUES ('a', '1')`))
        .toBeRejectedWithError(/Already in transaction/);
    });

    it('…y además REVIERTE la transacción ajena (el finally de Database.java)', async () => {
      await db.beginTransaction();
      await db.run(`INSERT INTO padre VALUES (1)`, [], false);

      await db.run(`INSERT INTO marca VALUES ('a', '1')`).catch(() => undefined);

      expect(db.transaccionAbierta).toBeFalse();
      expect(await existe('padre')).toBeFalse();
    });

    it('lo que la descarga escribe después queda sin su padre: FOREIGN KEY constraint failed', async () => {
      await db.beginTransaction();
      await db.run(`INSERT INTO padre VALUES (1)`, [], false);
      await db.run(`INSERT INTO marca VALUES ('a', '1')`).catch(() => undefined);

      await expectAsync(db.run(`INSERT INTO hijo VALUES (1, 1)`, [], false))
        .toBeRejectedWithError(/FOREIGN KEY constraint failed/);
    });

    it('y el commit de la descarga falla con "no current transaction"', async () => {
      await db.beginTransaction();
      await db.run(`INSERT INTO marca VALUES ('a', '1')`).catch(() => undefined);

      await expectAsync(db.commitTransaction())
        .toBeRejectedWithError(/no current transaction/);
    });

    it('execute y executeSet con el default se comportan igual', async () => {
      await db.beginTransaction();
      await db.run(`INSERT INTO padre VALUES (1)`, [], false);
      await expectAsync(db.execute(`INSERT INTO marca VALUES ('x', '1')`)).toBeRejectedWithError(/Already in transaction/);
      expect(db.transaccionAbierta).toBeFalse();

      await db.beginTransaction();
      await expectAsync(db.executeSet([{ statement: `INSERT INTO marca VALUES ('y', '1')` }]))
        .toBeRejectedWithError(/Already in transaction/);
      expect(db.transaccionAbierta).toBeFalse();
    });
  });

  describe('lo que NO debe romper', () => {
    it('con false, el escritor ajeno entra en la transacción y no la revierte', async () => {
      await db.beginTransaction();
      await db.run(`INSERT INTO padre VALUES (1)`, [], false);

      await db.run(`INSERT INTO marca VALUES ('a', '1')`, [], false);
      await db.run(`INSERT INTO hijo VALUES (1, 1)`, [], false);
      await db.commitTransaction();

      expect(await existe('padre')).toBeTrue();
      expect(await existe('hijo')).toBeTrue();
      expect(await existe('marca')).toBeTrue();
    });

    it('un run con el default, fuera de toda transacción, se confirma solo', async () => {
      await db.run(`INSERT INTO marca VALUES ('a', '1')`);

      expect(db.transaccionAbierta).toBeFalse();
      expect(await existe('marca', `clave = 'a'`)).toBeTrue();
    });

    it('un statement que falla con el default deja todo como estaba', async () => {
      await db.run(`INSERT INTO marca VALUES ('a', '1')`);

      await expectAsync(db.run(`INSERT INTO marca VALUES ('a', '2')`)).toBeRejected();

      expect(db.transaccionAbierta).toBeFalse();
    });

    it('rollback y commit sin transacción fallan con el mensaje del plugin', async () => {
      await expectAsync(db.commitTransaction()).toBeRejectedWithError(/no current transaction/);
      await expectAsync(db.rollbackTransaction()).toBeRejectedWithError(/no current transaction/);
    });
  });
});
