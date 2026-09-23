/*
 * Error que identifica fallos de red (sin conexión, timeout, DNS) — pero
 * también, desde que ApiService.leerCuerpo() empezó a atrapar cuerpos que no
 * son JSON válido, casos que NO son de conectividad (un JSON roto por un bug
 * del backend, HTML de un proxy/WAF). Ambos comparten el mismo tratamiento en
 * la mayoría de las pantallas (mensaje al operador, sin reintento automático),
 * pero no en todas: LoginUseCase agrega "no hay sesión guardada para entrar
 * sin conexión" solo cuando el problema ES de conectividad — decirlo también
 * ante un JSON roto sugeriría revisar la red cuando el problema es del
 * servidor.
 *
 * Vive en domain porque los casos de uso deciden con él: es la señal que
 * dispara el fallback al login offline. La capa de infraestructura
 * (ApiService) lo produce; application lo consume.
 */
export class NetworkError extends Error {
  constructor(message: string, readonly esDeConectividad: boolean = true) {
    super(message);
    this.name = 'NetworkError';
  }
}
