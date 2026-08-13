import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { IonIcon, IonInput, IonSpinner } from '@ionic/angular/standalone';
import { Subject, debounceTime, distinctUntilChanged, from, of, switchMap, tap } from 'rxjs';
import { addIcons } from 'ionicons';
import { searchOutline } from 'ionicons/icons';
import { EventoFacade } from '../../../state/evento/evento.facade';
import { BuscarSkuUseCase } from '../../../application/conteo/buscar-sku.use-case';
import { BusquedaSkuResultado } from '../../../domain/conteo/models/busqueda-sku.model';

/*
 * Buscador SKU → TAG. Responde "¿dónde se contó este SKU?" para el evento
 * seleccionado, y un mismo SKU puede aparecer en varios TAG.
 *
 * Se abre desde la barra de navegación (NavbarComponent), no desde cada
 * pantalla: tiene que estar disponible en TODAS las etapas del proceso —elegir
 * TAG, contar, revisar el avance— y la barra es el único punto que las alcanza
 * todas.
 *
 * No expone cantidades esperadas — muestra lo efectivamente contado, que es un
 * hecho ya registrado, no la expectativa del sistema. No rompe el conteo a ciegas.
 */

/* Espera estándar de buscador: suficiente para no consultar por cada tecla. */
const DEBOUNCE_MS = 300;

/*
 * Con un solo carácter el prefijo devuelve casi todo el inventario, y ninguna
 * de esas filas ayuda a decidir dónde ir a contar.
 */
const MINIMO_CARACTERES = 2;

@Component({
  selector: 'app-buscador-sku',
  templateUrl: './buscador-sku.component.html',
  imports: [IonIcon, IonInput, IonSpinner],
})
export class BuscadorSkuComponent {
  private eventoFacade = inject(EventoFacade);
  private buscarSkuUC  = inject(BuscarSkuUseCase);

  private termino$ = new Subject<string>();

  valor       = signal('');
  buscando    = signal(false);
  resultados  = signal<BusquedaSkuResultado[]>([]);
  /* Solo tras una búsqueda real: evita decir "sin resultados" antes de buscar. */
  hayBusqueda = signal(false);

  // Sin evento seleccionado no hay dónde buscar: se muestra la razón en vez de
  // un formulario que no haría nada al apretarlo.
  hayEvento = computed(() => this.eventoFacade.selectedEvent() !== null);

  terminoCorto = computed(
    () => this.valor().trim().length > 0 && this.valor().trim().length < MINIMO_CARACTERES
  );

  sinResultados = computed(
    () => this.hayBusqueda() && !this.buscando() && this.resultados().length === 0
  );

  constructor() {
    addIcons({ searchOutline });

    /*
     * switchMap y no mergeMap: al escribir rápido se encadenan consultas, y sin
     * descartar las anteriores la más lenta puede llegar última y pisar los
     * resultados del término que el operador ya terminó de escribir.
     */
    this.termino$
      .pipe(
        debounceTime(DEBOUNCE_MS),
        distinctUntilChanged(),
        tap(() => this.buscando.set(true)),
        switchMap((termino) => {
          const evento = this.eventoFacade.selectedEvent();
          if (!evento || termino.length < MINIMO_CARACTERES) return of([]);
          return from(this.buscarSkuUC.execute(evento.id, termino));
        }),
        takeUntilDestroyed()
      )
      .subscribe({
        next: (resultados) => {
          this.resultados.set(resultados);
          this.buscando.set(false);
          this.hayBusqueda.set(this.valor().trim().length >= MINIMO_CARACTERES);
        },
        error: () => {
          this.resultados.set([]);
          this.buscando.set(false);
        },
      });
  }

  onInput(event: Event): void {
    const valor = (event as CustomEvent<{ value: string | null }>).detail.value ?? '';
    this.valor.set(valor);

    const termino = valor.trim().toUpperCase();
    if (termino.length < MINIMO_CARACTERES) {
      /* Borrar el campo limpia la lista en el acto, sin esperar al debounce. */
      this.resultados.set([]);
      this.hayBusqueda.set(false);
      this.buscando.set(false);
    }
    this.termino$.next(termino);
  }

  limpiar(): void {
    this.valor.set('');
    this.resultados.set([]);
    this.hayBusqueda.set(false);
    this.termino$.next('');
  }

  /* "A3 (Pasillo herramientas)" o solo "A3" si la zona no tiene descripción. */
  zonaTexto(r: BusquedaSkuResultado): string {
    return r.zonaNombre ? `${r.zonaCodigo} (${r.zonaNombre})` : r.zonaCodigo;
  }
}
