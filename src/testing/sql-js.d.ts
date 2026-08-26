/*
 * sql.js no publica tipos. Se declara solo lo que usa el doble de SQLite en
 * memoria; el resto de su API queda fuera a propósito.
 *
 * Es la variante `-browser` porque las otras (`sql-asm`, `sql-wasm`) traen
 * `require` de node:fs y node:crypto para su modo Node, y el bundler de Karma
 * no puede resolverlos.
 */
declare module 'sql.js/dist/sql-wasm-browser.js' {
  export interface SqlJsStatement {
    bind(valores: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  export interface SqlJsDatabase {
    run(sql: string, valores?: unknown[]): void;
    exec(sql: string): { columns: string[]; values: unknown[][] }[];
    prepare(sql: string): SqlJsStatement;
    getRowsModified(): number;
    close(): void;
  }

  export interface SqlJs {
    Database: new () => SqlJsDatabase;
  }

  const initSqlJs: (config?: { locateFile?: (archivo: string) => string }) => Promise<SqlJs>;
  export default initSqlJs;
}
