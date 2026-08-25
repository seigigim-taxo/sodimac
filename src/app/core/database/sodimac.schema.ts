export const SODIMAC_DB_NAME = 'sodimac';
export const SODIMAC_DB_VERSION = 46;

/*
 * Las columnas de fecha usan datetime('now','localtime') y no CURRENT_TIMESTAMP,
 * que devuelve UTC: la PDA trabaja en hora de Chile (UTC−4) y ese valor viaja
 * tal cual al SGO en el payload del TAG.
 *
 * Ojo: esto NO migra las bases ya creadas — con CREATE TABLE IF NOT EXISTS, una
 * instalación vieja conserva el DEFAULT en UTC. Por eso los repositorios pasan
 * la fecha explícita en cada INSERT/UPDATE (ver shared/utils/fecha.utils.ts) en
 * vez de confiar en el DEFAULT. Así quedan iguales las instalaciones nuevas y
 * las viejas, y no hace falta subir SODIMAC_DB_VERSION, que borraría la base
 * local de cada PDA al actualizar.
 */

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
    fecha_registro   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
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
    fecha_registro      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
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
    fecha_asignacion TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
  )`,

  `CREATE TABLE IF NOT EXISTS sod_sincronizacion (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id            INTEGER          DEFAULT NULL REFERENCES sod_evento_inventario(id),
    pda_id               INTEGER          DEFAULT NULL REFERENCES sod_pda(id),
    tipo                 TEXT    NOT NULL CHECK (tipo IN ('DESCARGA_A_PDA', 'CARGA_DESDE_PDA')),
    operacion            TEXT             DEFAULT NULL CHECK (operacion IN ('PREPARACION', 'TAG_FINALIZADO')),
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
    fecha_hora           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
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
    fecha_apertura TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    fecha_cierre   TEXT             DEFAULT NULL,
    UNIQUE (evento_id, iteracion)
  )`,

  /*
   * LO CONTADO. El TAG entra por relación (ubicacion_id), no como columna de la
   * ronda: un mismo TAG se cuenta en varias rondas y una ronda toca varios TAGs.
   * operador_id y pda_id van acá porque varios operadores trabajan la misma ronda.
   */
  `CREATE TABLE IF NOT EXISTS sod_conteo_detalle (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    conteo_id            INTEGER NOT NULL REFERENCES sod_conteo(id),
    ubicacion_id         INTEGER NOT NULL REFERENCES sod_ubicacion(id),
    producto_id          INTEGER NOT NULL REFERENCES sod_producto(id),
    operador_id          INTEGER NOT NULL REFERENCES sod_user(id),
    pda_id               INTEGER NOT NULL REFERENCES sod_pda(id),
    cantidad_fisica      REAL    NOT NULL,
    estado               TEXT    NOT NULL DEFAULT 'EN_CURSO'
                           CHECK (estado IN ('EN_CURSO', 'FINALIZADO', 'SINCRONIZADO')),
    fecha_hora           TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    carga_uid            TEXT             DEFAULT NULL,
    codigo_lectura       TEXT             DEFAULT NULL,
    UNIQUE (conteo_id, ubicacion_id, producto_id, operador_id, pda_id)
  )`,

  /*
   * CÓMO SE CAPTURÓ. Un movimiento de unidades y cómo se declaró.
   *
   * SOLO SE AGREGA. Nunca se modifica ni se borra una fila: quitar unidades
   * agrega un movimiento negativo, no deshace el anterior. Es lo que permite
   * que un escaneo siga constando aunque después se haya retractado — mutar el
   * historial para que el saldo quede prolijo es perder justo el dato por el
   * que existe esta tabla.
   *
   * INVARIANTE: SUM(cantidad) por detalle == cantidad_fisica de la línea.
   * Todo movimiento pasa por acá, incluidos los botones +/- y la declaración de
   * cantidad 0 (que entra como el negativo del total previo).
   *
   * codigo_lectura es NULO cuando no hubo lectura: los botones +/- ajustan
   * unidades sin que el operador lea nada. Atribuirle el código que ya tenía la
   * línea diría que ese código se tipeó a mano, y es exactamente la afirmación
   * falsa que este registro existe para evitar.
   *
   * Al armar el payload esto se agrupa por (código, medio). Ahí "¿se escaneó
   * este código?" se responde por PRESENCIA del par, no por el signo de la
   * suma: un código escaneado y después retractado suma cero y sigue siendo un
   * código que se escaneó.
   */
  `CREATE TABLE IF NOT EXISTS sod_conteo_lectura (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    detalle_id     INTEGER NOT NULL REFERENCES sod_conteo_detalle(id),
    codigo_lectura TEXT             DEFAULT NULL,
    medio_captura  TEXT    NOT NULL
                   CHECK (medio_captura IN ('ESCANER', 'MANUAL')),
    cantidad       REAL    NOT NULL,
    fecha_hora     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
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
  `CREATE INDEX IF NOT EXISTS idx_conteo_lectura_detalle ON sod_conteo_lectura(detalle_id)`,
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
  'sod_conteo_lectura',
] as const;

export type SodimacTableName = typeof SODIMAC_TABLE_NAMES[number];

export const SODIMAC_SCHEMA_SQL = TABLES.map((s) => `${s};`).join('\n') + '\n' + INDEXES.map((i) => `${i};`).join('\n') + '\n' + SEED;
