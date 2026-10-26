import { Injectable, inject, signal } from '@angular/core';
import { AgendasCargadas, CargarAgendasZonificacionUseCase } from '../../application/zonificacion/cargar-agendas-zonificacion.use-case';
import { CargarCatalogoZonificacionUseCase, CatalogoCargado } from '../../application/zonificacion/cargar-catalogo-zonificacion.use-case';
import { CargarEstadoZonificacionUseCase, EstadoCargado } from '../../application/zonificacion/cargar-estado-zonificacion.use-case';
import { ConteoZonificacion, ContarPendientesZonificacionUseCase } from '../../application/zonificacion/contar-pendientes-zonificacion.use-case';
import { DescartarRechazadaZonificacionUseCase } from '../../application/zonificacion/descartar-rechazada-zonificacion.use-case';
import { AgendaRef } from '../../application/zonificacion/resultado-accion';

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

  private agendasSignal = signal<AgendasCargadas | null>(null);
  private cargandoAgendasSignal = signal(false);
  private catalogoSignal = signal<CatalogoCargado | null>(null);
  private agendaSignal = signal<AgendaRef | null>(null);
  private estadoSignal = signal<EstadoCargado | null>(null);
  private cargandoEstadoSignal = signal(false);
  private conteoSignal = signal<ConteoZonificacion>({ pendientes: 0, rechazadas: 0 });

  readonly agendas = this.agendasSignal.asReadonly();
  readonly cargandoAgendas = this.cargandoAgendasSignal.asReadonly();
  readonly catalogo = this.catalogoSignal.asReadonly();
  readonly agenda = this.agendaSignal.asReadonly();
  readonly estado = this.estadoSignal.asReadonly();
  readonly cargandoEstado = this.cargandoEstadoSignal.asReadonly();
  readonly conteo = this.conteoSignal.asReadonly();

  reset(): void {
    this.agendasSignal.set(null);
    this.cargandoAgendasSignal.set(false);
    this.catalogoSignal.set(null);
    this.agendaSignal.set(null);
    this.estadoSignal.set(null);
    this.cargandoEstadoSignal.set(false);
    this.conteoSignal.set({ pendientes: 0, rechazadas: 0 });
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
}
