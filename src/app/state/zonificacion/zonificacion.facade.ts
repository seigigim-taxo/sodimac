import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { AgendasCargadas, CargarAgendasZonificacionUseCase } from '../../application/zonificacion/cargar-agendas-zonificacion.use-case';
import { CargarCatalogoZonificacionUseCase, CatalogoCargado } from '../../application/zonificacion/cargar-catalogo-zonificacion.use-case';
import { CargarEstadoZonificacionUseCase, EstadoCargado } from '../../application/zonificacion/cargar-estado-zonificacion.use-case';
import { ConteoZonificacion, ContarPendientesZonificacionUseCase } from '../../application/zonificacion/contar-pendientes-zonificacion.use-case';
import { DescartarRechazadaZonificacionUseCase } from '../../application/zonificacion/descartar-rechazada-zonificacion.use-case';
import { AgendaRef, ResultadoAccion } from '../../application/zonificacion/resultado-accion';
import { AnularTagUseCase } from '../../application/zonificacion/anular-tag.use-case';
import { ContextoAgendaZonificacionService } from '../../application/zonificacion/contexto-agenda-zonificacion.service';
import { EliminarRangoUseCase } from '../../application/zonificacion/eliminar-rango.use-case';
import { EnviarZonificacionUseCase } from '../../application/zonificacion/enviar-zonificacion.use-case';
import { GuardarRangoEntrada, GuardarRangoUseCase } from '../../application/zonificacion/guardar-rango.use-case';
import { IdRango } from '../../domain/zonificacion/models/rango-zonificacion.model';

/* Lo que se le dice al operador al volver al resumen después de una acción. */
export interface MensajeZonificacion {
  tipo: 'ok' | 'info' | 'error';
  texto: string;
}

/*
 * Lo que las pantallas de zonificación leen y piden. Existe para que no inyecten
 * casos de uso directo: los componentes hablan solo con facades.
 *
 * Los signals son de la app y sobreviven al logout: `reset()` los suelta para que
 * quien entre después no vea las agendas del turno anterior.
 */
@Injectable({ providedIn: 'root' })
export class ZonificacionFacade {
  private cargarAgendasUC = inject(CargarAgendasZonificacionUseCase);
  private cargarCatalogoUC = inject(CargarCatalogoZonificacionUseCase);
  private cargarEstadoUC = inject(CargarEstadoZonificacionUseCase);
  private descartarUC = inject(DescartarRechazadaZonificacionUseCase);
  private contarUC = inject(ContarPendientesZonificacionUseCase);
  private guardarRangoUC = inject(GuardarRangoUseCase);
  private eliminarRangoUC = inject(EliminarRangoUseCase);
  private anularTagUC = inject(AnularTagUseCase);
  private contexto = inject(ContextoAgendaZonificacionService);
  private envio = inject(EnviarZonificacionUseCase);

  private agendasSignal = signal<AgendasCargadas | null>(null);
  private cargandoAgendasSignal = signal(false);
  private catalogoSignal = signal<CatalogoCargado | null>(null);
  private agendaSignal = signal<AgendaRef | null>(null);
  private estadoSignal = signal<EstadoCargado | null>(null);
  private cargandoEstadoSignal = signal(false);
  private conteoSignal = signal<ConteoZonificacion>({ pendientes: 0, rechazadas: 0 });
  private mensajeSignal = signal<MensajeZonificacion | null>(null);

  readonly agendas = this.agendasSignal.asReadonly();
  readonly cargandoAgendas = this.cargandoAgendasSignal.asReadonly();
  readonly catalogo = this.catalogoSignal.asReadonly();
  readonly agenda = this.agendaSignal.asReadonly();
  readonly estado = this.estadoSignal.asReadonly();
  readonly cargandoEstado = this.cargandoEstadoSignal.asReadonly();
  readonly conteo = this.conteoSignal.asReadonly();
  readonly mensaje = this.mensajeSignal.asReadonly();

  constructor() {
    // El envío corre en segundo plano: cuando algo sale o se rechaza, la vista se vuelve a leer (sin red).
    effect(() => {
      if (this.envio.cambios() === 0) return;
      untracked(() => {
        void this.refrescarVistaLocal();
        void this.contar();
      });
    });
  }

  reset(): void {
    this.agendasSignal.set(null);
    this.cargandoAgendasSignal.set(false);
    this.catalogoSignal.set(null);
    this.agendaSignal.set(null);
    this.estadoSignal.set(null);
    this.cargandoEstadoSignal.set(false);
    this.conteoSignal.set({ pendientes: 0, rechazadas: 0 });
    this.mensajeSignal.set(null);
  }

  /* La lista de agendas; el catálogo viaja junto para tenerlo listo al abrir una agenda. */
  async cargarAgendas(): Promise<void> {
    this.cargandoAgendasSignal.set(true);
    try {
      const [agendas, catalogo] = await Promise.all([this.cargarAgendasUC.execute(), this.cargarCatalogoUC.execute()]);
      this.agendasSignal.set(agendas);
      this.catalogoSignal.set(catalogo);
    } finally {
      this.cargandoAgendasSignal.set(false);
    }
  }

  /* Abre una agenda: se vacía lo anterior para no mostrar el resumen de otra mientras carga. */
  async abrirAgenda(agenda: AgendaRef): Promise<void> {
    this.agendaSignal.set(agenda);
    this.estadoSignal.set(null);
    await this.refrescarEstado();
  }

  async refrescarEstado(): Promise<void> {
    const agenda = this.agendaSignal();
    if (!agenda) return;
    this.cargandoEstadoSignal.set(true);
    try {
      const estado = await this.cargarEstadoUC.execute(agenda);
      // Si mientras tanto se abrió otra agenda, esta respuesta ya no corresponde.
      if (this.agendaSignal()?.idAgenda === agenda.idAgenda) this.estadoSignal.set(estado);
    } finally {
      this.cargandoEstadoSignal.set(false);
    }
  }

  async descartarRechazada(idOperacion: number): Promise<void> {
    await this.descartarUC.execute(idOperacion);
    await this.refrescarEstado();
    await this.contar();
  }

  async contar(): Promise<void> {
    this.conteoSignal.set(await this.contarUC.execute());
  }
  /*
   * Relee el estado de la agenda abierta SIN pedirle nada al servidor: lo
   * descargado por última vez más lo que está en la cola. Es lo que se hace
   * después de cada acción del operador, para que su cambio se vea al instante.
   */
  async refrescarVistaLocal(): Promise<void> {
    const agenda = this.agendaSignal();
    if (!agenda) return;
    const { estado, vista } = await this.contexto.cargar(agenda.idAgenda);
    if (this.agendaSignal()?.idAgenda !== agenda.idAgenda) return;
    this.estadoSignal.update((previo) =>
      previo
        ? { ...previo, estado, vista }
        : { estado, vista, origen: estado ? 'COPIA' : 'NINGUNO', fechaDescarga: null, error: null },
    );
  }

  async guardarRango(entrada: GuardarRangoEntrada): Promise<ResultadoAccion> {
    const r = await this.guardarRangoUC.execute(entrada);
    if (r.ok) await this.alTerminar('Rango guardado.');
    return r;
  }

  async eliminarRango(agenda: AgendaRef, idRango: IdRango): Promise<ResultadoAccion> {
    const r = await this.eliminarRangoUC.execute(agenda, idRango);
    if (r.ok) await this.alTerminar('Rango eliminado. Confirma de nuevo la zonificación cuando termines los ajustes.');
    return r;
  }

  async anularTag(agenda: AgendaRef, numeroTag: number, motivo: string): Promise<ResultadoAccion> {
    const r = await this.anularTagUC.execute(agenda, numeroTag, motivo);
    if (r.ok) await this.alTerminar('TAG anulado.');
    return r;
  }

  /* El aviso lo lee y lo limpia el resumen al volver a mostrarse. */
  consumirMensaje(): MensajeZonificacion | null {
    const m = this.mensajeSignal();
    this.mensajeSignal.set(null);
    return m;
  }

  private async alTerminar(texto: string): Promise<void> {
    this.mensajeSignal.set({ tipo: 'ok', texto });
    await this.refrescarVistaLocal();
    await this.contar();
  }
}
