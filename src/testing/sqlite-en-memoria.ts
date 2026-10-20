/*
 * SQLite real, en memoria, para los tests del repositorio de conteo.
 *
 * POR QUÉ EXISTE
 *
 * Toda la lógica de conteo vive en SQL dentro del repositorio, y esa parte no
 * tenía una sola prueba. El costo se vio: la app quedó sin poder registrar un
 * solo SKU ("Already in transaction") con el build limpio y 133 tests en verde.
 * Un doble que devolviera filas inventadas no habría cambiado nada — hace falta
 * un motor que ejecute el SQL de verdad.
 *
 * Se usa sql.js (SQLite compilado a WebAssembly) en su variante `-browser`: las
 * otras traen `require` de node:fs y node:crypto para su modo Node, y el bundler
 * de Karma no puede resolverlos. El .wasm lo sirve Karma como asset.
 *
 * LO QUE IMITA DEL PLUGIN, A PROPÓSITO
 *
 * @capacitor-community/sqlite envuelve CADA db.run(), db.execute() y
 * db.executeSet() en su propia transacción salvo que se le pase `false`. Meter
 * uno con el default adentro de un beginTransaction() explota — ese fue
 * exactamente el bug de arriba. Este doble reproduce esa regla: si no, los
 * tests pasarían y el dispositivo seguiría fallando, que es la peor
 * combinación posible.
 *
 * Y reproduce también lo que hace que esa regla sea peligrosa. En
 * Database.java cada una de esas operaciones es:
 *
 *   try { beginTransaction(); …; commitTransaction(); }
 *   finally { if (transaction && _db.inTransaction()) rollbackTransaction(); }
 *
 * Si el begin falla porque YA había una transacción abierta —de otra
 * operación—, el `finally` ve esa transacción ajena y la REVIERTE. Así una
 * escritura cualquiera deshacía la descarga inicial a medio guardar
 * (comprobado contra el plugin real en una PDA). Un doble que solo lanzara el
 * error y dejara la transacción en pie no podría reproducir esa carrera, y los
 * tests que la cubren no servirían de nada.
 *
 * Los mensajes de error son los del plugin, para poder comprobarlos tal cual.
 */

import initSqlJs, { SqlJs, SqlJsDatabase } from 'sql.js/dist/sql-wasm-browser.js';

/* Subconjunto de SQLiteDBConnection que usa el repositorio. */
export interface ConexionFalsa {
  query(sql: string, valores?: unknown[]): Promise<{ values?: Record<string, unknown>[] }>;
  run(sql: string, valores?: unknown[], transaction?: boolean): Promise<{ changes: { changes: number; lastId: number } }>;
  execute(sql: string, transaction?: boolean): Promise<unknown>;
  executeSet(set: { statement: string; values?: unknown[] }[], transaction?: boolean): Promise<unknown>;
  beginTransaction(): Promise<unknown>;
  commitTransaction(): Promise<unknown>;
  rollbackTransaction(): Promise<unknown>;
  /* Para aserciones: que no quede una transacción abierta al terminar. */
  readonly transaccionAbierta: boolean;
  cerrar(): void;
}

let motor: SqlJs | null = null;

async function cargarSqlJs(): Promise<SqlJs> {
  if (motor) return motor;
  /*
   * El .wasm lo sirve Karma desde la raíz — ver el asset agregado en
   * angular.json. Sin locateFile, sql.js lo busca junto al bundle y no lo
   * encuentra.
   */
  motor = await initSqlJs({ locateFile: (archivo) => `/${archivo}` });
  return motor;
}

export async function crearConexionEnMemoria(esquemaSql: string): Promise<ConexionFalsa> {
  const SQL = await cargarSqlJs();
  const db: SqlJsDatabase = new SQL.Database();

  db.run('PRAGMA foreign_keys = ON;');
  db.run(esquemaSql);

  let enTransaccion = false;

  function filas(sql: string, valores: unknown[]): Record<string, unknown>[] {
    const stmt = db.prepare(sql);
    try {
      stmt.bind(valores);
      const resultado: Record<string, unknown>[] = [];
      while (stmt.step()) resultado.push(stmt.getAsObject());
      return resultado;
    } finally {
      stmt.free();
    }
  }

  function ultimoId(): number {
    const res = db.exec('SELECT last_insert_rowid() AS id');
    return Number(res[0]?.values?.[0]?.[0] ?? 0);
  }

  /*
   * El cuerpo común de run / execute / executeSet, como lo hace Database.java:
   * con `transaction` en true abre su propia transacción (y falla si ya había
   * una), y el `finally` revierte cualquiera que siga abierta al terminar —
   * incluida la AJENA cuando el begin falló. Ver el comentario de arriba.
   */
  async function conTransaccion<T>(transaction: boolean, cuerpo: () => T): Promise<T> {
    try {
      if (transaction) {
        if (enTransaccion) throw new Error('Failed in beginTransaction: Already in transaction');
        db.run('BEGIN TRANSACTION;');
        enTransaccion = true;
      }
      const resultado = cuerpo();
      if (transaction) {
        db.run('COMMIT;');
        enTransaccion = false;
      }
      return resultado;
    } finally {
      if (transaction && enTransaccion) {
        db.run('ROLLBACK;');
        enTransaccion = false;
      }
    }
  }

  return {
    get transaccionAbierta() {
      return enTransaccion;
    },

    async query(sql: string, valores: unknown[] = []) {
      return { values: filas(sql, valores) };
    },

    async run(sql: string, valores: unknown[] = [], transaction = true) {
      return conTransaccion(transaction, () => {
        db.run(sql, valores);
        return { changes: { changes: db.getRowsModified(), lastId: ultimoId() } };
      });
    },

    async execute(sql: string, transaction = true) {
      return conTransaccion(transaction, () => {
        db.run(sql);
        return { changes: { changes: db.getRowsModified() } };
      });
    },

    async executeSet(set: { statement: string; values?: unknown[] }[], transaction = true) {
      return conTransaccion(transaction, () => {
        for (const s of set) db.run(s.statement, s.values ?? []);
        return { changes: { changes: db.getRowsModified() } };
      });
    },

    async beginTransaction() {
      if (enTransaccion) throw new Error('Failed in beginTransaction: Already in transaction');
      db.run('BEGIN TRANSACTION;');
      enTransaccion = true;
      return {};
    },

    async commitTransaction() {
      if (!enTransaccion) {
        throw new Error('CommitTransaction: Cannot perform this operation because there is no current transaction.');
      }
      db.run('COMMIT;');
      enTransaccion = false;
      return {};
    },

    async rollbackTransaction() {
      if (!enTransaccion) {
        throw new Error('RollbackTransaction: Cannot perform this operation because there is no current transaction.');
      }
      db.run('ROLLBACK;');
      enTransaccion = false;
      return {};
    },

    cerrar() {
      db.close();
    },
  };
}
