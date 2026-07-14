import { Component, inject, input, output, signal, viewChild, AfterViewInit } from '@angular/core';
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
  placeholder = input('');
  confirmLabel = input('Confirmar');
  scanType = input<'tag' | 'sku'>('sku');
  scan = output<string>();
  scanInput = viewChild<IonInput>('scanInput');

  private fb = inject(FormBuilder);
  form = this.fb.group({ code: ['', Validators.required] });

  tagConfirmed = signal(false);
  tagValue = signal('');

  constructor() {
    addIcons({ barcodeOutline });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.scanInput()?.setFocus(), 100);
  }

  onEnter(): void {
    this.confirm();
  }

  confirm(): void {
    const value = this.form.get('code')?.value?.trim().toUpperCase();
    if (!value) return;

    this.tagValue.set(value);
    this.tagConfirmed.set(true);
    this.scan.emit(value);

    if (this.scanType() === 'sku') {
      this.form.reset();
    }

    setTimeout(() => this.scanInput()?.setFocus(), 50);
  }
}
