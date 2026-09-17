import { Injectable } from '@angular/core';

/*
 * Beep de error al escanear un SKU que no está en la muestra.
 *
 * Tono generado con Web Audio, no un archivo de audio: no hay nada que
 * empaquetar ni cargar, y suena igual en el WebView de la PDA que en el
 * navegador. Grave y corto (220 Hz, ~180 ms) para distinguirse de un beep de
 * escáner por hardware, que suele ser agudo.
 */
/*
 * El motor de escaneo de la PDA (hardware) emite su propio beep de "buena
 * lectura" al decodificar el código, antes de que el dato llegue siquiera al
 * WebView — la app no lo genera ni lo puede silenciar. Si el beep de error
 * suena en el mismo instante, se pisan. Este retraso deja que el beep del
 * escáner termine primero; el de error se escucha después, no encima.
 */
const RETRASO_TRAS_LECTURA_MS = 300;

@Injectable({ providedIn: 'root' })
export class BeepService {
  private contexto: AudioContext | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | undefined;

  /*
   * Cancela el timer pendiente antes de agendar uno nuevo: con lectura por
   * pistola en ráfaga, varios SKU fuera de muestra pueden escanearse en menos
   * de RETRASO_TRAS_LECTURA_MS. Sin esto, cada escaneo agendaba su propio
   * tono y se oían superpuestos o en cascada. Así, solo suena una vez por
   * ráfaga — el del último escaneo, que es el que queda en pantalla.
   */
  error(): void {
    clearTimeout(this.timeoutId);
    this.timeoutId = setTimeout(() => this.tono(220, 180), RETRASO_TRAS_LECTURA_MS);
  }

  /*
   * Para cuando el operador sale del TAG (descarta o finaliza) antes de que
   * se cumplan los RETRASO_TRAS_LECTURA_MS: sin esto, un beep agendado por un
   * scan fallido podía sonar hasta 300ms después, ya en otra pantalla/TAG.
   */
  cancelar(): void {
    clearTimeout(this.timeoutId);
  }

  private tono(frecuenciaHz: number, duracionMs: number): void {
    try {
      const ctx = this.obtenerContexto();
      const oscilador = ctx.createOscillator();
      const ganancia = ctx.createGain();

      oscilador.type = 'square';
      oscilador.frequency.value = frecuenciaHz;

      /*
       * Rampa exponencial en vez de cortar seco: evita el "click" audible que
       * deja un gain fijo al apagarse de golpe.
       */
      const ahora = ctx.currentTime;
      ganancia.gain.setValueAtTime(0.2, ahora);
      ganancia.gain.exponentialRampToValueAtTime(0.001, ahora + duracionMs / 1000);

      oscilador.connect(ganancia);
      ganancia.connect(ctx.destination);

      oscilador.start(ahora);
      oscilador.stop(ahora + duracionMs / 1000);
    } catch (err) {
      // Sin audio no se bloquea el conteo: el beep es un refuerzo, no un requisito.
      console.error('[BeepService] no se pudo reproducir el beep:', err);
    }
  }

  private obtenerContexto(): AudioContext {
    /*
     * 'closed' es terminal: un AudioContext cerrado (ej. el sistema lo libera
     * bajo presión de memoria en la PDA) no se puede reabrir con resume(), y
     * crear nodos sobre él tira InvalidStateError. Sin este chequeo, quedaba
     * cacheado cerrado para siempre y todo beep futuro fallaba en silencio.
     */
    if (!this.contexto || this.contexto.state === 'closed') {
      this.contexto = new AudioContext();
    }
    /*
     * El navegador/WebView suspende el AudioContext hasta la primera
     * interacción del operador. Para cuando esto se llama ya hubo una (el
     * scan llegó por la UI), así que resume() no debería hacer falta, pero
     * cuesta nada dejarlo por si el sistema lo suspendió de nuevo.
     *
     * .catch() explícito: sin await, un rechazo de resume() (ej. política de
     * autoplay al llamarse fuera de un gesto de usuario directo, ya que esto
     * corre dentro de un setTimeout) quedaba como unhandled promise rejection
     * en vez de pasar por el manejo de errores que tono() cree tener.
     */
    if (this.contexto.state === 'suspended') {
      this.contexto.resume().catch((err) => {
        console.error('[BeepService] no se pudo reanudar el AudioContext:', err);
      });
    }
    return this.contexto;
  }
}
