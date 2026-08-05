/*
 * Error que identifica fallos de red (sin conexión, timeout, DNS).
 * Vive en domain porque los casos de uso deciden con él: es la señal que
 * dispara el fallback al login offline. La capa de infraestructura
 * (ApiService) lo produce; application lo consume.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}
