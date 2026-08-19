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
import { cleanRut, formatRut, validateRut } from '../../shared/utils/rut.utils';

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
      this.router.navigate(['/home']);
    }
  }

  onRutInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const raw = input.value.replace(/[^0-9kK]/g, '');
    const formatted = formatRut(raw);
    this.form.patchValue({ rut: formatted }, { emitEvent: false });
    this.form.controls['rut'].updateValueAndValidity({ emitEvent: false });
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const rut      = cleanRut(this.form.value.rut ?? '');
    const password = this.form.value.password ?? '';
    await this.auth.login({ rut, password });
    if (this.auth.isAuthenticated()) {
      /*
       * Antes de navegar: si este operador dejó un TAG abierto en esta PDA, los
       * guards de /home lo van a mandar derecho a /counting, y esa pantalla
       * necesita el evento y el TAG en memoria. Restaurarlo después sería tarde.
       */
      const operadorId = this.auth.session()?.operadorId;
      const pdaId      = this.pda.pdaId();
      if (operadorId && pdaId) {
        await this.sesionTrabajo.restaurar(operadorId, pdaId);
      }

      // Offline: la sesión y los datos mock ya quedaron listos en el login mismo —
      // no hay nada que "descargar", así que la barra de sincronización sobra.
      const destino = this.auth.wasOfflineLogin() ? '/home' : '/sync-loading';
      this.router.navigate([destino]);
    }
  }

  get rutControl()      { return this.form.get('rut'); }
  get passwordControl() { return this.form.get('password'); }
}
