/*
 * Un escritor a la vez sobre la base.
 *
 * POR QUÉ EXISTE
 *
 * @capacitor-community/sqlite comparte UNA conexión y trae dos reglas que juntas
 * producen una carrera:
 *
 *  1. run / execute / executeSet abren su propia transacción por default
 *     (`transaction = true`).
 *  2. Ese `run` termina con `finally { if (_db.inTransaction()) rollback }`
 *     (Database.java). Si su begin falla porque YA había una transacción
 *     abierta —la de otra operación—, el `finally` ve esa transacción ajena
 *     y la REVIERTE.
 *
 * Resultado en terreno: mientras la descarga inicial guardaba la muestra dentro
 * de su transacción, una escritura cualquiera (la cola de reportes, marcar un
 * envío) la deshacía. La descarga seguía escribiendo en autocommit sobre lo que
 * quedaba, y fallaba como `FOREIGN KEY constraint failed`, `no current
 * transaction` o `No se pudo resolver producto para SKU …`. Reproducido contra
 * el plugin real en una PDA.
 *
 * LO QUE HACE
 *
 * Ninguna escritura corre mientras otra está en curso, y una transacción ocupa
 * el turno entero. Quien llega en medio espera y se ejecuta después del commit
 * o del rollback: nunca dentro ni encima de la transacción de otro.
 *
 * Las lecturas (`query`) no pasan por acá: la base está en WAL y leen sin
 * bloquear.
 *
 * LA REGLA QUE HAY QUE RESPETAR
 *
 * Dentro del callback de una transacción se usa SOLO la conexión que el
 * callback recibe. Esperar una escritura por la conexión normal desde adentro
 * es esperar un turno que la propia transacción tiene tomado: se cuelga. Por
 * eso hay un aviso si alguien espera demasiado.
 */

const TAG = '[ExclusionDeEscrituras]';

/* Tiempo de espera a partir del cual se avisa que probablemente hay un bloqueo. */
export const ESPERA_AVISO_MS = 15_000;

export class ExclusionDeEscrituras {
  private cola: Promise<void> = Promise.resolve();
  /* Lo que tiene el turno ahora, para que el aviso diga de qué se trata. */
  private enCurso: { descripcion: string; desde: number } | null = null;

  constructor(private readonly esperaAvisoMs: number = ESPERA_AVISO_MS) {}

  /*
   * Ejecuta `operacion` cuando termine todo lo que se pidió antes. Que una
   * operación anterior haya fallado no frena a las siguientes.
   */
  ejecutar<T>(operacion: () => Promise<T>, descripcion = 'escritura'): Promise<T> {
    const aviso = setTimeout(() => {
      const actual = this.enCurso;
      const detalle = actual
        ? `En curso: "${actual.descripcion}", desde hace ${Date.now() - actual.desde} ms. `
        : '';
      console.warn(
        `${TAG} "${descripcion}" lleva más de ${this.esperaAvisoMs} ms esperando su turno. ${detalle}` +
        `Es normal si lo que está en curso es una transacción larga, como el guardado de una muestra grande. ` +
        `Es un bloqueo si lo en curso espera a esta escritura: alguien la pidió por la conexión normal desde dentro de una transacción.`
      );
    }, this.esperaAvisoMs);

    const resultado = this.cola.then(async () => {
      clearTimeout(aviso);
      this.enCurso = { descripcion, desde: Date.now() };
      try {
        return await operacion();
      } finally {
        this.enCurso = null;
      }
    });

    this.cola = resultado.then(() => undefined, () => undefined);
    return resultado;
  }
}
