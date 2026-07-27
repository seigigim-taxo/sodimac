import { Component, AfterViewInit, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonButton, IonIcon, IonInput } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { barcodeOutline } from 'ionicons/icons';

@Component({
  selector: 'app-scan',
  templateUrl: './scan.component.html',
  imports: [ReactiveFormsModule, IonIcon, IonInput, IonButton],
})
export class ScanComponent implements AfterViewInit {
  placeholder    = input('');
  confirmLabel   = input('Confirmar');
  scanType       = input<'tag' | 'sku'>('sku');
  idleMessage    = input('Escaneando tag para iniciar sesión de conteo');
  confirmedLabel = input('TAG');
  // false cuando la página dueña muestra su propio feedback (ej: conteo valida contra la muestra)
  showBanner     = input(true);
  // true cuando aún no se cumplen las condiciones previas (ej: falta TAG/zona) — input y botón quedan deshabilitados
  locked         = input(false);
  scan           = output<string>();
  scanInput    = viewChild<IonInput>('scanInput');

  private fb = inject(FormBuilder);
  form = this.fb.group({ code: ['', Validators.required] });

  private _tagConfirmed = signal(false);
  private _tagValue     = signal('');
  readonly tagConfirmed = this._tagConfirmed.asReadonly();
  readonly tagValue     = this._tagValue.asReadonly();

  constructor() {
    addIcons({ barcodeOutline });

    /*
     * No basta con [disabled]="locked()" en el template: al usar
     * formControlName en el mismo elemento, Angular reactive forms es
     * dueño del estado disabled y lo revierte en cada detección de
     * cambios. Hay que deshabilitar/habilitar el FormControl mismo.
     */
    effect(() => {
      const codeControl = this.form.get('code');
      if (this.locked()) {
        codeControl?.disable({ emitEvent: false });
      } else {
        codeControl?.enable({ emitEvent: false });
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.locked()) return;
    setTimeout(() => this.scanInput()?.setFocus(), 100);
  }

  onEnter(event: Event): void {
    event.preventDefault();
    if (this.locked()) return;
    if (this.scanType() === 'sku') {
      this.confirm();
    }
  }

  confirm(): void {
    if (this.locked()) return;
    const value = this.form.get('code')?.value?.trim().toUpperCase();
    if (!value) return;

    this._tagValue.set(value);
    this._tagConfirmed.set(true);
    this.scan.emit(value);

    if (this.scanType() === 'sku') {
      this.form.reset();
    }

    setTimeout(() => this.scanInput()?.setFocus(), 50);
  }
}
