// ============================================================
// core/database/sqlite-connection.service.ts
// Wrapper de bajo nivel sobre @capacitor-community/sqlite.
// Solo disponible en plataforma nativa (Android/iOS); en web
// (ng serve, karma) queda inactivo hasta que se agregue jeep-sqlite.
// ============================================================

import { Injectable, isDevMode } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection, SQLiteDBConnection } from '@capacitor-community/sqlite';
import { SODIMAC_DB_VERSION } from './sodimac.schema';
import { ExclusionDeEscrituras } from './exclusion-de-escrituras';
import { conexionCruda, ejecutarEnTransaccion, serializarConexion } from './conexion-serializada';
const TAG = '[SqliteConnectionService]';

@Injectable({ providedIn: 'root' })
export class SqliteConnectionService {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite);
  /* Las conexiones tal como las entrega el plugin. */
  private readonly connections = new Map<string, SQLiteDBConnection>();
  /* Lo que se entrega a los repositorios: la misma conexión, con las escrituras en cola. */
  private readonly serializadas = new Map<string, SQLiteDBConnection>();
  /* Un turno de escritura por base: ver ExclusionDeEscrituras. */
  private readonly exclusiones = new Map<string, ExclusionDeEscrituras>();

  get isSupported(): boolean {
    return Capacitor.isNativePlatform();
  }

  /*
   * La conexión que se entrega YA viene serializada: sus escrituras esperan su
   * turno, y un `run` sin tercer argumento deja de abrir una transacción propia
   * (ver serializarConexion). Es lo que evita que una escritura cualquiera
   * revierta la transacción de otra operación — la carrera que hacía fallar la
   * descarga inicial con `FOREIGN KEY constraint failed`, `no current
   * transaction` o `No se pudo resolver producto`.
   */
  async getConnection(dbName: string): Promise<SQLiteDBConnection> {
    if (!this.isSupported) {
      throw new Error(`${TAG} SQLite solo está disponible en plataforma nativa (Android/iOS). En web no hay base local.`);
    }

    const cached = this.connections.get(dbName);
    if (cached) {
      return this.serializada(dbName, cached);
    }

    const consistency = await this.sqlite.checkConnectionsConsistency();
    const alreadyOpen = (await this.sqlite.isConnection(dbName, false)).result;

    const db = consistency.result && alreadyOpen
      ? await this.sqlite.retrieveConnection(dbName, false)
      : await this.sqlite.createConnection(dbName, false, 'no-encryption', SODIMAC_DB_VERSION, false);

    await db.open();

    /*
     * WAL explícito, no por confiar en el default del plugin. Con el journal de
     * rollback una transacción de lectura bloquea las escrituras, y el respaldo
     * lee la base entera dentro de una: un escaneo hecho durante el respaldo
     * podía fallar con SQLITE_BUSY, y WriteQueue serializa pero no reintenta.
     * En WAL lectores y escritor conviven, así que el respaldo deja de
     * interferir con el conteo.
     */
    try {
      // Con query y no execute: el PRAGMA devuelve el modo resultante, y así
      // queda registrado si el motor lo aceptó o lo ignoró.
      const modo = await db.query('PRAGMA journal_mode=WAL;');
      const aplicado = (modo.values?.[0] as Record<string, unknown> | undefined)?.['journal_mode'];
      if (isDevMode()) console.log(`${TAG} journal_mode de ${dbName}:`, aplicado);
    } catch (err) {
      // No es fatal: la app funciona igual, solo pierde la concurrencia.
      console.warn(`${TAG} no se pudo activar WAL en ${dbName}:`, err);
    }

    this.connections.set(dbName, db);
    return this.serializada(dbName, db);
  }

  private exclusionDe(dbName: string): ExclusionDeEscrituras {
    let exclusion = this.exclusiones.get(dbName);
    if (!exclusion) {
      exclusion = new ExclusionDeEscrituras();
      this.exclusiones.set(dbName, exclusion);
    }
    return exclusion;
  }

  private serializada(dbName: string, cruda: SQLiteDBConnection): SQLiteDBConnection {
    const existente = this.serializadas.get(dbName);
    if (existente && conexionCruda(existente) === cruda) return existente;

    const nueva = serializarConexion(cruda, this.exclusionDe(dbName));
    this.serializadas.set(dbName, nueva);
    return nueva;
  }

  /*
   * Vuelca la base a un script SQL (esquema + datos), como lo haría `.dump` de
   * la consola de sqlite3. Se arma a mano leyendo sqlite_master porque el
   * archivo .db vive en el almacenamiento privado de la app
   * (/data/data/<paquete>/databases) y Filesystem no llega ahí.
   *
   * La ventaja sobre el JSON del plugin es que este script se restaura con
   * cualquier herramienta de SQLite, sin depender de la app ni del formato
   * propio de @capacitor-community/sqlite.
   */
  async exportarSql(dbName: string): Promise<string> {
    /*
     * Todo el volcado va dentro de una transacción para que sea una foto
     * coherente. Sin esto son lecturas sueltas: si el operador escanea a mitad
     * del respaldo, una tabla puede leerse antes del escaneo y otra después, y
     * el .sql sale con una línea de conteo que apunta a un producto que no
     * quedó en el archivo. Al restaurarlo eso aparece como fila huérfana.
     *
     * Es de solo lectura, así que el commit no escribe nada.
     */
    return this.enTransaccion(dbName, (db) => this.volcar(db, dbName));
  }

  private async volcar(db: SQLiteDBConnection, dbName: string): Promise<string> {
    const maestro = await db.query(
      `SELECT type, name, sql FROM sqlite_master
       WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'`
    );
    const objetos = (maestro.values ?? []) as { type: string; name: string; sql: string }[];

    const lineas: string[] = [
      `-- Respaldo de ${dbName}`,
      `-- Generado el ${new Date().toISOString()}`,
      '',
      'PRAGMA foreign_keys=OFF;',
      'BEGIN TRANSACTION;',
      '',
    ];

    /*
     * Primero las tablas y después los datos; los índices y triggers van al
     * final. Insertar con los índices ya creados obliga a SQLite a mantenerlos
     * fila por fila, y con la muestra cargada eso se nota al restaurar.
     */
    const tablas = objetos.filter((o) => o.type === 'table');
    const resto  = objetos.filter((o) => o.type !== 'table');

    for (const tabla of tablas) {
      lineas.push(`${tabla.sql};`);
    }
    lineas.push('');

    for (const tabla of tablas) {
      const filas = (await db.query(`SELECT * FROM "${tabla.name}"`)).values ?? [];
      if (filas.length === 0) continue;

      lineas.push(`-- ${tabla.name}: ${filas.length} fila(s)`);
      for (const fila of filas as Record<string, unknown>[]) {
        const columnas = Object.keys(fila);
        const valores  = columnas.map((c) => valorSql(fila[c]));
        lineas.push(
          `INSERT INTO "${tabla.name}" (${columnas.map((c) => `"${c}"`).join(', ')}) ` +
          `VALUES (${valores.join(', ')});`
        );
      }
      lineas.push('');
    }

    for (const objeto of resto) {
      lineas.push(`${objeto.sql};`);
    }

    lineas.push('', 'COMMIT;', '');
    return lineas.join('\n');
  }

  async deleteDatabase(dbName: string): Promise<void> {
    if (!this.isSupported) {
      throw new Error(`${TAG} SQLite solo está disponible en plataforma nativa (Android/iOS). En web no hay base local.`);
    }

    const cached = this.connections.get(dbName);
    if (cached) {
      try {
        await cached.delete();
      } catch {
        // ignore delete errors
      }
      this.connections.delete(dbName);
      this.serializadas.delete(dbName);
    }

    await this.sqlite.closeConnection(dbName, false);
  }

  /*
   * Ejecuta `fn` dentro de una transacción: o se escribe todo o no se escribe
   * nada. Sin esto, una escritura que toca varias tablas puede fallar a mitad y
   * dejar filas huérfanas — una sucursal sin su vínculo al operador, o una
   * muestra sin detalle.
   *
   * La transacción ocupa el turno de escritura completo: ninguna otra escritura
   * corre hasta el commit o el rollback. Quien llega en medio espera, en lugar
   * de entrar en la transacción o —peor— revertirla.
   *
   * REGLA DE `fn`: usa SOLO la conexión que recibe. Va sin cola —la transacción
   * ya tiene el turno— y con `run`/`execute`/`executeSet` sin transacción propia
   * por default, así que no hace falta pasar `false`. Esperar una escritura por
   * `getConnection()` desde adentro es esperar el turno que la propia
   * transacción tiene tomado: se cuelga (y avisa a los 15 s).
   */
  async enTransaccion<T>(dbName: string, fn: (db: SQLiteDBConnection) => Promise<T>): Promise<T> {
    const db = await this.getConnection(dbName);
    return ejecutarEnTransaccion(db, this.exclusionDe(dbName), fn);
  }
}

/*
 * Convierte un valor de SQLite a su forma literal en SQL. Las comillas simples
 * se duplican —es el escape de SQLite, no la barra invertida— y los blobs van
 * como X'...' para que no se corrompan al pasar por texto.
 */
function valorSql(valor: unknown): string {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : 'NULL';
  if (typeof valor === 'boolean') return valor ? '1' : '0';
  if (valor instanceof Uint8Array) {
    const hex = Array.from(valor, (b) => b.toString(16).padStart(2, '0')).join('');
    return `X'${hex}'`;
  }
  return `'${String(valor).replace(/'/g, "''")}'`;
}
