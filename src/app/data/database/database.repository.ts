// ============================================================
// data/database/database.repository.ts
// Implementacion SQLite del DatabaseRepository: abre/crea la
// base local "sodimac" y aplica el esquema (tablas vacias) que
// espeja taxochil_ac-sodimac. Punto de entrada del offline-first.
// ============================================================

import { Injectable, inject, isDevMode } from '@angular/core';
import { Preferences } from '@capacitor/preferences';
import { DatabaseRepository } from '../../domain/database/repositories/database.repository';
import { RESPALDO_REPOSITORY_TOKEN } from '../../domain/respaldo/repositories/respaldo.repository';
import { SqliteConnectionService } from '../../core/database/sqlite-connection.service';
import { SODIMAC_DB_NAME, SODIMAC_DB_VERSION, SODIMAC_TABLE_NAMES, SODIMAC_SCHEMA_SQL, SODIMAC_META_TABLE_SQL } from '../../core/database/sodimac.schema';
import { Migracion, PlanEsquema, planificarEsquema, resolverVersionInicial } from '../../core/database/migraciones';

const TAG = '[SqliteDatabaseRepository]';

/*
 * Donde vivía la versión antes de que existiera sod_meta. Se sigue leyendo —y
 * escribiendo— por una razón: es lo único que distingue una PDA que ya trabajó
 * con el esquema viejo de una instalación nueva. Sin eso, la primera APK con
 * migraciones borraría justo los datos que viene a proteger.
 */
const VERSION_KEY = 'sodimac_db_version_aplicada';

const CLAVE_VERSION = 'schema_version';

@Injectable({ providedIn: 'root' })
export class SqliteDatabaseRepository implements DatabaseRepository {
  private connection = inject(SqliteConnectionService);
  private respaldo   = inject(RESPALDO_REPOSITORY_TOKEN);

  async resetLocalDatabase(): Promise<void> {
    if (!this.connection.isSupported) {
      if (isDevMode()) console.log(`${TAG} resetLocalDatabase: plataforma no nativa — nada que borrar`);
      return;
    }

    try {
      if (isDevMode()) console.log(`${TAG} resetLocalDatabase: borrando base SQLite física...`);
      await this.connection.deleteDatabase(SODIMAC_DB_NAME);

      await Preferences.remove({ key: VERSION_KEY });
      if (isDevMode()) console.log(`${TAG} resetLocalDatabase: preference de versión eliminada`);

      if (isDevMode()) console.log(`${TAG} resetLocalDatabase: recreando esquema limpio...`);
      const db = await this.connection.getConnection(SODIMAC_DB_NAME);
      await db.execute(SODIMAC_SCHEMA_SQL);
      await this.registrarVersion(SODIMAC_DB_VERSION);

      if (isDevMode()) console.log(`${TAG} resetLocalDatabase: base reiniciada correctamente`);
    } catch (err) {
      console.error(`${TAG} fallo al reiniciar la base local:`, err);
      throw err;
    }
  }

  async initialize(): Promise<void> {
    if (!this.connection.isSupported) {
      if (isDevMode()) console.log(`${TAG} plataforma no nativa (web) - se omite la inicializacion de SQLite`);
      return;
    }

    if (isDevMode()) console.log(`${TAG} inicializando base "${SODIMAC_DB_NAME}" (schema v${SODIMAC_DB_VERSION})...`);

    try {
      /*
       * sod_meta primero y sola: las migraciones registran su avance ahí, y eso
       * ocurre antes de aplicar el resto del esquema. Crearla junto con las
       * demás dejaría a aplicarMigraciones escribiendo en una tabla inexistente.
       */
      const conexion = await this.connection.getConnection(SODIMAC_DB_NAME);
      await conexion.execute(`${SODIMAC_META_TABLE_SQL};`);

      const versionActual = await this.leerVersionActual();
      const plan = planificarEsquema(versionActual, SODIMAC_DB_VERSION);

      if (isDevMode()) {
        console.log(`${TAG} v${versionActual ?? 'ninguna'} → v${SODIMAC_DB_VERSION}:`, plan.tipo);
      }

      await this.ejecutarPlan(plan);

      /*
       * El esquema se aplica SIEMPRE, después de las migraciones: es lo que crea
       * las tablas e índices nuevos sobre una base existente (todo va con
       * IF NOT EXISTS). Por eso agregar una tabla no necesita migración.
       */
      const db = await this.connection.getConnection(SODIMAC_DB_NAME);
      await db.execute(SODIMAC_SCHEMA_SQL);

      if (!(await this.verificarTablas())) return;

      // La versión se persiste solo cuando el esquema quedó aplicado completo.
      await this.registrarVersion(SODIMAC_DB_VERSION);
      if (isDevMode()) console.log(`${TAG} listo - esquema v${SODIMAC_DB_VERSION} aplicado`);
    } catch (err) {
      console.error(`${TAG} fallo al inicializar la base local:`, err);
    }
  }

  private async ejecutarPlan(plan: PlanEsquema): Promise<void> {
    switch (plan.tipo) {
      case 'NUEVA':
      case 'AL_DIA':
        return;

      case 'RECREAR':
        console.warn(`${TAG} se recrea la base desde cero: ${plan.motivo}`);
        await this.recrearTablas();
        return;

      case 'MIGRAR':
        if (plan.migraciones.length === 0) {
          if (isDevMode()) console.log(`${TAG} sin migraciones que aplicar — el esquema nuevo se resuelve con IF NOT EXISTS`);
          return;
        }
        await this.respaldarAntesDeMigrar(plan.migraciones);
        await this.aplicarMigraciones(plan.migraciones);
        return;
    }
  }

  /*
   * Un respaldo antes de tocar el esquema. Es la diferencia entre "se perdieron
   * los conteos" y "están en un .zip en el equipo": para una funcionalidad cuyo
   * único trabajo es no perder datos, el costo de unos segundos al primer
   * arranque tras actualizar es barato.
   *
   * No es bloqueante a propósito. Si el respaldo falla —sin espacio, sin
   * permisos— igual conviene migrar: quedarse en un esquema viejo con código
   * nuevo rompe la app entera, que es peor que quedarse sin la copia.
   */
  private async respaldarAntesDeMigrar(migraciones: readonly Migracion[]): Promise<void> {
    try {
      const creado = await this.respaldo.respaldarBaseLocal();
      console.log(
        `${TAG} respaldo previo a migrar (${migraciones.length} migración/es): ${creado.carpeta}/${creado.archivo}`
      );
    } catch (err) {
      console.error(`${TAG} no se pudo respaldar antes de migrar — se continúa igual:`, err);
    }
  }

  /*
   * Cada migración en su propia transacción, y la versión se registra al
   * terminar cada una. Si la tercera falla, las dos primeras quedan aplicadas y
   * registradas: la base queda en un punto conocido y el próximo arranque
   * retoma desde ahí, en vez de quedar a medio camino sin que nadie sepa dónde.
   */
  private async aplicarMigraciones(migraciones: readonly Migracion[]): Promise<void> {
    for (const migracion of migraciones) {
      console.log(`${TAG} aplicando migración v${migracion.version}: ${migracion.descripcion}`);
      await this.connection.enTransaccion(SODIMAC_DB_NAME, async (db) => {
        for (const sentencia of migracion.sql) {
          // El tercer argumento en false: enTransaccion ya abrió una y cada
          // db.run() abriría la suya por default.
          await db.run(sentencia, [], false);
        }
      });
      await this.registrarVersion(migracion.version);
    }
  }

  private async recrearTablas(): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.execute('PRAGMA foreign_keys = OFF;');
    // Tablas activas en orden inverso de dependencias FK + legacy de versiones antiguas.
    const activasReversa = [...SODIMAC_TABLE_NAMES].reverse()
      .map((t) => `DROP TABLE IF EXISTS ${t};`).join('\n');
    await db.execute(`
      ${activasReversa}
      DROP TABLE IF EXISTS cat_operador;
      DROP TABLE IF EXISTS cat_zona;
      DROP TABLE IF EXISTS cat_ubicacion;
      DROP TABLE IF EXISTS cat_muestra_info;
      DROP TABLE IF EXISTS cat_producto;
      DROP TABLE IF EXISTS conteo_local;
      DROP TABLE IF EXISTS sesion_trabajo;
      DROP TABLE IF EXISTS sod_agenda_muestra;
      DROP TABLE IF EXISTS sod_muestra_codigo;
      DROP TABLE IF EXISTS sod_producto_barra;
      DROP TABLE IF EXISTS sod_evento;
    `);
    await db.execute('PRAGMA foreign_keys = ON;');
  }

  private async verificarTablas(): Promise<boolean> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    const result = await db.query(
      `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`
    );
    const creadas = (result.values ?? []).map((row: Record<string, unknown>) => row['name'] as string);
    const faltan = SODIMAC_TABLE_NAMES.filter((name) => !creadas.includes(name));

    if (faltan.length > 0) {
      console.error(`${TAG} faltan tablas tras aplicar el esquema:`, faltan);
      return false;
    }
    if (isDevMode()) console.log(`${TAG} ${creadas.length}/${SODIMAC_TABLE_NAMES.length} tablas verificadas`);
    return true;
  }

  /*
   * Estado de la base antes de tocarla. sod_meta puede no existir todavía —el
   * esquema se aplica más abajo—, así que la consulta va tolerada.
   */
  private async leerVersionActual(): Promise<number | null> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);

    let versionEnMeta: number | null = null;
    try {
      const fila = await db.query(`SELECT valor FROM sod_meta WHERE clave = ?`, [CLAVE_VERSION]);
      const valor = (fila.values?.[0] as Record<string, unknown> | undefined)?.['valor'];
      const numero = Number(valor);
      if (Number.isInteger(numero)) versionEnMeta = numero;
    } catch {
      // sod_meta todavía no existe: base anterior a esta versión, o recién creada.
    }

    const { value } = await Preferences.get({ key: VERSION_KEY });
    const desdePreferences = value === null || value === undefined ? null : Number(value);
    const versionEnPreferences = Number.isInteger(desdePreferences) ? (desdePreferences as number) : null;

    const tablas = await db.query(
      `SELECT COUNT(*) AS total FROM sqlite_master WHERE type = 'table' AND name LIKE 'sod_%'`
    );
    const hayTablas = Number((tablas.values?.[0] as Record<string, unknown> | undefined)?.['total'] ?? 0) > 0;

    return resolverVersionInicial({ versionEnMeta, versionEnPreferences, hayTablas });
  }

  /*
   * Se escribe en los dos lados: sod_meta es la fuente de verdad de acá en
   * adelante, y Preferences queda por si el equipo llegara a instalar una APK
   * anterior, que solo sabe leer de ahí.
   */
  private async registrarVersion(version: number): Promise<void> {
    const db = await this.connection.getConnection(SODIMAC_DB_NAME);
    await db.run(
      `INSERT INTO sod_meta (clave, valor) VALUES (?, ?)
       ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor`,
      [CLAVE_VERSION, String(version)]
    );
    await Preferences.set({ key: VERSION_KEY, value: String(version) });
  }
}
