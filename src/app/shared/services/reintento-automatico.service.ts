import { Injectable, Injector, effect, inject, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import { ToastController } from '@ionic/angular/standalone';
import { AuthFacade } from '../../state/auth/auth.facade';
import { EnviarPendientesFacade } from '../../state/sincronizacion/enviar-pendientes.facade';
import { NetworkService } from './network.service';
import { esperaTrasFallo, puedeIntentarYa } from '../../application/sincronizacion/politica-reintento';

/*
 * Reintenta solo los envíos que no salieron, cuidando la batería de la PDA.
 *
 * Antes lo pendiente solo salía si el operador tocaba "Enviar pendientes" o
 * volvía a finalizar el TAG: un envío fallido quedaba esperando a que alguien se
 * acordara. Acá se reintenta cuando hay una razón para pensar que ahora puede
 * funcionar:
 *
 *   - Volvió la red.              - Volvió a la app (la desbloqueó).
 *   - Entró al Inicio.            - Un envío falló: un único temporizador, cada vez
 *                                   más espaciado (ver politica-reintento).
 *
 * LO QUE NO HACE, A PROPÓSITO
 *   - No sondea: no hay un reloj que despierte la radio "por si acaso".
 *   - No reintenta sin red, sin sesión, ni con la app en segundo plano.
 *   - No insiste con todos si falla la red: corta la tanda al primer fallo.
 *   - No manda nada con la app cerrada. Eso pediría un servicio nativo de Android,
 *     con más batería y más riesgo, y no se justifica todavía.
 */
@Injectable({ providedIn: 'root' })
export class ReintentoAutomaticoService {
  private facade   = inject(EnviarPendientesFacade);
  private auth     = inject(AuthFacade);
  private network  = inject(NetworkService);
  private toast    = inject(ToastController);
  private injector = inject(Injector);

  private iniciado = false;
  private enPrimerPlano = true;
  private corriendo = false;
  private ultimoIntentoMs: number | null = null;
  private fallosSeguidos = 0;
  private temporizador: ReturnType<typeof setTimeout> | undefined;

  iniciar(): void {
    if (this.iniciado) return;
    this.iniciado = true;

    // Solo el paso de "sin red" a "con red": estar conectado no es un evento.
    let estabaConectado = this.network.isOnline();
    effect(() => {
      const conectado = this.network.isOnline();
      if (conectado && !estabaConectado) {
        // Una red nueva es un motivo nuevo: se vuelve a empezar la escala de esperas.
        untracked(() => {
          this.fallosSeguidos = 0;
          this.disparar();
        });
      }
      estabaConectado = conectado;
    }, { injector: this.injector });

    this.escucharEstadoDeLaApp((isActive) => {
      this.enPrimerPlano = isActive;
      if (isActive) this.disparar();
      else this.cancelarTemporizador(); // en segundo plano no se gasta ni un temporizador
    });
  }

  /* Aparte para poder reemplazarlo en las pruebas: el plugin no existe en el navegador. */
  protected escucharEstadoDeLaApp(alCambiar: (isActive: boolean) => void): void {
    void App.addListener('appStateChange', ({ isActive }) => alCambiar(isActive));
  }

  /*
   * Un envío falló FUERA de una tanda automática: al finalizar un TAG, o con el
   * botón "Sincronizar". Arma el temporizador de reintento, que de otra forma solo
   * lo armaba una tanda automática — y el operador, que sigue contando en "Nuevo
   * TAG", no pasa por el Inicio ni cambia de red, así que el TAG esperaba a que algo
   * más lo despertara.
   *
   * Un fallo nuevo es un motivo nuevo: la escala de esperas vuelve a empezar. Si ya
   * hay un temporizador o una tanda en marcha, no se pisa.
   */
  programarTrasFallo(): void {
    if (!this.iniciado || this.corriendo || this.temporizador !== undefined) return;

    this.fallosSeguidos = 1;
    this.programarSiguiente();
  }

  /* Pide un reintento (volvió la app, entró al Inicio...). Respeta todas las reglas de ahorro. */
  disparar(): void {
    if (!this.puedeCorrer()) return;
    if (!puedeIntentarYa(this.ultimoIntentoMs, Date.now())) return;
    void this.correr();
  }

  private puedeCorrer(): boolean {
    return this.enPrimerPlano && this.auth.isAuthenticated() && this.network.isOnline();
  }

  private async correr(): Promise<void> {
    if (this.corriendo) return;
    this.corriendo = true;
    this.cancelarTemporizador();
    this.ultimoIntentoMs = Date.now();

    try {
      const resultado = await this.facade.enviarAutomatico();
      if (resultado === null) return; // el operador ya estaba enviando desde el menú

      if (resultado.confirmadosTags.length > 0) {
        this.fallosSeguidos = 0; // hubo avance
        void this.avisar(resultado.confirmadosTags);
      }

      if (resultado.reintentables > 0) {
        this.fallosSeguidos++;
        this.programarSiguiente();
      } else {
        this.fallosSeguidos = 0;
      }
    } catch (err) {
      console.error('[ReintentoAutomatico] la tanda falló:', err);
      this.fallosSeguidos++;
      this.programarSiguiente();
    } finally {
      this.corriendo = false;
    }
  }

  private programarSiguiente(): void {
    const espera = esperaTrasFallo(this.fallosSeguidos);
    if (espera === null || !this.enPrimerPlano) return;

    this.temporizador = setTimeout(() => {
      this.temporizador = undefined;
      this.disparar();
    }, espera);
  }

  private cancelarTemporizador(): void {
    if (this.temporizador === undefined) return;
    clearTimeout(this.temporizador);
    this.temporizador = undefined;
  }

  private async avisar(tags: string[]): Promise<void> {
    try {
      const toast = await this.toast.create({
        message: tags.length === 1 ? `TAG ${tags[0]} enviado.` : `${tags.length} TAGs enviados.`,
        duration: 3000,
        color: 'success',
        position: 'top',
      });
      await toast.present();
    } catch (err) {
      console.error('[ReintentoAutomatico] no se pudo mostrar el aviso:', err);
    }
  }
}
