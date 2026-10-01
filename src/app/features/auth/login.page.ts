import { Component, inject, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonSpinner,
  ToastController,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline } from 'ionicons/icons';
import { AuthFacade } from '../../state/auth/auth.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { SesionTrabajoFacade } from '../../state/sesion-trabajo/sesion-trabajo.facade';
import { SucursalFacade } from '../../state/sucursal/sucursal.facade';
import { EventoFacade } from '../../state/evento/evento.facade';
import { ConteoFacade } from '../../state/conteo/conteo.facade';
import { pararseEnAsignacion, pararseEnSucursal } from '../../state/asignacion/pararse-en-asignacion.util';
import { ActualizarMuestraUseCase } from '../../application/asignacion/actualizar-muestra.use-case';
import { VigenciaDiaService } from '../../shared/services/vigencia-dia.service';
import { NetworkService } from '../../shared/services/network.service';
import { cleanRut, formatRut, validateRut } from '../../shared/utils/rut.utils';
import { APP_VERSION } from '../../core/version';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    IonButton,
    IonContent,
    IonIcon,
    IonInput,
    IonSpinner,
  ],
})
export class LoginPage implements OnInit {
  private fb     = inject(FormBuilder);
  private auth   = inject(AuthFacade);
  private router = inject(Router);
  private pda              = inject(PdaFacade);
  private sesionTrabajo    = inject(SesionTrabajoFacade);
  private sucursalFacade   = inject(SucursalFacade);
  private eventoFacade     = inject(EventoFacade);
  private conteo           = inject(ConteoFacade);
  private actualizarMuestraUC = inject(ActualizarMuestraUseCase);
  private vigencia         = inject(VigenciaDiaService);
  private network          = inject(NetworkService);
  private toastController  = inject(ToastController);

  version = APP_VERSION;
  loading = this.auth.loading;
  error   = this.auth.error;

  private rutValidator = (control: AbstractControl): ValidationErrors | null => {
    const value = cleanRut(control.value ?? '');
    if (!value) return null;
    if (value.length < 7 || value.length > 9) return { invalidRut: true };
    return validateRut(value) ? null : { invalidRut: true };
  };

  form = this.fb.group({
    rut:      ['', [Validators.required, this.rutValidator]],
    /*
     * La contraseña son los primeros 6 dígitos del RUT: ni menos ni más.
     * maxLength va junto al maxlength del input y no en su lugar — el atributo
     * HTML es el freno que el operador siente al escribir, pero se puede
     * saltear pegando texto; el validador del formulario es el que de verdad
     * lo garantiza.
     */
    password: ['', [Validators.required, Validators.minLength(6), Validators.maxLength(6)]],
  });

  constructor() {
    addIcons({ alertCircleOutline });
  }

  ngOnInit(): void {
    if (this.auth.isAuthenticated()) {
      void this.entrar();
    }
  }

  /*
   * Único punto de decisión de a dónde entra el operador.
   *
   * Antes se iba derecho a /home si el perfil ya era conocido, y ahí estaba el
   * problema: la app consultaba SQLite, veía que el operador existía y lo
   * dejaba pasar sin preguntar si esos datos seguían siendo válidos. Se quedaba
   * trabajando sobre el evento de ayer.
   *
   * Ahora, si los datos no son del día en curso, pasa por la descarga aunque
   * ya esté autenticado.
   */
  private async entrar(): Promise<void> {
    if (!this.auth.hasKnownProfile() || await this.vigencia.necesitaSincronizar()) {
      this.router.navigate(['/sync-loading']);
      return;
    }

    /*
     * El login cache-first (ver LoginUseCase) no vuelve a preguntarle nada al
     * backend cuando el perfil ya es conocido y los datos son de hoy — por
     * diseño, para seguir funcionando sin señal. El costo: un operador
     * reasignado a otra tienda el mismo día entraba igual, con los datos de
     * la tienda vieja, sin que nada se lo avisara.
     *
     * Con señal, alcanza con la misma consulta que ya usa "Actualizar
     * maestra" del menú — pero sin su spinner ni su diálogo, que mostrados en
     * cada apertura de la app serían ruido para el operador que nunca cambia
     * de tienda. Si falla (se corta la red a mitad de camino), no bloquea el
     * login: sigue exactamente como hoy.
     */
    if (this.auth.isOperator() && this.network.isOnline()) {
      try {
        await this.revisarCambioDeTienda();
      } catch (err) {
        console.error('[LoginPage] no se pudo revisar cambio de tienda:', err);
      }
    }

    this.router.navigate([this.auth.isAnalyst() ? '/analyst-dashboard' : '/home']);
  }

  /*
   * Sin evento elegido (recién entrando, nada seleccionado todavía):
   * ActualizarMuestraUseCase evalúa la ventana completa (hoy y mañana) y
   * devuelve VENTANA con un resultado por jornada. Si alguna es NUEVO, ya
   * quedó persistida — solo falta pararse ahí, igual que hace el menú.
   */
  private async revisarCambioDeTienda(): Promise<void> {
    const session = this.auth.session();
    if (!session) return;

    const resultado = await this.actualizarMuestraUC.execute(session, null);
    if (resultado.estado !== 'VENTANA') return;

    const conNovedad = resultado.resultados.find((r) => r.resultado.tipo === 'NUEVO');
    if (conNovedad && conNovedad.resultado.tipo === 'NUEVO') {
      await pararseEnAsignacion(conNovedad.resultado.asignacion, this.sucursalFacade, this.eventoFacade, session.operadorId);
      if (this.conteo.enCurso()) this.conteo.reset();
      await this.mostrarToast(`Ahora estás trabajando con: ${conNovedad.resultado.asignacion.nombre}`);
      return;
    }

    /*
     * Sin jornada nueva, la tienda puede haber cambiado igual: el SGO
     * reasigna la tienda y arma la jornada en pasos separados (ver
     * ActualizarTiendaOperadorUseCase). Sin este chequeo, un operador
     * reasignado el mismo día sin jornada todavía armada entraba con la
     * tienda vieja sin ningún aviso.
     */
    const tiendaVigente = resultado.tiendaVigente;
    const actual = this.sucursalFacade.currentStore();
    if (!tiendaVigente || (actual && actual.id === tiendaVigente.sucursalId)) return;

    await pararseEnSucursal(tiendaVigente.sucursalId, this.sucursalFacade, this.eventoFacade, session.operadorId);
    if (this.conteo.enCurso()) this.conteo.reset();
    await this.mostrarToast(`Ahora estás trabajando en: ${tiendaVigente.nombreTienda}`);
  }

  private async mostrarToast(message: string): Promise<void> {
    const toast = await this.toastController.create({
      message,
      duration: 2500,
      color: 'success',
      position: 'top',
    });
    await toast.present();
  }

  onRutInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9kK]/g, '');
    const formatted = formatRut(raw);
    this.form.patchValue({ rut: formatted }, { emitEvent: false });
    this.form.controls['rut'].updateValueAndValidity({ emitEvent: false });
  }

  async onSubmit(): Promise<void> {
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const rut      = cleanRut(this.form.value.rut ?? '');
    const password = this.form.value.password ?? '';
    await this.auth.login({ rut, password });
    if (this.auth.isAuthenticated()) {
      const operadorId = this.auth.session()?.operadorId;
      const pdaId      = this.pda.pdaId();
      if (operadorId && pdaId) {
        await this.sesionTrabajo.restaurar(operadorId, pdaId);
      }

      /*
       * El login online siempre sincroniza. El offline es el que necesita la
       * comprobación: sin red no se pudo bajar nada, así que hay que mirar si
       * lo guardado sigue siendo del día.
       */
      if (this.auth.wasOfflineLogin()) {
        await this.entrar();
      } else {
        this.router.navigate(['/sync-loading']);
      }
    }
  }

  get rutControl()      { return this.form.get('rut'); }
  get passwordControl() { return this.form.get('password'); }
}
