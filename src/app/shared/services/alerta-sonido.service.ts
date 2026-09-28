import { Injectable } from '@angular/core';

/*
 * Sonido de alerta para los popups de confirmación de cantidad ("0 unidades",
 * "cantidad inusualmente alta"): el operador suele estar mirando la pistola o
 * el producto, no la pantalla, y un popup silencioso pasa inadvertido —
 * termina confirmando sin leerlo.
 *
 * Tono generado con Web Audio, no un archivo de audio: no hay nada que
 * empaquetar ni cargar, y suena igual en el WebView de la PDA que en el
 * navegador. Dos notas ascendentes cortas (a diferencia del beep grave y
 * único de BeepService) para que se distinga de un beep de escaneo fallido.
 *
 * Sin el debounce de BeepService: ahí hacía falta para no agendar un tono por
 * cada escaneo de una ráfaga. Acá el popup es una acción puntual y deliberada
 * del operador — no hay ráfaga que evitar.
 */
@Injectable({ providedIn: 'root' })
export class AlertaSonidoService {
  private contexto: AudioContext | null = null;

  sonar(): void {
    try {
      const ctx = this.obtenerContexto();
      this.tono(ctx, 520, 90, 0);
      this.tono(ctx, 720, 120, 0.1);
    } catch (err) {
      // Sin audio no se bloquea el conteo: el sonido es un refuerzo, no un requisito.
      console.error('[AlertaSonidoService] no se pudo reproducir el sonido:', err);
    }
  }

  private tono(ctx: AudioContext, frecuenciaHz: number, duracionMs: number, retrasoS: number): void {
    const oscilador = ctx.createOscillator();
    const ganancia = ctx.createGain();

    oscilador.type = 'sine';
    oscilador.frequency.value = frecuenciaHz;

    /*
     * Rampa exponencial en vez de cortar seco: evita el "click" audible que
     * deja un gain fijo al apagarse de golpe.
     */
    const inicio = ctx.currentTime + retrasoS;
    ganancia.gain.setValueAtTime(0.2, inicio);
    ganancia.gain.exponentialRampToValueAtTime(0.001, inicio + duracionMs / 1000);

    oscilador.connect(ganancia);
    ganancia.connect(ctx.destination);

    oscilador.start(inicio);
    oscilador.stop(inicio + duracionMs / 1000);
  }

  private obtenerContexto(): AudioContext {
    /*
     * 'closed' es terminal: un AudioContext cerrado (ej. el sistema lo libera
     * bajo presión de memoria en la PDA) no se puede reabrir con resume(), y
     * crear nodos sobre él tira InvalidStateError. Sin este chequeo, quedaba
     * cacheado cerrado para siempre y todo sonido futuro fallaba en silencio.
     */
    if (!this.contexto || this.contexto.state === 'closed') {
      this.contexto = new AudioContext();
    }
    /*
     * El navegador/WebView suspende el AudioContext hasta la primera
     * interacción del operador. El popup se abre a partir de una acción suya
     * (tipear/confirmar), así que resume() no debería hacer falta, pero
     * cuesta nada dejarlo por si el sistema lo suspendió de nuevo.
     *
     * .catch() explícito: sin await, un rechazo de resume() quedaba como
     * unhandled promise rejection en vez de pasar por el manejo de errores
     * que sonar() cree tener.
     */
    if (this.contexto.state === 'suspended') {
      this.contexto.resume().catch((err) => {
        console.error('[AlertaSonidoService] no se pudo reanudar el AudioContext:', err);
      });
    }
    return this.contexto;
  }
}
