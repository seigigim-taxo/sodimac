import { Injectable, signal } from '@angular/core';

/*
 * Cuántas veces hace falta que la red parezca floja antes de decir "LENTA"
 * a la ventana. Muy chica y un solo pico puntual (un endpoint pesado, una
 * pausa del sistema) dispara el aviso sin que la conexión tenga nada malo.
 */
const VENTANA = 6;

/*
 * Bien por debajo del TIMEOUT_MS de ApiService (30s): la idea es avisar
 * ANTES de que las llamadas empiecen a fallar por timeout, no después.
 */
const UMBRAL_LENTO_MS = 6_000;

/* Dos fallos seguidos ya alcanzan para sospechar, sin esperar a que se
 * acumulen fallos junto con éxitos rápidos en la misma ventana. */
const FALLOS_CONSECUTIVOS_LENTO = 2;

interface Muestra {
  ok: boolean;
  ms?: number;
}

/*
 * Calidad de la conexión, medida con el tráfico real de la app —no con lo
 * que el sistema operativo cree que tiene (ver navigator.connection, poco
 * confiable en los WebView de las PDAs)—. ApiService reporta acá cada
 * llamada real; este servicio solo lleva la cuenta y decide si la ventana
 * reciente se ve lenta.
 *
 * No es "modo pegajoso": una muestra rápida que entra a la ventana puede
 * sacarla de LENTA de inmediato. No queremos un aviso que siga en pantalla
 * mucho después de que la señal mejoró.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionQualityService {
  private ventana: Muestra[] = [];
  private readonly calidadSignal = signal<'BUENA' | 'LENTA'>('BUENA');

  readonly calidad = this.calidadSignal.asReadonly();

  registrarExito(ms: number): void {
    this.agregar({ ok: true, ms });
  }

  registrarFallo(): void {
    this.agregar({ ok: false });
  }

  private agregar(muestra: Muestra): void {
    this.ventana.push(muestra);
    if (this.ventana.length > VENTANA) this.ventana.shift();
    this.calidadSignal.set(this.calcular());
  }

  private calcular(): 'BUENA' | 'LENTA' {
    const ultimas = this.ventana.slice(-FALLOS_CONSECUTIVOS_LENTO);
    if (ultimas.length === FALLOS_CONSECUTIVOS_LENTO && ultimas.every((m) => !m.ok)) {
      return 'LENTA';
    }

    const exitosas = this.ventana.filter((m) => m.ok && m.ms !== undefined);
    if (exitosas.length === 0) return 'BUENA';

    const promedio = exitosas.reduce((acc, m) => acc + (m.ms ?? 0), 0) / exitosas.length;
    return promedio > UMBRAL_LENTO_MS ? 'LENTA' : 'BUENA';
  }
}
