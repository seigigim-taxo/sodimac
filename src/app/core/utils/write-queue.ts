/*
 * Serializa operaciones asíncronas: garantiza que nunca dos escrituras
 * corran en paralelo sobre la misma conexión SQLite. Usado por los facades
 * de conteo, donde el operador puede escanear/ajustar más rápido de lo que
 * tarda cada operación en persistir.
 */
export class WriteQueue {
  private queue: Promise<unknown> = Promise.resolve();

  enqueue<T>(op: () => Promise<T>): Promise<T> {
    const next = this.queue.then(op, op);
    this.queue = next;
    return next;
  }
}
