import { Injectable, inject, signal, computed } from '@angular/core';
import { BuscarActualizacionUseCase } from '../../application/actualizacion/buscar-actualizacion.use-case';
import {
  DescargarEInstalarUseCase,
  ResultadoActualizacion,
} from '../../application/actualizacion/descargar-e-instalar.use-case';
import { INSTALADOR_REPOSITORY_TOKEN } from '../../domain/actualizacion/repositories/actualizacion.repository';
import { VersionDisponible } from '../../domain/actualizacion/models/version-disponible.model';

@Injectable({ providedIn: 'root' })
export class ActualizacionFacade {
  private buscarUC = inject(BuscarActualizacionUseCase);
  private instalarUC = inject(DescargarEInstalarUseCase);
  private instalador = inject(INSTALADOR_REPOSITORY_TOKEN);

  private disponibleSignal  = signal<VersionDisponible | null>(null);
  private instaladaSignal   = signal<number>(0);
  private buscandoSignal    = signal(false);
  private descargandoSignal = signal(false);
  private porcentajeSignal  = signal<number | null>(null);
  private errorSignal       = signal<string | null>(null);

  readonly disponible  = this.disponibleSignal.asReadonly();
  readonly instalada   = this.instaladaSignal.asReadonly();
  readonly buscando    = this.buscandoSignal.asReadonly();
  readonly descargando = this.descargandoSignal.asReadonly();
  readonly porcentaje  = this.porcentajeSignal.asReadonly();
  readonly error       = this.errorSignal.asReadonly();

  readonly hayActualizacion = computed(() => {
    const d = this.disponibleSignal();
    return d !== null && d.versionCode > this.instaladaSignal();
  });

  /*
   * Devuelve si encontró algo, para que quien la llame decida si mostrar el
   * aviso. El error se guarda pero no se propaga: esta consulta corre también
   * al iniciar sesión, y un servidor caído no puede impedirle al operador
   * empezar a contar.
   */
  async buscar(): Promise<boolean> {
    if (this.buscandoSignal()) return this.hayActualizacion();

    this.buscandoSignal.set(true);
    this.errorSignal.set(null);
    try {
      const estado = await this.buscarUC.execute();
      this.instaladaSignal.set(estado.versionInstalada);
      this.disponibleSignal.set(estado.disponible);
      return estado.hayActualizacion;
    } catch (err) {
      this.errorSignal.set(err instanceof Error ? err.message : 'No se pudo consultar la versión.');
      return false;
    } finally {
      this.buscandoSignal.set(false);
    }
  }

  async actualizar(): Promise<ResultadoActualizacion> {
    const version = this.disponibleSignal();
    if (!version) return { estado: 'ERROR', mensaje: 'No hay una versión para instalar.' };

    this.descargandoSignal.set(true);
    this.porcentajeSignal.set(null);
    this.errorSignal.set(null);
    try {
      const resultado = await this.instalarUC.execute(version, (p) => this.porcentajeSignal.set(p));
      if (resultado.estado === 'ERROR') this.errorSignal.set(resultado.mensaje);
      return resultado;
    } finally {
      this.descargandoSignal.set(false);
      this.porcentajeSignal.set(null);
    }
  }

  abrirAjustesInstalacion(): Promise<void> {
    return this.instalador.abrirAjustesInstalacion();
  }

  puedeInstalar(): Promise<boolean> {
    return this.instalador.puedeInstalar();
  }
}
