import { Migration } from '../../core/database/migrations/migration.model';

/**
 * Schema completo de la app, replicando la estructura del backend
 * taxochil_ac-sodimac. Se ejecuta una sola vez al crear la base SQLite.
 * NOTA: counting_sessions se mantiene temporalmente por compatibilidad con
 * el flujo actual de sesiones; se eliminará cuando el conteo migre a sod_conteo.
 */
export const appSchemaMigration: Migration = {
  version: 1,
  name: 'app-schema-v1',
  statements: [
    'PRAGMA foreign_keys = ON;',

    // Roles
    `CREATE TABLE IF NOT EXISTS sod_rol (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      descripcion TEXT
    );`,

    // Usuarios
    `CREATE TABLE IF NOT EXISTS sod_user (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rol_id INTEGER NOT NULL,
      rut INTEGER NOT NULL,
      rut_dv TEXT NOT NULL,
      nombres TEXT NOT NULL,
      apellidos TEXT NOT NULL,
      correo TEXT,
      telefono TEXT,
      estado INTEGER DEFAULT 1,
      fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rol_id) REFERENCES sod_rol(id)
    );`,

    // Sucursales
    `CREATE TABLE IF NOT EXISTS sod_sucursal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo_sodimac TEXT NOT NULL UNIQUE,
      nombre TEXT NOT NULL,
      tipo TEXT NOT NULL DEFAULT 'T',
      zona_operativa TEXT,
      direccion TEXT,
      comuna TEXT,
      region TEXT,
      activo INTEGER DEFAULT 1
    );`,

    // Relación usuario-sucursal
    `CREATE TABLE IF NOT EXISTS sod_user_sucursal (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      sucursal_id INTEGER NOT NULL,
      soft_delete INTEGER DEFAULT 0,
      estado INTEGER DEFAULT 1,
      fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES sod_user(id),
      FOREIGN KEY (sucursal_id) REFERENCES sod_sucursal(id),
      UNIQUE(user_id, sucursal_id)
    );`,

    // Agenda de inventarios
    `CREATE TABLE IF NOT EXISTS sod_agenda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sucursal_id INTEGER NOT NULL,
      titulo TEXT,
      fecha_inicio TEXT NOT NULL,
      fecha_termino TEXT NOT NULL,
      tipo_periodo TEXT NOT NULL DEFAULT 'semanal',
      estado TEXT DEFAULT 'planificada',
      observaciones TEXT,
      fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sucursal_id) REFERENCES sod_sucursal(id)
    );`,

    // Eventos de inventario
    `CREATE TABLE IF NOT EXISTS sod_evento_inventario (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agenda_id INTEGER,
      sucursal_id INTEGER NOT NULL,
      coordinador_id INTEGER NOT NULL,
      analista_sodimac_id INTEGER NOT NULL,
      folio TEXT UNIQUE,
      fecha_programada TEXT NOT NULL,
      fecha_ejecucion TEXT,
      categoria TEXT,
      estado TEXT DEFAULT 'ABIERTO',
      fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (agenda_id) REFERENCES sod_agenda(id),
      FOREIGN KEY (sucursal_id) REFERENCES sod_sucursal(id),
      FOREIGN KEY (coordinador_id) REFERENCES sod_user(id),
      FOREIGN KEY (analista_sodimac_id) REFERENCES sod_user(id)
    );`,

    // Tipos de zona
    `CREATE TABLE IF NOT EXISTS sod_zona_tipo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL UNIQUE,
      descripcion TEXT
    );`,

    // Zonas
    `CREATE TABLE IF NOT EXISTS sod_zona (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sucursal_id INTEGER NOT NULL,
      zona_tipo_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      nombre TEXT,
      fecha_registro TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sucursal_id) REFERENCES sod_sucursal(id),
      FOREIGN KEY (zona_tipo_id) REFERENCES sod_zona_tipo(id)
    );`,

    // Ubicaciones
    `CREATE TABLE IF NOT EXISTS sod_ubicacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      zona_id INTEGER NOT NULL,
      codigo TEXT NOT NULL,
      tag TEXT,
      descripcion TEXT,
      FOREIGN KEY (zona_id) REFERENCES sod_zona(id)
    );`,

    // Asignación de zonas a operadores por evento
    `CREATE TABLE IF NOT EXISTS sod_asignacion_zona (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evento_id INTEGER NOT NULL,
      zona_id INTEGER NOT NULL,
      operador_id INTEGER NOT NULL,
      fecha_asignacion TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (evento_id) REFERENCES sod_evento_inventario(id),
      FOREIGN KEY (zona_id) REFERENCES sod_zona(id),
      FOREIGN KEY (operador_id) REFERENCES sod_user(id)
    );`,

    // PDAs
    `CREATE TABLE IF NOT EXISTS sod_pda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      marca TEXT,
      modelo TEXT,
      activo INTEGER DEFAULT 1
    );`,

    // Productos
    `CREATE TABLE IF NOT EXISTS sod_producto (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      codigo_barras TEXT,
      descripcion TEXT,
      categoria TEXT,
      unidad_medida TEXT,
      control_peso INTEGER DEFAULT 0
    );`,

    // Muestras
    `CREATE TABLE IF NOT EXISTS sod_muestra (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evento_id INTEGER NOT NULL,
      sucursal_id INTEGER NOT NULL,
      nombre_archivo TEXT,
      categoria TEXT,
      fecha_envio TEXT,
      fecha_carga TEXT,
      observaciones TEXT,
      FOREIGN KEY (evento_id) REFERENCES sod_evento_inventario(id),
      FOREIGN KEY (sucursal_id) REFERENCES sod_sucursal(id)
    );`,

    // Detalle de muestras
    `CREATE TABLE IF NOT EXISTS sod_muestra_detalle (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      muestra_id INTEGER NOT NULL,
      producto_id INTEGER NOT NULL,
      stock_sistema REAL DEFAULT 0,
      ubicacion_esperada TEXT,
      FOREIGN KEY (muestra_id) REFERENCES sod_muestra(id),
      FOREIGN KEY (producto_id) REFERENCES sod_producto(id)
    );`,

    // Conteos
    `CREATE TABLE IF NOT EXISTS sod_conteo (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evento_id INTEGER NOT NULL,
      ubicacion_id INTEGER,
      producto_id INTEGER NOT NULL,
      operador_id INTEGER NOT NULL,
      pda_id INTEGER NOT NULL,
      cantidad_fisica REAL NOT NULL,
      tipo_conteo TEXT DEFAULT 'VENTA',
      es_altillo INTEGER DEFAULT 0,
      storage_asociado TEXT,
      fecha_hora TEXT DEFAULT CURRENT_TIMESTAMP,
      observaciones TEXT,
      FOREIGN KEY (evento_id) REFERENCES sod_evento_inventario(id),
      FOREIGN KEY (ubicacion_id) REFERENCES sod_ubicacion(id),
      FOREIGN KEY (producto_id) REFERENCES sod_producto(id),
      FOREIGN KEY (operador_id) REFERENCES sod_user(id),
      FOREIGN KEY (pda_id) REFERENCES sod_pda(id)
    );`,

    // Sincronizaciones
    `CREATE TABLE IF NOT EXISTS sod_sincronizacion (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      evento_id INTEGER NOT NULL,
      pda_id INTEGER NOT NULL,
      coordinador_id INTEGER NOT NULL,
      tipo TEXT NOT NULL,
      fecha_hora TEXT DEFAULT CURRENT_TIMESTAMP,
      registros_procesados INTEGER,
      observaciones TEXT,
      FOREIGN KEY (evento_id) REFERENCES sod_evento_inventario(id),
      FOREIGN KEY (pda_id) REFERENCES sod_pda(id),
      FOREIGN KEY (coordinador_id) REFERENCES sod_user(id)
    );`,

    // Tabla temporal de compatibilidad para sesiones de conteo actuales
    `CREATE TABLE IF NOT EXISTS counting_sessions (
      id TEXT PRIMARY KEY,
      tag TEXT NOT NULL,
      zone TEXT NOT NULL,
      status TEXT NOT NULL,
      synced INTEGER DEFAULT 0,
      edited INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      items TEXT NOT NULL,
      total_items INTEGER DEFAULT 0,
      total_quantity INTEGER DEFAULT 0
    );`,

    // Índices útiles
    'CREATE INDEX IF NOT EXISTS idx_user_rut ON sod_user(rut);',
    'CREATE INDEX IF NOT EXISTS idx_evento_sucursal ON sod_evento_inventario(sucursal_id);',
    'CREATE INDEX IF NOT EXISTS idx_evento_estado ON sod_evento_inventario(estado);',
    'CREATE INDEX IF NOT EXISTS idx_zona_sucursal ON sod_zona(sucursal_id);',
    'CREATE INDEX IF NOT EXISTS idx_ubicacion_zona ON sod_ubicacion(zona_id);',
    'CREATE INDEX IF NOT EXISTS idx_asignacion_operador ON sod_asignacion_zona(operador_id);',
    'CREATE INDEX IF NOT EXISTS idx_asignacion_evento ON sod_asignacion_zona(evento_id);',
    'CREATE INDEX IF NOT EXISTS idx_muestra_detalle_producto ON sod_muestra_detalle(producto_id);',
    'CREATE INDEX IF NOT EXISTS idx_conteo_evento ON sod_conteo(evento_id);',
    'CREATE INDEX IF NOT EXISTS idx_conteo_operador ON sod_conteo(operador_id);',
  ],
};
