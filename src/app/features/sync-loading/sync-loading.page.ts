import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent, IonProgressBar } from '@ionic/angular/standalone';

/*
 * Pantalla de carga simulada tras el login: hoy solo avanza una barra de
 * progreso de forma artificial (sin descarga real). Cuando exista el
 * endpoint de sincronización inicial, este componente se reemplaza por
 * el progreso real de la descarga, manteniendo la misma UI.
 */
const DURACION_MS = 10000;
const INTERVALO_MS = 100;
const INCREMENTO = 100 / (DURACION_MS / INTERVALO_MS);

@Component({
  selector: 'app-sync-loading',
  templateUrl: './sync-loading.page.html',
  standalone: true,
  imports: [IonContent, IonProgressBar, DecimalPipe],
})
export class SyncLoadingPageComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private intervalId: ReturnType<typeof setInterval> | undefined;

  progress = signal(0);

  ngOnInit(): void {
    this.intervalId = setInterval(() => {
      const next = Math.min(100, this.progress() + INCREMENTO);
      this.progress.set(next);
      if (next >= 100) {
        clearInterval(this.intervalId);
        this.router.navigate(['/home']);
      }
    }, INTERVALO_MS);
  }

  ngOnDestroy(): void {
    clearInterval(this.intervalId);
  }
}
