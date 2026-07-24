export const SODIMAC_DB_NAME = 'sodimac';
export const SODIMAC_DB_VERSION = 18;

// Orden de creación respeta dependencias FK de arriba hacia abajo.
const TABLES: readonly string[] = [

  `CREATE TABLE IF NOT EXISTS sod_rol (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT    NOT NULL UNIQUE,
    descripcion TEXT
  )`,

  `CREATE TABLE IF NOT EXISTS sod_user (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    rol_id           INTEGER NOT NULL REFERENCES sod_rol(id),
    rut              INTEGER NOT NULL,
    rut_dv           TEXT    NOT NULL,
    nombres          TEXT    DEFAULT NULL,
    apellido_paterno TEXT    DEFAULT NULL,
    apellido_materno TEXT    DEFAULT NULL,
    correo           TEXT    NOT NULL,
    fecha_registro   TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (rut, rut_dv),
    UNIQUE (correo)
  )`,

  `CREATE TABLE IF NOT EXISTS sod_sucursal (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_tienda  TEXT    NOT NULL UNIQUE,
    nombre         TEXT    NOT NULL,
    zona_operativa TEXT    DEFAULT NULL,
    activo         INTEGER NOT NULL DEFAULT 1
  )`,

  `CREATE TABLE IF NOT EXISTS sod_user_sucursal (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES sod_user(id),
    sucursal_id INTEGER NOT NULL REFERENCES sod_sucursal(id),
    soft_delete INTEGER NOT NULL DEFAULT 0,
    estado      INTEGER NOT NULL DEFAULT 1
  )`,

  `CREATE TABLE IF NOT EXISTS sod_agenda (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id INTEGER NOT NULL REFERENCES sod_sucursal(id),
    titulo      TEXT    NOT NULL,
    fecha_inicio  TEXT  NOT NULL,
    fecha_termino TEXT  NOT NULL,
    fecha_registro TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS sod_evento_inventario (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    agenda_id           INTEGER          DEFAULT NULL REFERENCES sod_agenda(id),
    sucursal_id         INTEGER NOT NULL REFERENCES sod_sucursal(id),
    fecha_programada    TEXT    NOT NULL,
    fecha_ejecucion     TEXT             DEFAULT NULL,
    estado              TEXT    NOT NULL DEFAULT 'ABIERTO',
    fecha_registro      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
)`,

  `CREATE TABLE IF NOT EXISTS sod_producto (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    sku           TEXT    NOT NULL UNIQUE,
    codigo_barras TEXT    DEFAULT NULL,
    descripcion   TEXT    DEFAULT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sod_muestra (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id      INTEGER NOT NULL REFERENCES sod_evento_inventario(id),
    sucursal_id    INTEGER NOT NULL REFERENCES sod_sucursal(id),
    nombre_archivo TEXT             DEFAULT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sod_muestra_detalle (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    muestra_id         INTEGER NOT NULL REFERENCES sod_muestra(id),
    producto_id        INTEGER NOT NULL REFERENCES sod_producto(id),
    stock_sistema      REAL    NOT NULL DEFAULT 0.00,
    ubicacion_esperada TEXT             DEFAULT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sod_pda (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo  TEXT    NOT NULL UNIQUE,
    marca   TEXT    DEFAULT NULL,
    modelo  TEXT    DEFAULT NULL,
    activo  INTEGER NOT NULL DEFAULT 1
  )`,

  `CREATE TABLE IF NOT EXISTS sod_zona_tipo (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre      TEXT    NOT NULL UNIQUE,
    descripcion TEXT    DEFAULT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sod_zona (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id    INTEGER NOT NULL REFERENCES sod_sucursal(id),
    zona_tipo_id   INTEGER NOT NULL REFERENCES sod_zona_tipo(id),
    codigo         TEXT    NOT NULL,
    nombre         TEXT    DEFAULT NULL,
    fecha_registro TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS sod_ubicacion (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    zona_id     INTEGER NOT NULL REFERENCES sod_zona(id),
    codigo      TEXT    NOT NULL,
    tag         TEXT    DEFAULT NULL,
    descripcion TEXT    DEFAULT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sod_asignacion_zona (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id        INTEGER NOT NULL REFERENCES sod_evento_inventario(id),
    zona_id          INTEGER NOT NULL REFERENCES sod_zona(id),
    operador_id      INTEGER NOT NULL REFERENCES sod_user(id),
    fecha_asignacion TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS sod_sincronizacion (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id            INTEGER NOT NULL REFERENCES sod_evento_inventario(id),
    pda_id               INTEGER NOT NULL REFERENCES sod_pda(id),
    tipo                 TEXT    NOT NULL CHECK (tipo IN ('DESCARGA_A_PDA', 'CARGA_DESDE_PDA')),
    fecha_hora           TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    registros_procesados INTEGER          DEFAULT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sod_conteo (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id        INTEGER NOT NULL REFERENCES sod_evento_inventario(id),
    ubicacion_id     INTEGER DEFAULT NULL REFERENCES sod_ubicacion(id),
    producto_id      INTEGER NOT NULL REFERENCES sod_producto(id),
    operador_id      INTEGER NOT NULL REFERENCES sod_user(id),
    pda_id           INTEGER NOT NULL REFERENCES sod_pda(id),
    cantidad_fisica  REAL    NOT NULL,
    estado           TEXT    NOT NULL DEFAULT 'EN_CURSO' CHECK (estado IN ('EN_CURSO', 'FINALIZADO', 'SINCRONIZADO')),
    fecha_hora       TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`

];

const SEED = `
  INSERT OR IGNORE INTO sod_rol (nombre, descripcion) VALUES
    ('Operador de Inventario', 'Realiza conteos con PDA'),
    ('Coordinador',            'Coordina eventos de inventario'),
    ('Analista Sodimac',       'Analista de la tienda');
`;

export const SODIMAC_TABLE_NAMES = [
  'sod_rol',
  'sod_user',
  'sod_sucursal',
  'sod_user_sucursal',
  'sod_agenda',
  'sod_evento_inventario',
  'sod_producto',
  'sod_muestra',
  'sod_muestra_detalle',
  'sod_pda',
  'sod_zona_tipo',
  'sod_zona',
  'sod_ubicacion',
  'sod_asignacion_zona',
  'sod_sincronizacion',
  'sod_conteo',
] as const;

export type SodimacTableName = typeof SODIMAC_TABLE_NAMES[number];

export const SODIMAC_SCHEMA_SQL = TABLES.map((s) => `${s};`).join('\n') + '\n' + SEED;
