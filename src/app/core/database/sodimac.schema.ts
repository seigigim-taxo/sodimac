export const SODIMAC_DB_NAME = 'sodimac';
export const SODIMAC_DB_VERSION = 35;

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
    estado      INTEGER NOT NULL DEFAULT 1
  )`,

  `CREATE TABLE IF NOT EXISTS sod_evento_inventario (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id         INTEGER NOT NULL REFERENCES sod_sucursal(id),
    nombre              TEXT    NOT NULL DEFAULT '',
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
    evento_id      INTEGER NOT NULL UNIQUE REFERENCES sod_evento_inventario(id),
    sucursal_id    INTEGER NOT NULL REFERENCES sod_sucursal(id),
    nombre         TEXT             DEFAULT NULL,
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

  `CREATE TABLE IF NOT EXISTS sod_zona (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sucursal_id INTEGER NOT NULL REFERENCES sod_sucursal(id),
    nombre      TEXT    NOT NULL,
    descripcion TEXT    DEFAULT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sod_ubicacion (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    zona_id     INTEGER NOT NULL REFERENCES sod_zona(id),
    codigo      TEXT    NOT NULL,
    tag         TEXT    DEFAULT NULL,
    descripcion TEXT    DEFAULT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS sod_asignacion (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id        INTEGER NOT NULL REFERENCES sod_evento_inventario(id),
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

  /*
   * LA RONDA. Se crea VACÍA al abrir la iteración, no al primer escaneo: por eso
   * "ronda 2 abierta y sin contar" es distinguible de "ronda 1 cerrada", que es
   * justo lo que antes no se podía y hacía que las rondas se mezclaran.
   * El UNIQUE hace idempotente abrir la misma iteración dos veces.
   */
  `CREATE TABLE IF NOT EXISTS sod_conteo (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id      INTEGER NOT NULL REFERENCES sod_evento_inventario(id),
    iteracion      INTEGER NOT NULL,
    estado         TEXT    NOT NULL DEFAULT 'ABIERTO'
                   CHECK (estado IN ('ABIERTO', 'FINALIZADO', 'SINCRONIZADO')),
    fecha_apertura TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre   TEXT             DEFAULT NULL,
    UNIQUE (evento_id, iteracion)
  )`,

  /*
   * LO CONTADO. El TAG entra por relación (ubicacion_id), no como columna de la
   * ronda: un mismo TAG se cuenta en varias rondas y una ronda toca varios TAGs.
   * operador_id y pda_id van acá porque varios operadores trabajan la misma ronda.
   */
  `CREATE TABLE IF NOT EXISTS sod_conteo_detalle (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conteo_id       INTEGER NOT NULL REFERENCES sod_conteo(id),
    ubicacion_id    INTEGER NOT NULL REFERENCES sod_ubicacion(id),
    producto_id     INTEGER NOT NULL REFERENCES sod_producto(id),
    operador_id     INTEGER NOT NULL REFERENCES sod_user(id),
    pda_id          INTEGER NOT NULL REFERENCES sod_pda(id),
    cantidad_fisica REAL    NOT NULL,
    estado          TEXT    NOT NULL DEFAULT 'EN_CURSO'
                    CHECK (estado IN ('EN_CURSO', 'FINALIZADO', 'SINCRONIZADO')),
    fecha_hora      TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (conteo_id, ubicacion_id, producto_id, operador_id, pda_id)
  )`

];

/*
 * Índice único PARCIAL: un evento no puede tener dos rondas abiertas a la vez.
 *
 * "La ronda activa" tiene que tener una sola respuesta. Si hubiera dos, volvería
 * el problema que motivó separar sod_conteo de sod_conteo_detalle: un estado que
 * se resuelve por el ORDER BY de la consulta y no por un hecho registrado.
 *
 * El código ya cierra la anterior antes de abrir la siguiente; esto lo vuelve
 * imposible de romper por olvido. Solo restringe las filas ABIERTO, así que
 * quedan tantas cerradas como haga falta.
 */
const INDICES: readonly string[] = [
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_sod_conteo_ronda_abierta
     ON sod_conteo (evento_id) WHERE estado = 'ABIERTO'`,
];

const SEED = `
  INSERT OR IGNORE INTO sod_rol (nombre, descripcion) VALUES
    ('Operador de Inventario', 'Realiza conteos con PDA');
`;

export const SODIMAC_TABLE_NAMES = [
  'sod_rol',
  'sod_user',
  'sod_sucursal',
  'sod_user_sucursal',
  'sod_evento_inventario',
  'sod_producto',
  'sod_muestra',
  'sod_muestra_detalle',
  'sod_pda',
  'sod_zona',
  'sod_ubicacion',
  'sod_asignacion',
  'sod_sincronizacion',
  'sod_conteo',
  'sod_conteo_detalle',
] as const;

export type SodimacTableName = typeof SODIMAC_TABLE_NAMES[number];

export const SODIMAC_SCHEMA_SQL =
  TABLES.map((s) => `${s};`).join('\n') + '\n' +
  INDICES.map((s) => `${s};`).join('\n') + '\n' +
  SEED;
