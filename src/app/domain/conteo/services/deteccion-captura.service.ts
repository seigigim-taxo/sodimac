import { InjectionToken } from '@angular/core';
import { MedioCaptura } from '../models/medio-captura.model';

/*
 * Decide si un código llegó por pistola o a mano.
 *
 * Es un puerto y no una función suelta porque la forma de averiguarlo depende
 * del hardware, no del negocio. Hoy la única señal disponible es el ritmo de
 * las teclas: las Meferi entregan el código como si fueran un teclado
 * (keyboard wedge), así que para la app un disparo y un tipeo son lo mismo,
 * salvo por la velocidad.
 *
 * Si algún día el lector se puede poner en modo intent/broadcast, la respuesta
 * pasa a ser exacta en vez de estimada, y eso se cambia registrando otra
 * implementación en main.ts — sin tocar el escáner ni la pantalla de conteo.
 */
export interface DeteccionCapturaService {
  /*
   * `marcas` son los instantes (ms, monótonos) en que llegó cada carácter del
   * código, en orden.
   */
  clasificar(marcas: readonly number[]): MedioCaptura;
}

export const DETECCION_CAPTURA_TOKEN =
  new InjectionToken<DeteccionCapturaService>('DeteccionCapturaService');
