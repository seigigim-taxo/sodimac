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
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline } from 'ionicons/icons';
import { AuthFacade } from '../../state/auth/auth.facade';
import { PdaFacade } from '../../state/pda/pda.facade';
import { SesionTrabajoFacade } from '../../state/sesion-trabajo/sesion-trabajo.facade';
import { VigenciaDiaService } from '../../shared/services/vigencia-dia.service';
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
  private pda           = inject(PdaFacade);
  private sesionTrabajo = inject(SesionTrabajoFacade);
  private vigencia      = inject(VigenciaDiaService);

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
    password: ['', [Validators.required, Validators.minLength(6)]],
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
    this.router.navigate([this.auth.isAnalyst() ? '/analyst-dashboard' : '/home']);
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
