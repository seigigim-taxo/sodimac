export const SODIMAC_DB_NAME = 'sodimac';
export const SODIMAC_DB_VERSION = 47;

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
    tipo_usuario     TEXT    DEFAULT NULL,
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

  `CREATE TABLE IF NOT EXISTS sod_producto_detalle (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id    INTEGER NOT NULL REFERENCES sod_producto(id),
    codigo_lectura TEXT    NOT NULL,
    tipo_codigo    TEXT    DEFAULT NULL,
    codigo_barras  TEXT    DEFAULT NULL,
    UNIQUE (codigo_lectura)
  )`,

  `CREATE TABLE IF NOT EXISTS sod_muestra (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id      INTEGER NOT NULL REFERENCES sod_evento_inventario(id),
    sucursal_id    INTEGER NOT NULL REFERENCES sod_sucursal(id),
    iteracion      INTEGER NOT NULL DEFAULT 1,
    estado         TEXT    NOT NULL DEFAULT 'ACTIVA',
    nombre         TEXT             DEFAULT NULL,
    nombre_archivo TEXT             DEFAULT NULL,
    codigo_muestra TEXT             DEFAULT NULL,
    id_agenda      INTEGER          DEFAULT NULL,
    numero_agenda  TEXT             DEFAULT NULL,
    UNIQUE (evento_id, iteracion)
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
    descripcion TEXT    DEFAULT NULL,
    tag_desde   INTEGER DEFAULT NULL,
    tag_hasta   INTEGER DEFAULT NULL
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
    evento_id            INTEGER          DEFAULT NULL REFERENCES sod_evento_inventario(id),
    pda_id               INTEGER          DEFAULT NULL REFERENCES sod_pda(id),
    tipo                 TEXT    NOT NULL CHECK (tipo IN ('DESCARGA_A_PDA', 'CARGA_DESDE_PDA')),
    operacion            TEXT             DEFAULT NULL CHECK (operacion IN ('PREPARACION', 'TAG_FINALIZADO', 'VALIDACION_OPERACIONAL')),
    perfil               TEXT             DEFAULT NULL CHECK (perfil IN ('OPERADOR', 'ANALISTA_CLIENTE')),
    iteracion            INTEGER          DEFAULT NULL,
    conteo_id            INTEGER          DEFAULT NULL REFERENCES sod_conteo(id),
    ubicacion_id         INTEGER          DEFAULT NULL REFERENCES sod_ubicacion(id),
    operador_id          INTEGER          DEFAULT NULL REFERENCES sod_user(id),
    carga_uid            TEXT             DEFAULT NULL UNIQUE,
    payload_json         TEXT             DEFAULT NULL,
    estado               TEXT    NOT NULL DEFAULT 'ENVIADO'
                         CHECK (estado IN ('PENDIENTE', 'ENVIADO', 'ERROR')),
    error                TEXT             DEFAULT NULL,
    intentos             INTEGER NOT NULL DEFAULT 0,
    fecha_hora           TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_ultimo_intento TEXT             DEFAULT NULL,
    fecha_envio          TEXT             DEFAULT NULL,
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
    carga_uid       TEXT             DEFAULT NULL,
    codigo_lectura  TEXT             DEFAULT NULL,
    UNIQUE (conteo_id, ubicacion_id, producto_id, operador_id, pda_id)
  )`,

  /* ========================================================================
     VALIDACIÓN OPERACIONAL — tablas específicas para flujos de analista.
     Se crean en fase A0.5 para evitar descargar muestras/productos completos.
     ======================================================================== */

  `CREATE TABLE IF NOT EXISTS sod_validacion_jornada (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id       INTEGER NOT NULL REFERENCES sod_evento_inventario(id),
    sucursal_id     INTEGER NOT NULL REFERENCES sod_sucursal(id),
    id_agenda       INTEGER          DEFAULT NULL,
    numero_agenda   TEXT             DEFAULT NULL,
    codigo_muestra  TEXT             DEFAULT NULL,
    nombre_muestra  TEXT             DEFAULT NULL,
    fecha_jornada   TEXT             DEFAULT NULL,
    estado          TEXT    NOT NULL DEFAULT 'ABIERTO'
                    CHECK (estado IN ('ABIERTO', 'EN_CURSO', 'FINALIZADO', 'SINCRONIZADO')),
    fecha_registro  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (evento_id, sucursal_id, id_agenda)
  )`,

  `CREATE TABLE IF NOT EXISTS sod_validacion_bloque (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    jornada_id            INTEGER NOT NULL REFERENCES sod_validacion_jornada(id),
    tipo_validacion       TEXT    NOT NULL
                          CHECK (tipo_validacion IN ('ALTILLOS', 'PUNTO_VENTA', 'PRE_VARIANCE', 'RECUENTO')),
    codigo_zona           TEXT             DEFAULT NULL,
    nombre_zona           TEXT             DEFAULT NULL,
    objetivo_porcentaje   REAL    NOT NULL DEFAULT 0,
    tags_usados           INTEGER NOT NULL DEFAULT 0,
    tags_confirmados      INTEGER NOT NULL DEFAULT 0,
    tags_pendientes       INTEGER NOT NULL DEFAULT 0,
    porcentaje            REAL    NOT NULL DEFAULT 0,
    cumple                INTEGER NOT NULL DEFAULT 0,
    fecha_registro        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (jornada_id, tipo_validacion)
  )`,

  `CREATE TABLE IF NOT EXISTS sod_validacion_tag (
    id                    INTEGER PRIMARY KEY AUTOINCREMENT,
    bloque_id             INTEGER NOT NULL REFERENCES sod_validacion_bloque(id),
    id_tag_backend        INTEGER          DEFAULT NULL,
    numero_tag            INTEGER          DEFAULT NULL,
    codigo_zona           TEXT             DEFAULT NULL,
    nombre_zona           TEXT             DEFAULT NULL,
    productos_total       INTEGER NOT NULL DEFAULT 0,
    productos_confirmados INTEGER NOT NULL DEFAULT 0,
    estado_validacion     TEXT    NOT NULL DEFAULT 'PENDIENTE'
                          CHECK (estado_validacion IN ('PENDIENTE', 'CONFIRMADO')),
    fecha_registro        TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS sod_validacion_producto (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id                 INTEGER NOT NULL REFERENCES sod_validacion_tag(id),
    id_tag_backend         INTEGER          DEFAULT NULL,
    numero_tag             INTEGER          DEFAULT NULL,
    id_producto_backend    INTEGER          DEFAULT NULL,
    sku                    TEXT    NOT NULL,
    descripcion            TEXT             DEFAULT NULL,
    cantidad_inventariada  REAL    NOT NULL DEFAULT 0,
    cantidad_analista      REAL             DEFAULT NULL,
    estado_validacion      TEXT    NOT NULL DEFAULT 'PENDIENTE'
                           CHECK (estado_validacion IN ('PENDIENTE', 'CONFIRMADO')),
    fl_incorporado         TEXT    NOT NULL DEFAULT 'N'
                           CHECK (fl_incorporado IN ('S', 'N')),
    fecha_registro         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  /* ========================================================================
     PRE VARIANCE — tablas específicas para revisión contra Kárdex.
     ======================================================================== */

  `CREATE TABLE IF NOT EXISTS sod_pre_variance_producto (
    id                              INTEGER PRIMARY KEY AUTOINCREMENT,
    jornada_id                      INTEGER NOT NULL REFERENCES sod_validacion_jornada(id),
    id_producto_backend             INTEGER          DEFAULT NULL,
    sku                             TEXT    NOT NULL,
    descripcion                     TEXT             DEFAULT NULL,
    stock_teorico                   REAL    NOT NULL DEFAULT 0,
    valor_unitario                  REAL    NOT NULL DEFAULT 0,
    inventariado_antes_pre_variance REAL    NOT NULL DEFAULT 0,
    fisico_vigente                  REAL    NOT NULL DEFAULT 0,
    diferencia_unidades             REAL    NOT NULL DEFAULT 0,
    diferencia_en_costo             REAL    NOT NULL DEFAULT 0,
    estado_pre_variance             TEXT    NOT NULL DEFAULT 'PENDIENTE'
                                    CHECK (estado_pre_variance IN ('PENDIENTE', 'REVISADO')),
    fecha_registro                  TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS sod_pre_variance_ubicacion (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id            INTEGER NOT NULL REFERENCES sod_pre_variance_producto(id),
    id_tag_backend         INTEGER          DEFAULT NULL,
    numero_tag             INTEGER          DEFAULT NULL,
    zona                   TEXT             DEFAULT NULL,
    cantidad_inventariada  REAL    NOT NULL DEFAULT 0,
    cantidad_pre_variance  REAL             DEFAULT NULL,
    fecha_registro         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  /* ========================================================================
     RECUENTO — tablas específicas para el Conteo 3.
     ======================================================================== */

  `CREATE TABLE IF NOT EXISTS sod_recuento_producto (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    jornada_id             INTEGER NOT NULL REFERENCES sod_validacion_jornada(id),
    id_producto_backend    INTEGER          DEFAULT NULL,
    sku                    TEXT    NOT NULL,
    descripcion            TEXT             DEFAULT NULL,
    stock_teorico          REAL    NOT NULL DEFAULT 0,
    valor_unitario         REAL    NOT NULL DEFAULT 0,
    fisico_actual          REAL    NOT NULL DEFAULT 0,
    diferencia_unidades    REAL    NOT NULL DEFAULT 0,
    diferencia_en_costo    REAL    NOT NULL DEFAULT 0,
    es_pre_variance        INTEGER NOT NULL DEFAULT 0,
    estado_recuento        TEXT    NOT NULL DEFAULT 'PENDIENTE'
                           CHECK (estado_recuento IN ('PENDIENTE', 'RECONTADO')),
    fecha_registro         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS sod_recuento_ubicacion (
    id                     INTEGER PRIMARY KEY AUTOINCREMENT,
    producto_id            INTEGER NOT NULL REFERENCES sod_recuento_producto(id),
    id_tag_backend         INTEGER          DEFAULT NULL,
    numero_tag             INTEGER          DEFAULT NULL,
    zona                   TEXT             DEFAULT NULL,
    cantidad_inventariada  REAL    NOT NULL DEFAULT 0,
    cantidad_recuento      REAL             DEFAULT NULL,
    fecha_registro         TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`

];

// Índices para mejorar performance de consultas, joins y deletes frecuentes.
const INDEXES: readonly string[] = [
  `CREATE INDEX IF NOT EXISTS idx_producto_detalle_producto ON sod_producto_detalle(producto_id)`,
  `CREATE INDEX IF NOT EXISTS idx_muestra_detalle_muestra ON sod_muestra_detalle(muestra_id)`,
  `CREATE INDEX IF NOT EXISTS idx_muestra_detalle_producto ON sod_muestra_detalle(producto_id)`,
  `CREATE INDEX IF NOT EXISTS idx_zona_sucursal_nombre ON sod_zona(sucursal_id, nombre)`,
  `CREATE INDEX IF NOT EXISTS idx_evento_sucursal_fecha ON sod_evento_inventario(sucursal_id, fecha_programada)`,
  `CREATE INDEX IF NOT EXISTS idx_sinc_estado ON sod_sincronizacion(estado, fecha_hora)`,
  `CREATE INDEX IF NOT EXISTS idx_sinc_evento_iter ON sod_sincronizacion(evento_id, iteracion)`,
  `CREATE INDEX IF NOT EXISTS idx_sinc_perfil_estado ON sod_sincronizacion(perfil, estado)`,
  `CREATE INDEX IF NOT EXISTS idx_sinc_carga_uid ON sod_sincronizacion(carga_uid)`,
  `CREATE INDEX IF NOT EXISTS idx_vj_evento ON sod_validacion_jornada(evento_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vj_agenda ON sod_validacion_jornada(id_agenda)`,
  `CREATE INDEX IF NOT EXISTS idx_vb_jornada ON sod_validacion_bloque(jornada_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vb_tipo ON sod_validacion_bloque(jornada_id, tipo_validacion)`,
  `CREATE INDEX IF NOT EXISTS idx_vt_bloque ON sod_validacion_tag(bloque_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vt_numero ON sod_validacion_tag(numero_tag)`,
  `CREATE INDEX IF NOT EXISTS idx_vp_tag ON sod_validacion_producto(tag_id)`,
  `CREATE INDEX IF NOT EXISTS idx_vp_sku ON sod_validacion_producto(sku)`,
  `CREATE INDEX IF NOT EXISTS idx_pvp_jornada ON sod_pre_variance_producto(jornada_id)`,
  `CREATE INDEX IF NOT EXISTS idx_pvp_sku ON sod_pre_variance_producto(sku)`,
  `CREATE INDEX IF NOT EXISTS idx_pvu_producto ON sod_pre_variance_ubicacion(producto_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rp_jornada ON sod_recuento_producto(jornada_id)`,
  `CREATE INDEX IF NOT EXISTS idx_rp_sku ON sod_recuento_producto(sku)`,
  `CREATE INDEX IF NOT EXISTS idx_ru_producto ON sod_recuento_ubicacion(producto_id)`,
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
  'sod_producto_detalle',
  'sod_muestra',
  'sod_muestra_detalle',
  'sod_pda',
  'sod_zona',
  'sod_ubicacion',
  'sod_asignacion',
  'sod_sincronizacion',
  'sod_conteo',
  'sod_conteo_detalle',
  'sod_validacion_jornada',
  'sod_validacion_bloque',
  'sod_validacion_tag',
  'sod_validacion_producto',
] as const;

export type SodimacTableName = typeof SODIMAC_TABLE_NAMES[number];

export const SODIMAC_SCHEMA_SQL = TABLES.map((s) => `${s};`).join('\n') + '\n' + INDEXES.map((i) => `${i};`).join('\n') + '\n' + SEED;
