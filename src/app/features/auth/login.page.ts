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
  ViewWillEnter,
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { alertCircleOutline } from 'ionicons/icons';
import { AuthFacade } from '../../state/auth/auth.facade';
<<<<<<< HEAD
import { cleanRut, formatRut, validateRut } from '../../domain/auth/utils/rut.utils';
=======
import { cleanRut, formatRut, validateRut } from '../../shared/utils/rut.utils';
>>>>>>> feat/modo-analista-maqueta
import { environment } from '../../../environments/environment';

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
<<<<<<< HEAD
export class LoginPage implements ViewWillEnter {
  private fb = inject(FormBuilder);
  private auth = inject(AuthFacade);
=======
export class LoginPage implements OnInit {
  private fb     = inject(FormBuilder);
  private auth   = inject(AuthFacade);
>>>>>>> feat/modo-analista-maqueta
  private router = inject(Router);

  loading = this.auth.loading;
<<<<<<< HEAD
  error = this.auth.error;
  environment = environment;

  constructor() {
    addIcons({ alertCircleOutline });

    this.form = this.fb.group({
      rut: ['', [Validators.required, this.rutValidator]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }
=======
  error   = this.auth.error;
>>>>>>> feat/modo-analista-maqueta

  private rutValidator = (control: AbstractControl): ValidationErrors | null => {
    const value = cleanRut(control.value ?? '');
    if (!value) return null;
    if (value.length < 7 || value.length > 9) return { invalidRut: true };
    return validateRut(value) ? null : { invalidRut: true };
  };

<<<<<<< HEAD
  ionViewWillEnter(): void {
=======
  form = this.fb.group({
    rut:      ['', [Validators.required, this.rutValidator]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  constructor() {
    addIcons({ alertCircleOutline });
  }

  ngOnInit(): void {
>>>>>>> feat/modo-analista-maqueta
    if (this.auth.isAuthenticated()) {
      if (!this.auth.hasKnownProfile()) {
        this.router.navigate(['/sync-loading']);
      } else if (this.auth.isAnalyst()) {
        this.router.navigate(['/analyst-dashboard']);
      } else {
        this.router.navigate(['/home']);
      }
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
    if (this.loading()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const rut      = cleanRut(this.form.value.rut ?? '');
    const password = this.form.value.password ?? '';
    await this.auth.login({ rut, password });
    if (this.auth.isAuthenticated()) {
      if (environment.alwaysSyncAfterLogin || !this.auth.wasOfflineLogin()) {
        this.router.navigate(['/sync-loading']);
      } else if (!this.auth.hasKnownProfile()) {
        this.router.navigate(['/sync-loading']);
      } else if (this.auth.isAnalyst()) {
        this.router.navigate(['/analyst-dashboard']);
      } else {
        this.router.navigate(['/home']);
      }
    }
  }

  get rutControl()      { return this.form.get('rut'); }
  get passwordControl() { return this.form.get('password'); }
}
