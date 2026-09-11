import { Injectable } from '@angular/core';

/*
 * Beep de error al escanear un SKU que no está en la muestra.
 *
 * Tono generado con Web Audio, no un archivo de audio: no hay nada que
 * empaquetar ni cargar, y suena igual en el WebView de la PDA que en el
 * navegador. Grave y corto (220 Hz, ~180 ms) para distinguirse de un beep de
 * escáner por hardware, que suele ser agudo.
 */
@Injectable({ providedIn: 'root' })
export class BeepService {
  private contexto: AudioContext | null = null;

  error(): void {
    this.tono(220, 180);
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
    if (!this.contexto) {
      this.contexto = new AudioContext();
    }
    /*
     * El navegador/WebView suspende el AudioContext hasta la primera
     * interacción del operador. Para cuando esto se llama ya hubo una (el
     * scan llegó por la UI), así que resume() no debería hacer falta, pero
     * cuesta nada dejarlo por si el sistema lo suspendió de nuevo.
     */
    if (this.contexto.state === 'suspended') {
      void this.contexto.resume();
    }
    return this.contexto;
  }
}
