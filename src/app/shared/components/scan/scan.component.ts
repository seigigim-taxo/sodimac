import { Component, HostListener, inject, input, output, signal, viewChild, AfterViewInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonButton, IonIcon, IonInput } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { barcodeOutline } from 'ionicons/icons';
import { Keyboard } from '@capacitor/keyboard';

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
  tagReset = output<void>();
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

  @HostListener('document:keydown.enter', ['$event'])
  async onDocumentEnter(event: KeyboardEvent): Promise<void> {
    if (this.scanType() !== 'sku' || this.tagConfirmed()) return;
    const inputEl = await this.scanInput()?.getInputElement();
    if (!inputEl || !inputEl.contains(document.activeElement)) return;
    event.preventDefault();
    this.confirm();
  }

  async onInputFocus(): Promise<void> {
    if (this.scanType() === 'sku') {
      await Keyboard.hide();
    }
  }


  confirm(): void {
    const value = this.form.get('code')?.value?.trim().toUpperCase();
    if (!value) return;

    if (this.scanType() === 'tag') {
      this.tagValue.set(value);
      this.tagConfirmed.set(true);
    }

    this.scan.emit(value);
    this.form.reset();

    setTimeout(() => this.scanInput()?.setFocus(), 50);
  }

  onChangeTag(): void {
    this.tagConfirmed.set(false);
    this.tagValue.set('');
    this.form.reset();
    this.tagReset.emit();
    setTimeout(() => this.scanInput()?.setFocus(), 100);
  }
}
