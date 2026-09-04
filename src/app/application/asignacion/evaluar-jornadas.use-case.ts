import { Injectable, inject } from '@angular/core';
import { AsignacionConteo } from '../../domain/asignacion/models/asignacion-conteo.model';
import { JornadaPreparada } from '../../domain/sincronizacion/models/preparacion.model';
import { MUESTRA_REPOSITORY_TOKEN } from '../../domain/muestra/repositories/muestra.repository';
import { SUCURSAL_REPOSITORY_TOKEN } from '../../domain/sucursal/repositories/sucursal.repository';
import { EVENTO_REPOSITORY_TOKEN } from '../../domain/evento/repositories/evento.repository';
import { SincronizarDatosInicialesUseCase } from '../sincronizacion/sincronizar-datos-iniciales.use-case';
import { ReabrirEventoUseCase } from '../conteo/reabrir-evento.use-case';
import { Session } from '../../domain/auth/models/session.model';

/** Un resultado por jornada, con la fecha para poder ubicarlo. */
export interface ResultadoJornada {
  fecha: string;
  resultado:
    | { tipo: 'SIN_NOVEDAD' }
    | { tipo: 'REABIERTO'; asignacion: AsignacionConteo }
    | { tipo: 'NUEVO'; asignacion: AsignacionConteo };
}

/*
 * "¿Qué hay de nuevo en CADA jornada de la ventana?" — a diferencia de
 * BuscarNuevoConteoUseCase, que se detiene en la primera jornada nueva porque
 * a su llamador (el botón "Actualizar" de Home, después de terminar un
 * conteo) solo le interesa "¿cuál es el siguiente trabajo?", acá hace falta
 * saber el resultado de CADA día por separado — "Actualizar maestra" del menú
 * puede dispararse sin ningún evento elegido, y ahí se pidió que las dos
 * jornadas se informen de forma independiente.
 *
 * Existe aparte y no reutiliza a BuscarNuevoConteoUseCase/
 * BuscarOReabrirConteoUseCase a propósito: esos dos ya están probados y en
 * uso por el flujo de Home, con su semántica de "para en la primera"
 * funcionando bien ahí. Bifurcar esa lógica para que además sirva acá
 * arriesgaba romper un camino ya validado por una necesidad que es de otro
 * llamador. Se duplica la comparación (que es chica) en vez de eso.
 *
 * Persiste la respuesta COMPLETA si CUALQUIER jornada resultó nueva —igual
 * que los otros dos casos de uso—: así, si hoy no tenía nada pero mañana sí,
 * mañana queda descargada aunque el resultado de hoy sea SIN_NOVEDAD.
 */
@Injectable({ providedIn: 'root' })
export class EvaluarJornadasUseCase {
  private sincronizar = inject(SincronizarDatosInicialesUseCase);
  private muestraRepo = inject(MUESTRA_REPOSITORY_TOKEN);
  private sucursalRepo = inject(SUCURSAL_REPOSITORY_TOKEN);
  private eventoRepo = inject(EVENTO_REPOSITORY_TOKEN);
  private reabrirUC = inject(ReabrirEventoUseCase);

  async execute(session: Session): Promise<ResultadoJornada[]> {
    const datos = await this.sincronizar.descargar(session);

    /*
     * Primera pasada: para cada jornada, si el código de muestra ya está en la
     * base (evento local existente) o es nuevo. Sin escribir nada todavía —
     * hay que saber si ALGUNA es nueva antes de decidir si vale la pena
     * persistir, y esa decisión es sobre la respuesta completa, no por
     * jornada.
     */
    const evaluaciones: {
      jornada: JornadaPreparada;
      /* false = sin muestra o sin tienda: no hay nada que comparar. */
      evaluable: boolean;
      eventoLocalId: number | null;
    }[] = [];

    for (const jornada of datos.jornadas) {
      const codigoMuestra = jornada.muestra?.codigoMuestra?.trim();
      const codigoTienda  = jornada.tienda.codigoTienda?.trim();

      // Jornada incompleta (sin muestra o sin tienda): no hay nada que evaluar.
      if (!codigoMuestra || !codigoTienda) {
        evaluaciones.push({ jornada, evaluable: false, eventoLocalId: null });
        continue;
      }

      const sucursalId = await this.sucursalRepo.getIdPorCodigo(codigoTienda);
      // Tienda que la PDA nunca vio: la muestra tampoco puede existir localmente.
      const eventoLocalId = sucursalId !== null
        ? await this.muestraRepo.getEventoIdPorCodigo(codigoMuestra, sucursalId)
        : null;

      evaluaciones.push({ jornada, evaluable: true, eventoLocalId });
    }

    const hayNuevas = evaluaciones.some((e) => e.evaluable && e.eventoLocalId === null);
    if (hayNuevas) await this.sincronizar.persistir(session, datos);

    /*
     * Segunda pasada: arma el resultado por jornada. Va después de persistir
     * porque NUEVO necesita releer el evento recién creado (ver describir()).
     */
    const resultados: ResultadoJornada[] = [];
    for (const { jornada, evaluable, eventoLocalId } of evaluaciones) {
      const fecha = jornada.evento.fechaProgramada;

      if (!evaluable) {
        resultados.push({ fecha, resultado: { tipo: 'SIN_NOVEDAD' } });
        continue;
      }

      if (eventoLocalId === null) {
        resultados.push({ fecha, resultado: { tipo: 'NUEVO', asignacion: await this.describir(jornada) } });
        continue;
      }

      /*
       * Ya la teníamos. Reabrir solo tiene sentido si ese evento es el que
       * este mismo flujo cerró hace un momento y sigue EN_ANALISIS —si sigue
       * ABIERTO/RECONTEO no hay nada que deshacer, y si ya está CERRADO es
       * porque el SGO se pronunció, eso no se pisa.
       */
      const eventoLocal = await this.eventoRepo.getById(eventoLocalId);
      if (!eventoLocal || eventoLocal.estado !== 'EN_ANALISIS') {
        resultados.push({ fecha, resultado: { tipo: 'SIN_NOVEDAD' } });
        continue;
      }

      const reabierto = await this.reabrirUC.execute(eventoLocalId);
      resultados.push({
        fecha,
        resultado: {
          tipo: 'REABIERTO',
          asignacion: {
            eventoId:        reabierto.id,
            sucursalId:      reabierto.sucursalId,
            nombre:          reabierto.nombre,
            fechaProgramada: reabierto.fechaProgramada,
          },
        },
      });
    }

    return resultados;
  }

  /*
   * La asignación que se informa, releída DESPUÉS de persistir: si la tienda
   * era desconocida, recién ahora existe y recién ahora tiene id local.
   */
  private async describir(jornada: JornadaPreparada): Promise<AsignacionConteo> {
    const codigoMuestra = jornada.muestra?.codigoMuestra?.trim() ?? '';

    const sucursalFinal = await this.sucursalRepo.getIdPorCodigo(jornada.tienda.codigoTienda);
    const eventoId = sucursalFinal !== null
      ? await this.muestraRepo.getEventoIdPorCodigo(codigoMuestra, sucursalFinal)
      : null;

    const nombre = jornada.muestra?.nombreMuestra?.trim();

    return {
      eventoId:        eventoId ?? 0,
      sucursalId:      sucursalFinal ?? 0,
      nombre:          nombre && nombre !== '' ? nombre : `Conteo ${eventoId ?? ''}`.trim(),
      fechaProgramada: jornada.evento.fechaProgramada.slice(0, 10),
    };
  }
}
