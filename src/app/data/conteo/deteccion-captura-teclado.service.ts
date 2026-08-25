import { Injectable, isDevMode } from '@angular/core';
import { DeteccionCapturaService } from '../../domain/conteo/services/deteccion-captura.service';
import { MedioCaptura } from '../../domain/conteo/models/medio-captura.model';

/*
 * Separa pistola de teclado por el ritmo de llegada de los caracteres.
 *
 * Las dos poblaciones están MUY separadas: un lector wedge entrega el código
 * completo en una ráfaga, con huecos de pocos milisegundos entre carácter y
 * carácter; una persona deja 150-250 ms. El umbral no es un ajuste fino, cae en
 * medio de una tierra de nadie enorme.
 *
 * Aun así es una estimación, no una certeza, y por eso está sesgada: solo
 * devuelve 'ESCANER' con evidencia fuerte y ante cualquier duda dice 'MANUAL'.
 * Prefiere marcar como tipeado algo escaneado antes que afirmar un escaneo que
 * no pasó — el reporte del cliente se apoya en esa afirmación.
 *
 * El sesgo tiene un efecto útil: si el operador escanea y después CORRIGE un
 * dígito, la pausa de la corrección rompe la ráfaga y la lectura cae a
 * 'MANUAL', que es exactamente lo que corresponde.
 */

/*
 * Hueco máximo tolerado entre caracteres para seguir considerándolo una ráfaga.
 * Calibrar contra los tiempos reales de la Meferi antes de darlo por bueno: en
 * modo dev se loguea el hueco medido de cada lectura.
 */
const HUECO_MAXIMO_MS = 40;

/*
 * Códigos muy cortos no se clasifican: tres caracteres los tipea cualquiera más
 * rápido que el umbral, y un falso 'ESCANER' es el error que no queremos.
 */
const LARGO_MINIMO = 4;

@Injectable({ providedIn: 'root' })
export class DeteccionCapturaTecladoService implements DeteccionCapturaService {
  clasificar(marcas: readonly number[]): MedioCaptura {
    if (marcas.length < LARGO_MINIMO) {
      this.log(marcas.length, null, 'MANUAL');
      return 'MANUAL';
    }

    let huecoMaximo = 0;
    for (let i = 1; i < marcas.length; i++) {
      huecoMaximo = Math.max(huecoMaximo, marcas[i] - marcas[i - 1]);
    }

    const medio: MedioCaptura = huecoMaximo <= HUECO_MAXIMO_MS ? 'ESCANER' : 'MANUAL';
    this.log(marcas.length, huecoMaximo, medio);
    return medio;
  }

  private log(largo: number, huecoMaximo: number | null, medio: MedioCaptura): void {
    if (!isDevMode()) return;
    console.log('[DeteccionCaptura]', {
      largo,
      huecoMaximoMs: huecoMaximo === null ? null : Math.round(huecoMaximo),
      umbralMs: HUECO_MAXIMO_MS,
      medio,
    });
  }
}
