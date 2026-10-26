import { Injectable, inject } from '@angular/core';
import { puedeEditarRangos } from '../../domain/zonificacion/models/estado-zonificacion.model';
import { IdentidadOperador } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { IdRango } from '../../domain/zonificacion/models/rango-zonificacion.model';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { EnvioEnCursoService } from '../sincronizacion/envio-en-curso.service';
import { ContextoAgendaZonificacionService } from './contexto-agenda-zonificacion.service';
import { claveCandado } from './enviar-zonificacion.use-case';
import { AgendaRef, ResultadoAccion, rechazo } from './resultado-accion';

/*
 * Eliminar un rango. Hay tres casos y cada uno es distinto:
 *
 *  - Un rango NUEVO que aún no salió: el servidor nunca supo de él, así que no
 *    hay nada que eliminar allá. Se quita su operación de la cola y listo.
 *  - Un rango del servidor con una EDICIÓN pendiente: se descarta la edición y
 *    se manda la eliminación del rango del servidor.
 *  - Un rango del servidor sin cambios pendientes: se manda la eliminación.
 *
 * La eliminación en el servidor es lógica (el rango queda inactivo con quién y
 * cuándo), igual que en el SGO.
 */
@Injectable({ providedIn: 'root' })
export class EliminarRangoUseCase {
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);
  private contexto = inject(ContextoAgendaZonificacionService);
  private candado = inject(EnvioEnCursoService);

  async execute(agenda: AgendaRef, idRango: IdRango): Promise<ResultadoAccion> {
    const identidad = await this.contexto.identidad();
    if (!identidad) return rechazo('SIN_SESION');

    const { estado, vista } = await this.contexto.cargar(agenda.idAgenda);
    const bloqueo = this.contexto.verificarEscritura(estado);
    if (bloqueo) return bloqueo;
    if (!puedeEditarRangos(vista.estado)) return rechazo('ZONIFICACION_CONFIRMADA', { estado: vista.estado });

    const rango = vista.rangos.find((r) => r.id === idRango);
    if (!rango) return rechazo('RANGO_NO_ENCONTRADO', { id_zonificacion_det: idRango });

    if (rango.pendiente && rango.operacionUid) {
      return this.eliminarPendiente(agenda, rango.operacionUid, rango.idServidor, identidad);
    }
    await this.contexto.encolar(agenda, identidad, 'ELIMINAR_RANGO', { id_zonificacion_det: rango.idServidor });
    return { ok: true };
  }

  private async eliminarPendiente(
    agenda: AgendaRef,
    operacionUid: string,
    idServidor: number | null,
    identidad: IdentidadOperador,
  ): Promise<ResultadoAccion> {
    const clave = claveCandado(agenda.idAgenda);
    if (!this.candado.tomar(clave)) return rechazo('RANGO_EN_ENVIO');
    try {
      const op = (await this.local.listarPendientes(agenda.idAgenda)).find((o) => o.operacionUid === operacionUid);
      // Se envió mientras tanto: ya tiene id del servidor y hay que volver a abrirlo.
      if (!op) return rechazo('RANGO_EN_ENVIO');
      await this.local.eliminar(op.id);
    } finally {
      this.candado.soltar(clave);
    }

    if (idServidor !== null) {
      await this.contexto.encolar(agenda, identidad, 'ELIMINAR_RANGO', { id_zonificacion_det: idServidor });
    }
    return { ok: true };
  }
}
