import { Component, AfterViewInit, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { IonButton, IonIcon, IonInput } from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { barcodeOutline } from 'ionicons/icons';
import { stripEmojis } from '../../utils/text.utils';
import { DETECCION_CAPTURA_TOKEN } from '../../../domain/conteo/services/deteccion-captura.service';
import { MedioCaptura } from '../../../domain/conteo/models/medio-captura.model';

/* Lo que sale del escáner: el código y cómo llegó. */
export interface CodigoCapturado {
  codigo: string;
  medio:  MedioCaptura;
}

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
  /*
   * true cuando la página dueña continúa el flujo en otro campo (ej: el modo
   * "por cantidad" del conteo pide las unidades después de leer el SKU). El
   * código leído queda a la vista y el foco no vuelve acá solo: lo devuelve la
   * página llamando a limpiar() cuando terminó.
   */
  cederFoco      = input(false);
  scan           = output<CodigoCapturado>();
  scanInput    = viewChild<IonInput>('scanInput');

  private fb = inject(FormBuilder);
  private deteccion = inject(DETECCION_CAPTURA_TOKEN);
  form = this.fb.group({ code: ['', Validators.required] });

  /*
   * Instante de cada cambio del campo originado por el usuario. Es la única
   * señal que distingue la pistola del teclado: quién la interpreta es el
   * servicio de detección, acá solo se mide.
   */
  private marcas: number[] = [];

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

    /*
     * Normaliza el código mientras se tipea: sin emojis y todo en mayúscula.
     *
     * confirm() ya pasaba a mayúscula, pero recién al emitir: el operador
     * escribía en minúscula y veía en pantalla algo distinto de lo que iba a
     * quedar registrado. Haciéndolo acá, lo que ve es lo que se guarda.
     *
     * Solo se reescribe cuando cambió algo — reescribir en cada tecla mandaría
     * el cursor al final siempre, incluso al corregir en medio del código.
     */
    this.form.get('code')?.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => {
        if (typeof value !== 'string') return;

        /*
         * Se marca acá y no en un keydown porque este es el único punto por el
         * que pasa TODO cambio hecho por el usuario, incluidas las correcciones.
         * La renormalización de arriba usa emitEvent:false, así que no ensucia
         * la medición con marcas que el operador no produjo.
         *
         * Que borrar un carácter también deje marca es deseado: la pausa de una
         * corrección rompe la ráfaga y la lectura pasa a contar como manual.
         */
        if (value.length > 0) this.marcas.push(performance.now());
        else this.marcas = [];

        const normalizado = stripEmojis(value).toUpperCase();
        if (normalizado !== value) this.form.get('code')?.setValue(normalizado, { emitEvent: false });
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

    const medio = this.deteccion.clasificar(this.marcas);

    this._tagValue.set(value);
    this._tagConfirmed.set(true);
    this.scan.emit({ codigo: value, medio });

    // El flujo sigue en otro campo: ni se borra el código ni se recupera el foco.
    // Las marcas sí se sueltan: ya se consumieron y la próxima lectura empieza limpia.
    this.marcas = [];
    if (this.cederFoco()) return;

    if (this.scanType() === 'sku') {
      this.form.reset();
    }

    setTimeout(() => this.scanInput()?.setFocus(), 50);
  }

  /*
   * Deja el campo listo para la próxima lectura. La usa la página dueña cuando
   * trabaja con cederFoco: es ella la que sabe cuándo se cerró el ciclo.
   */
  limpiar(): void {
    this.form.reset();
    this.marcas = [];
    setTimeout(() => this.scanInput()?.setFocus(), 50);
  }
}
