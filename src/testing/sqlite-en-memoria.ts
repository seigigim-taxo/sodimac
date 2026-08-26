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
 * @capacitor-community/sqlite envuelve CADA db.run() en su propia transacción
 * salvo que se le pase `false` como tercer argumento. Meter un run() con el
 * default adentro de un beginTransaction() explota — ese fue exactamente el bug
 * de arriba. Este doble reproduce esa regla: si no, los tests pasarían y el
 * dispositivo seguiría fallando, que es la peor combinación posible.
 */

import initSqlJs, { SqlJs, SqlJsDatabase } from 'sql.js/dist/sql-wasm-browser.js';

/* Subconjunto de SQLiteDBConnection que usa el repositorio. */
export interface ConexionFalsa {
  query(sql: string, valores?: unknown[]): Promise<{ values?: Record<string, unknown>[] }>;
  run(sql: string, valores?: unknown[], transaction?: boolean): Promise<{ changes: { changes: number; lastId: number } }>;
  execute(sql: string): Promise<unknown>;
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

  return {
    get transaccionAbierta() {
      return enTransaccion;
    },

    async query(sql: string, valores: unknown[] = []) {
      return { values: filas(sql, valores) };
    },

    async run(sql: string, valores: unknown[] = [], transaction = true) {
      /*
       * La regla del plugin, replicada: con `transaction` en true (el default)
       * abre una transacción propia, y hacerlo dentro de otra falla. Es el error
       * que rompió el conteo en el dispositivo.
       */
      if (transaction && enTransaccion) {
        throw new Error('Failed in beginTransaction: Already in transaction');
      }

      if (transaction) {
        db.run('BEGIN TRANSACTION;');
        try {
          db.run(sql, valores);
          db.run('COMMIT;');
        } catch (err) {
          db.run('ROLLBACK;');
          throw err;
        }
      } else {
        db.run(sql, valores);
      }

      return { changes: { changes: db.getRowsModified(), lastId: ultimoId() } };
    },

    async execute(sql: string) {
      db.run(sql);
      return { changes: { changes: db.getRowsModified() } };
    },

    async beginTransaction() {
      if (enTransaccion) throw new Error('Failed in beginTransaction: Already in transaction');
      db.run('BEGIN TRANSACTION;');
      enTransaccion = true;
      return {};
    },

    async commitTransaction() {
      db.run('COMMIT;');
      enTransaccion = false;
      return {};
    },

    async rollbackTransaction() {
      db.run('ROLLBACK;');
      enTransaccion = false;
      return {};
    },

    cerrar() {
      db.close();
    },
  };
}
