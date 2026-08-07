import { LineaMuestraParaGuardar } from '../repositories/muestra-detalle.repository';
import { Evento } from '../../evento/models/evento.model';

/*
 * El resultado del análisis del SGO sobre una ronda terminada.
 *
 * Es SOLO datos: quien lo produce (mock hoy, HTTP mañana) no escribe en base.
 * Materializar el evento, la muestra y la ronda es trabajo de
 * AbrirSiguienteIteracionUseCase, para que cambiar el origen del dato no
 * arrastre la persistencia detrás.
 *
 * `fechaProgramada` y `estado` son los que trae el análisis: con ellos se crea
 * un REGISTRO NUEVO de evento, y la muestra acotada queda colgando de ese
 * evento nuevo en vez de pisar la de la ronda anterior.
 */
export interface AnalisisIteracion {
  /* Número de la ronda que el SGO manda a recontar. */
  iteracion: number;

  /* Del evento nuevo. La fecha puede repetir la de la ronda anterior. */
  fechaProgramada: string;
  estado: Evento['estado'];

  /* Identidad de la muestra en el backend. Null mientras el mock la simule. */
  codigoMuestra: string | null;
  nombreMuestra: string | null;

  /*
   * La muestra acotada. Vacía = no hay nada que recontar; el llamador decide
   * si igual abre la ronda o cierra el ciclo.
   */
  skusARecontar: LineaMuestraParaGuardar[];
}
