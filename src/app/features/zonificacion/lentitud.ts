import { Signal, effect, signal, untracked } from '@angular/core';

/* A partir de cuántos milisegundos de espera se le avisa al operador que está tardando. */
export const UMBRAL_LENTO_MS = 8000;

/*
 * Una señal que se enciende cuando algo lleva "demasiado" cargando.
 *
 * Un spinner que gira sin fin le dice al operador que la app está viva pero no que algo anda
 * mal: con mala señal en la tienda esperar 20 s sin una palabra se siente como una pantalla
 * trabada. Pasado el umbral, la pantalla agrega una línea ("está tardando más de lo normal")
 * para que sepa que puede seguir esperando o revisar la señal. Se apaga sola al terminar.
 *
 * Hay que crearla en un contexto de inyección (por ejemplo, como campo del componente).
 */
export function senalLentitud(cargando: () => boolean, ms: number = UMBRAL_LENTO_MS): Signal<boolean> {
  const lento = signal(false);
  effect((alLimpiar) => {
    if (!cargando()) {
      untracked(() => lento.set(false));
      return;
    }
    const temporizador = setTimeout(() => lento.set(true), ms);
    alLimpiar(() => clearTimeout(temporizador));
  });
  return lento.asReadonly();
}
