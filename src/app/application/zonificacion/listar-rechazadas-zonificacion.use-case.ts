import { Injectable, inject } from '@angular/core';
import { EstadoAgenda } from '../../domain/zonificacion/models/estado-agenda.model';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { textoRango } from '../../domain/zonificacion/utils/filas-resumen.utils';
import { mensajeZonificacion } from '../../domain/zonificacion/utils/mensajes-zonificacion.utils';
import { etiquetaCortaRechazo, tituloOperacion } from '../../domain/zonificacion/utils/rechazos-zonificacion.utils';

/* Un envío que el servidor rechazó, listo para mostrarlo en "Envíos rechazados". */
export interface RechazoZonificacion {
  id: number;
  idAgenda: number;
  numeroAgenda: string;
  /* Qué se había intentado: "Guardar rango 1138–1145". */
  titulo: string;
  /* El motivo en una palabra: "Cruce", "Confirmada". */
  etiqueta: string;
  /* El motivo en una frase. */
  motivo: string;
  /* `YYYY-MM-DD HH:MM:SS`, cuándo lo hizo el operador. */
  fechaHoraLocal: string;
}

/*
 * Los envíos rechazados de TODAS las agendas, del más antiguo al más nuevo. Cada
 * uno espera a que el operador lo vea y lo descarte; mientras tanto no se
 * reintenta ni afecta lo que se ve de la agenda.
 */
@Injectable({ providedIn: 'root' })
export class ListarRechazadasZonificacionUseCase {
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);

  async execute(): Promise<RechazoZonificacion[]> {
    const rechazadas = await this.local.listarRechazadas();
    const estados = new Map<number, EstadoAgenda | null>();

    const resultado: RechazoZonificacion[] = [];
    for (const op of rechazadas) {
      if (!estados.has(op.idAgenda)) {
        estados.set(op.idAgenda, (await this.local.obtenerEstado(op.idAgenda))?.valor ?? null);
      }
      // Eliminar solo guarda el id del rango: si todavía está en lo último descargado, se dice cuál era.
      const eliminado =
        op.tipo === 'ELIMINAR_RANGO' ? estados.get(op.idAgenda)?.rangos.find((r) => r.id === op.datos['id_zonificacion_det']) : undefined;

      resultado.push({
        id: op.id,
        idAgenda: op.idAgenda,
        numeroAgenda: op.numeroAgenda,
        titulo: tituloOperacion(op, eliminado ? textoRango(eliminado.tagDesde, eliminado.tagHasta) : null),
        etiqueta: etiquetaCortaRechazo(op.error?.codigo),
        motivo: op.error ? mensajeZonificacion(op.error.codigo, op.error.data) : (op.mensajeError ?? 'El servidor la rechazó.'),
        fechaHoraLocal: op.fechaHoraLocal,
      });
    }
    return resultado;
  }
}
