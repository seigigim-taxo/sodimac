import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonButton, IonContent, IonProgressBar } from '@ionic/angular/standalone';
import { AuthFacade } from '../../state/auth/auth.facade';
import { SincronizarDatosInicialesUseCase } from '../../application/sincronizacion/sincronizar-datos-iniciales.use-case';
import { EtapaSincronizacion } from '../../domain/sincronizacion/models/preparacion.model';
import { ContractError } from '../../domain/shared/errors/contract.error';
import { NetworkError } from '../../domain/shared/errors/network.error';

/*
 * Un contrato roto no es un problema de conexión y no se arregla reintentando:
 * el operador necesita saber que tiene que avisar, no insistir. El detalle
 * técnico va a la consola, no a la pantalla de alguien en piso de tienda.
 */
function mensajeDeError(err: unknown): string {
  if (err instanceof ContractError) {
    console.error('[sync] contrato inesperado:', err.message);
    return 'El servidor respondió con datos que la aplicación no reconoce. Avisa a soporte.';
  }
  if (err instanceof NetworkError) {
    return 'Sin conexión con el servidor. Revisa la red e intenta de nuevo.';
  }
  return err instanceof Error ? err.message : 'No se pudo descargar la información.';
}

/*
 * Descarga inicial tras el login. La barra cubre TODO el proceso: no llega a
 * 100% hasta que las tablas quedaron escritas, no cuando responde el endpoint.
 *
 * Ninguna de las dos etapas reporta progreso real, así que dentro de cada una
 * la barra avanza sola hacia su techo; los saltos entre etapas sí son reales.
 */
const TECHOS: Record<EtapaSincronizacion, number> = {
  DESCARGANDO: 70,
  GUARDANDO: 95,
  LISTO: 100,
};

const ETIQUETAS: Record<EtapaSincronizacion, string> = {
  DESCARGANDO: 'Descargando datos para trabajar…',
  GUARDANDO: 'Preparando la información en el dispositivo…',
  LISTO: 'Todo listo',
};

const INTERVALO_MS = 100;
const INCREMENTO = 1.5;

@Component({
  selector: 'app-sync-loading',
  templateUrl: './sync-loading.page.html',
  standalone: true,
  imports: [IonButton, IonContent, IonProgressBar, DecimalPipe],
})
export class SyncLoadingPageComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private auth = inject(AuthFacade);
  private sincronizar = inject(SincronizarDatosInicialesUseCase);
  private intervalId: ReturnType<typeof setInterval> | undefined;

  progress = signal(0);
  etapa = signal<EtapaSincronizacion>('DESCARGANDO');
  error = signal<string | null>(null);

  etiqueta = () => ETIQUETAS[this.etapa()];

  ngOnInit(): void {
    void this.ejecutar();
  }

  ngOnDestroy(): void {
    this.detenerAvance();
  }

  async reintentar(): Promise<void> {
    this.error.set(null);
    this.progress.set(0);
    await this.ejecutar();
  }

  private async ejecutar(): Promise<void> {
    const session = this.auth.session();
    if (!session) {
      this.router.navigate(['/login']);
      return;
    }

    this.etapa.set('DESCARGANDO');
    this.iniciarAvance();

    try {
      await this.sincronizar.execute(session, (etapa) => this.etapa.set(etapa));
      this.detenerAvance();
      this.progress.set(100);
      this.router.navigate(['/home']);
    } catch (err: unknown) {
      this.detenerAvance();
      this.error.set(mensajeDeError(err));
    }
  }

  private iniciarAvance(): void {
    this.detenerAvance();
    this.intervalId = setInterval(() => {
      const techo = TECHOS[this.etapa()];
      this.progress.set(Math.min(techo, this.progress() + INCREMENTO));
    }, INTERVALO_MS);
  }

  private detenerAvance(): void {
    clearInterval(this.intervalId);
    this.intervalId = undefined;
  }
}
