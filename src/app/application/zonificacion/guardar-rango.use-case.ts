import { Injectable, inject } from '@angular/core';
import { IdRango } from '../../domain/zonificacion/models/rango-zonificacion.model';
import { ZONIFICACION_LOCAL_REPOSITORY_TOKEN } from '../../domain/zonificacion/repositories/zonificacion-local.repository';
import { validarGuardarRango } from '../../domain/zonificacion/utils/reglas-zonificacion.utils';
import { rangosParaReglas } from '../../domain/zonificacion/utils/vista-con-pendientes.utils';
import { EnvioEnCursoService } from '../sincronizacion/envio-en-curso.service';
import { ContextoAgendaZonificacionService } from './contexto-agenda-zonificacion.service';
import { claveCandado } from './enviar-zonificacion.use-case';
import { AgendaRef, ResultadoAccion, rechazo } from './resultado-accion';

export interface GuardarRangoEntrada {
  agenda: AgendaRef;
  /* null = rango nuevo; el id de un rango existente (del servidor o local) = editarlo. */
  idRango: IdRango | null;
  codigoZona: string;
  tagDesde: number;
  tagHasta: number;
  referenciaUbicacion: string | null;
}

/*
 * Guardar un rango nuevo o editar uno. Se valida con las mismas reglas del WS,
 * contra el estado del servidor MÁS lo que está pendiente (un rango nuevo no
 * puede cruzarse con otro que aún no salió). Si pasa, queda en la cola y sale
 * solo.
 *
 * Editar un rango que todavía no salió NO crea una operación nueva: cambia la
 * que está en la cola, conservando su operacion_uid. El servidor entrega el id
 * del rango recién al aplicarlo, así que antes de eso no hay a qué referirse.
 */
@Injectable({ providedIn: 'root' })
export class GuardarRangoUseCase {
  private local = inject(ZONIFICACION_LOCAL_REPOSITORY_TOKEN);
  private contexto = inject(ContextoAgendaZonificacionService);
  private candado = inject(EnvioEnCursoService);

  async execute(entrada: GuardarRangoEntrada): Promise<ResultadoAccion> {
    const identidad = await this.contexto.identidad();
    if (!identidad) return rechazo('SIN_SESION');

    const catalogo = (await this.local.obtenerCatalogo())?.valor;
    if (!catalogo) return rechazo('SIN_CATALOGO');

    const { estado, vista } = await this.contexto.cargar(entrada.agenda.idAgenda);
    const bloqueo = this.contexto.verificarEscritura(estado);
    if (bloqueo) return bloqueo;

    const existente = entrada.idRango === null ? null : (vista.rangos.find((r) => r.id === entrada.idRango) ?? null);
    if (entrada.idRango !== null && !existente) {
      return rechazo('RANGO_NO_ENCONTRADO', { id_zonificacion_det: entrada.idRango });
    }

    const validado = validarGuardarRango(
      {
        idRango: entrada.idRango,
        codigoZona: entrada.codigoZona,
        tagDesde: entrada.tagDesde,
        tagHasta: entrada.tagHasta,
        referenciaUbicacion: entrada.referenciaUbicacion,
      },
      { estado: vista.estado, catalogo, rangosActivos: rangosParaReglas(vista), tagsAnulados: vista.tagsAnulados.map((t) => t.numeroTag) },
    );
    if (!validado.ok) return rechazo(validado.codigo, validado.data);

    const idServidor = existente?.idServidor ?? null;
    const datos = {
      id_zonificacion_det: idServidor,
      codigo_zona: entrada.codigoZona,
      tag_desde: entrada.tagDesde,
      tag_hasta: entrada.tagHasta,
      referencia_ubicacion: validado.referenciaUbicacion,
    };
    const exito: ResultadoAccion = { ok: true, cantidad: validado.cantidad, advertencia: validado.advertencia };

    // Un rango que todavía espera salir: se cambia su operación en la cola.
    if (existente?.pendiente && existente.operacionUid) {
      const clave = claveCandado(entrada.agenda.idAgenda);
      if (!this.candado.tomar(clave)) return rechazo('RANGO_EN_ENVIO');
      try {
        const cola = await this.local.listarPendientes(entrada.agenda.idAgenda);
        const op = cola.find((o) => o.operacionUid === existente.operacionUid);
        // Se envió mientras tanto: ya tiene id del servidor y hay que volver a abrirlo.
        if (!op) return rechazo('RANGO_EN_ENVIO');
        await this.local.actualizarDatos(op.id, datos);
      } finally {
        this.candado.soltar(clave);
      }
      this.contexto.empujarEnvio(entrada.agenda.idAgenda);
      return exito;
    }

    // Rango nuevo, o edición de uno que ya está en el servidor: operación nueva.
    // Un rango nuevo se reconoce en la vista por el operacion_uid de su operación.
    await this.contexto.encolar(entrada.agenda, identidad, 'GUARDAR_RANGO', datos);
    return exito;
  }
}
