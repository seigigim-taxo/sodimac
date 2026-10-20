import { ExclusionDeEscrituras } from './exclusion-de-escrituras';

/*
 * Lo mínimo que se necesita de una conexión SQLite. SQLiteDBConnection lo
 * cumple, y también el doble en memoria de los tests.
 */
export interface ConexionTransaccional {
  beginTransaction(): Promise<unknown>;
  commitTransaction(): Promise<unknown>;
  rollbackTransaction(): Promise<unknown>;
}

/* Con esto la conexión envuelta entrega la cruda, que es la que usa una transacción. */
export const CONEXION_CRUDA = Symbol('conexionCruda');

const TAG = '[ConexionSerializada]';

/*
 * Cómo se nombra una escritura en el aviso de espera: el comienzo de su SQL.
 * "run" a secas no dice de quién se trata, y es justo lo que hace falta saber
 * cuando una escritura ajena espera a una transacción larga.
 */
function resumirSql(sql: unknown): string {
  return typeof sql === 'string' ? sql.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

function primeraSentencia(conjunto: unknown): string {
  const primera = Array.isArray(conjunto) ? (conjunto[0] as { statement?: unknown } | undefined) : undefined;
  return typeof primera?.statement === 'string' ? primera.statement : '';
}

/*
 * Devuelve la conexión envuelta: sus escrituras hacen cola en `exclusion`.
 *
 *  - run, execute y executeSet esperan su turno.
 *  - `run` sin tercer argumento pasa a `transaction = false`. Es un statement
 *    suelto: SQLite ya lo ejecuta de forma atómica. El default del plugin
 *    (`true`) abre una transacción propia que, si choca con otra, termina
 *    revirtiendo la ajena. Quien necesite una explícita la pide con `true`.
 *    execute y executeSet conservan su default: un script de varias
 *    sentencias sí depende de que sea atómico.
 *  - todo lo demás (query, open, close…) pasa directo a la conexión cruda.
 */
export function serializarConexion<T extends object>(cruda: T, exclusion: ExclusionDeEscrituras): T {
  return new Proxy(cruda, {
    get(objetivo, propiedad) {
      if (propiedad === CONEXION_CRUDA) return objetivo;

      const valor = Reflect.get(objetivo, propiedad, objetivo);
      if (typeof valor !== 'function') return valor;

      switch (propiedad) {
        case 'run':
          return (sentencia: string, valores?: unknown[], transaccion?: boolean, ...resto: unknown[]) =>
            exclusion.ejecutar(
              () => valor.call(objetivo, sentencia, valores, transaccion ?? false, ...resto),
              `run: ${resumirSql(sentencia)}`
            );
        case 'execute':
        case 'executeSet':
          return (...argumentos: unknown[]) =>
            exclusion.ejecutar(
              () => valor.apply(objetivo, argumentos),
              `${String(propiedad)}: ${resumirSql(propiedad === 'executeSet' ? primeraSentencia(argumentos[0]) : argumentos[0])}`
            );
        default:
          return valor.bind(objetivo);
      }
    },
  });
}

/* La conexión cruda detrás de una envuelta; si no estaba envuelta, la misma. */
export function conexionCruda<T extends object>(conexion: T): T {
  return ((conexion as Record<symbol, unknown>)[CONEXION_CRUDA] as T | undefined) ?? conexion;
}

/*
 * La conexión que recibe el callback de una transacción: la cruda, SIN cola
 * (la transacción ya tiene el turno), pero con `run`, `execute` y `executeSet`
 * en `transaction = false` por default.
 *
 * Con el default del plugin (`true`), un run suelto adentro de la transacción
 * intenta abrir otra, falla con "Already in transaction" y su `finally`
 * revierte la transacción que lo contiene — la misma carrera de siempre, pero
 * causada por quien escribe el callback. Así olvidarse del `false` ya no rompe
 * nada. Un `true` explícito se respeta (y sigue siendo un error).
 */
export function conexionDeTransaccion<T extends object>(cruda: T): T {
  return new Proxy(cruda, {
    get(objetivo, propiedad) {
      if (propiedad === CONEXION_CRUDA) return objetivo;

      const valor = Reflect.get(objetivo, propiedad, objetivo);
      if (typeof valor !== 'function') return valor;

      switch (propiedad) {
        case 'run':
          return (sentencia: string, valores?: unknown[], transaccion?: boolean, ...resto: unknown[]) =>
            valor.call(objetivo, sentencia, valores, transaccion ?? false, ...resto);
        case 'execute':
          return (sentencias: string, transaccion?: boolean, ...resto: unknown[]) =>
            valor.call(objetivo, sentencias, transaccion ?? false, ...resto);
        case 'executeSet':
          return (conjunto: unknown[], transaccion?: boolean, ...resto: unknown[]) =>
            valor.call(objetivo, conjunto, transaccion ?? false, ...resto);
        default:
          return valor.bind(objetivo);
      }
    },
  });
}

/*
 * Ejecuta `fn` dentro de una transacción que ocupa el turno completo de
 * escritura: o se escribe todo o no se escribe nada, y nadie más escribe
 * mientras tanto.
 *
 * `fn` recibe la conexión de la transacción (ver conexionDeTransaccion): sin
 * cola y sin transacciones propias por default. Debe usar SOLO esa conexión:
 * pedir una escritura por la normal desde adentro es esperar el turno que la
 * propia transacción tiene tomado.
 */
export function ejecutarEnTransaccion<C extends ConexionTransaccional, T>(
  conexion: C,
  exclusion: ExclusionDeEscrituras,
  fn: (db: C) => Promise<T>
): Promise<T> {
  const db = conexionCruda(conexion);

  return exclusion.ejecutar(async () => {
    await db.beginTransaction();
    try {
      const resultado = await fn(conexionDeTransaccion(db));
      await db.commitTransaction();
      return resultado;
    } catch (err) {
      try {
        await db.rollbackTransaction();
      } catch (errRollback) {
        console.error(`${TAG} falló el rollback:`, errRollback);
      }
      throw err;
    }
  }, 'transacción');
}
