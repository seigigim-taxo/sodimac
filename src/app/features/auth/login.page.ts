import { Component, inject, OnInit } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  FormGroup,
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
  private fb = inject(FormBuilder);
  private auth = inject(AuthFacade);
  private router = inject(Router);

  form: FormGroup;
  loading = this.auth.loading;
  error = this.auth.error;

  constructor() {
    addIcons({ alertCircleOutline });

    this.form = this.fb.group({
      rut: ['', [Validators.required, this.rutValidator]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });
  }

  private rutValidator = (control: AbstractControl): ValidationErrors | null => {
    const value = cleanRut(control.value ?? '');
    if (!value) {
      return null;
    }
    if (value.length < 7 || value.length > 9) {
      return { invalidRut: true };
    }
    return validateRut(value) ? null : { invalidRut: true };
  };

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
    this.form.controls['rut'].updateValueAndValidity();
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const rut = cleanRut(this.form.value.rut);
    const password = this.form.value.password;

    await this.auth.login({ rut, password });

    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/home']);
    }
  }

  get rutControl() {
    return this.form.get('rut');
  }

  get passwordControl() {
    return this.form.get('password');
  }
}
