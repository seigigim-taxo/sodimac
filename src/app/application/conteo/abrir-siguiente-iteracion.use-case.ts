import { Injectable, inject } from '@angular/core';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { CONTEO_REPOSITORY_TOKEN } from '../../domain/conteo/repositories/conteo.repository';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { MUESTRA_DETALLE_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra-detalle.repository';
import { PLAN_MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/plan-muestra.repository';

export interface ResultadoAbrirIteracion {
  /*
   * El evento NUEVO. La ronda no cuelga del evento que se venía trabajando:
   * cada iteración crea su propio registro, y quien llama tiene que pasar a
   * trabajar sobre este id o seguiría contando contra el evento viejo.
   */
  eventoId:          number;
  conteoId:          number;
  iteracion:         number;
  iteracionAnterior: number;
  // false = la ronda se abrió pero no hay muestra que recontar (nada que revisar).
  conMuestra:        boolean;
}

/*
 * Abre la ronda siguiente de un evento que quedó EN_ANALISIS.
 *
 * Cada ronda es un evento nuevo: el análisis del SGO trae fecha y estado, se
 * inserta un registro aparte y la muestra acotada cuelga de él. El evento
 * anterior se queda como estaba —EN_ANALISIS, con sus conteos y su muestra
 * intactos—, que es lo que deja historial de qué se pidió recontar en cada
 * vuelta. Antes se reutilizaba el mismo evento y la muestra nueva pisaba a la
 * anterior, porque sod_muestra admite una sola por evento.
 *
 * La ronda se crea ACÁ, vacía, y no al primer escaneo: es lo que permite
 * distinguir "ronda 2 abierta y sin contar" de "ronda 1 cerrada".
 */
@Injectable({ providedIn: 'root' })
export class AbrirSiguienteIteracionUseCase {
  private eventoRepo         = inject(EVENTO_REPOSITORY_TOKEN);
  private conteoRepo         = inject(CONTEO_REPOSITORY_TOKEN);
  private muestraRepo        = inject(MUESTRA_REPOSITORY_TOKEN);
  private muestraDetalleRepo = inject(MUESTRA_DETALLE_REPOSITORY_TOKEN);
  /*
   * `optional` porque el token puede no estar registrado (ver main.ts). Sin
   * esto, la sola construcción de este caso de uso —que ocurre al inyectar
   * EventoFacade en /home— tiraría NullInjectorError y dejaría la app sin home.
   * El fallo se difiere a execute(), que es donde de verdad hace falta.
   */
  private planMuestraRepo    = inject(PLAN_MUESTRA_REPOSITORY_TOKEN, { optional: true });

  async execute(eventoId: number, iteracionSgo?: number): Promise<ResultadoAbrirIteracion> {
    const evento = await this.eventoRepo.getById(eventoId);
    if (!evento) {
      throw new Error(`No se encontró el evento ${eventoId}`);
    }
    if (evento.estado !== 'EN_ANALISIS') {
      throw new Error('Solo se puede abrir una iteración nueva sobre un evento en análisis.');
    }

    if (!this.planMuestraRepo) {
      throw new Error(
        'El reconteo no está disponible: falta la descarga de la muestra desde el SGO.'
      );
    }

    /*
     * Un evento EN_ANALISIS no tiene ronda abierta —la anterior se cerró—, así
     * que el número previo sale de la última ronda registrada. Si no hay
     * ninguna, la ronda actual es la 1.
     */
    const ultima = await this.conteoRepo.getUltimaRonda(eventoId);
    const actual = ultima?.iteracion ?? 1;

    const analisis = await this.planMuestraRepo.obtenerAnalisis(eventoId, actual);
    if (!analisis) {
      throw new Error('El SGO no pidió otra ronda: el conteo de este evento terminó.');
    }

    /*
     * El número lo manda el análisis, no se deduce. Con un evento por ronda,
     * deducirlo sería imposible: getUltimaRonda sobre el evento recién creado no
     * devolvería nada y toda ronda se numeraría 2.
     */
    const siguiente = iteracionSgo ?? analisis.iteracion;
    // Una iteración nunca retrocede: si el SGO mandara un número menor o igual,
    // se corta acá antes de reabrir una ronda ya cerrada.
    if (siguiente <= actual) {
      throw new Error(`La iteración ${siguiente} no es posterior a la activa (${actual}).`);
    }

    /*
     * Cerrar la anterior ANTES de abrir la nueva. Normalmente ya la cerró
     * FinalizarEventoUseCase; esto cubre los casos en que el evento llegó a
     * EN_ANALISIS por otra vía.
     */
    if (ultima?.estado === 'ABIERTO') {
      await this.conteoRepo.cerrarRonda(ultima.id);
    }

    const nuevoEventoId = await this.eventoRepo.crearEvento({
      sucursalId:      evento.sucursalId,
      fechaProgramada: analisis.fechaProgramada,
      estado:          analisis.estado,
      nombre:          analisis.nombreMuestra ?? evento.nombre,
    });

    const muestraId = await this.muestraRepo.asegurarMuestra({
      codigoMuestra: analisis.codigoMuestra ?? '',
      eventoId:      nuevoEventoId,
      sucursalId:    evento.sucursalId,
      nombre:        analisis.nombreMuestra,
    });
    await this.muestraDetalleRepo.reemplazarDetalles(muestraId, analisis.skusARecontar);

    /*
     * La ronda se crea antes de devolver: si el operador entrara a contar y la
     * ronda no existiera, sus líneas no tendrían de qué colgar.
     */
    const ronda = await this.conteoRepo.abrirRonda(nuevoEventoId, siguiente);

    return {
      eventoId:          nuevoEventoId,
      conteoId:          ronda.id,
      iteracion:         ronda.iteracion,
      iteracionAnterior: actual,
      conMuestra:        analisis.skusARecontar.length > 0,
    };
  }
}
