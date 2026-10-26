import { Injectable, inject } from '@angular/core';
import { EstadoAgenda } from '../../domain/zonificacion/models/estado-agenda.model';
import { IdentidadOperador, OperacionEnCola, TipoOperacionZonificacion } from '../../domain/zonificacion/models/operacion-zonificacion.model';
import { VistaZonificacion } from '../../domain/zonificacion/models/vista-zonificacion.model';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { aplicarPendientes } from '../../domain/zonificacion/utils/vista-con-pendientes.utils';
import { generateUuid } from '../../shared/utils/uuid.utils';
import { ahoraSql } from '../../shared/utils/fecha.utils';
import { EnviarZonificacionUseCase } from './enviar-zonificacion.use-case';
import { IdentidadZonificacionService } from './identidad-zonificacion.service';
import { AgendaRef, ResultadoAccion, rechazo } from './resultado-accion';

export interface ContextoAgenda {
  /* Último estado conocido del servidor; null si la agenda nunca se descargó. */
  estado: EstadoAgenda | null;
  /* Ese estado con lo pendiente aplicado encima. */
  vista: VistaZonificacion;
}

/*
 * Lo que todo caso de uso de zonificación necesita al empezar: la vista de la
 * agenda (estado + cola), quién es el operador y si puede escribir; y, al
 * terminar, encolar la operación y empujar el envío.
 */
@Injectable({ providedIn: 'root' })
export class ContextoAgendaZonificacionService {
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);
  private identidadService = inject(IdentidadZonificacionService);
  private enviar = inject(EnviarZonificacionUseCase);

  async cargar(idAgenda: number): Promise<ContextoAgenda> {
    const [copia, pendientes, rechazadas] = await Promise.all([
      this.local.obtenerEstado(idAgenda),
      this.local.listarPendientes(idAgenda),
      this.local.listarRechazadas(idAgenda),
    ]);
    const estado = copia?.valor ?? null;
    return { estado, vista: aplicarPendientes(estado, [...pendientes, ...rechazadas]) };
  }

  identidad(): Promise<IdentidadOperador | null> {
    return this.identidadService.obtener();
  }

  /*
   * ¿Se puede escribir en esta agenda? La respuesta sale del último estado del
   * servidor (agenda.operable / soloLectura): sin red no hay forma de saberlo
   * mejor, y el servidor vuelve a validar al recibir la operación.
   */
  verificarEscritura(estado: EstadoAgenda | null): ResultadoAccion | null {
    if (!estado) return rechazo('SIN_ESTADO');
    if (!estado.agenda.operable) return rechazo('AGENDA_NO_OPERABLE', { codigo_estado: estado.agenda.codigoEstado });
    if (estado.agenda.soloLectura) return rechazo('AGENDA_SOLO_LECTURA');
    return null;
  }

  /* Registra la operación en la cola (nace PENDIENTE, con su operacion_uid para siempre) y empuja el envío. */
  async encolar(
    agenda: AgendaRef,
    identidad: IdentidadOperador,
    tipo: TipoOperacionZonificacion,
    datos: Record<string, unknown>,
    claveRango: string | null = null,
  ): Promise<OperacionEnCola> {
    const op = await this.local.encolar({
      operacionUid: generateUuid(),
      idAgenda: agenda.idAgenda,
      numeroAgenda: agenda.numeroAgenda,
      tipo,
      claveRango,
      datos,
      operadorLogin: identidad.operadorLogin,
      operadorRut: identidad.operadorRut,
      fechaHoraLocal: ahoraSql(),
    });
    this.empujarEnvio(agenda.idAgenda);
    return op;
  }

  /*
   * El envío sale en segundo plano: la pantalla no espera los ~5 s del
   * servidor ni se bloquea sin señal; el operador sigue trabajando y ve la marca
   * "pendiente de envío" hasta que salga.
   */
  empujarEnvio(idAgenda: number): void {
    this.enviar.execute({ idAgenda }).catch((err) => console.error('[Zonificacion] el envío en segundo plano falló:', err));
  }
}
