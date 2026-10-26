import { EstadoAgenda } from '../models/estado-agenda.model';
import { VistaZonificacion } from '../models/vista-zonificacion.model';
import { mensajeZonificacion } from './mensajes-zonificacion.utils';

/*
 * Qué se le dice al operador cuando toca "Confirmar" o "Reabrir", antes de pedir
 * nada al servidor. Son las mismas respuestas del SGO: un diálogo para confirmar,
 * otro cuando hay que esperar o corregir algo, y un aviso si no hay rangos.
 */

export type DecisionConfirmar =
  /* Todo en orden: se pide confirmar con este texto. */
  | { tipo: 'CONFIRMAR'; titulo: string; texto: string }
  /* No se puede ahora: se explica en un diálogo y no se manda nada. */
  | { tipo: 'BLOQUEO'; titulo: string; texto: string }
  /* Falta lo básico (rangos): se avisa en el resumen, sin diálogo. */
  | { tipo: 'ERROR'; texto: string };

const plural = (n: number, uno: string, varios: string): string => `${n} ${n === 1 ? uno : varios}`;

export function decidirConfirmacion(vista: VistaZonificacion, estado: EstadoAgenda | null): DecisionConfirmar {
  const tags = vista.rangos.reduce((suma, r) => suma + r.cantidad, 0);

  // Confirmar sale al final de la cola de la agenda: si queda algo sin enviar, se espera a que salga
  // para que el servidor confirme sobre los rangos ya aplicados y no sobre un estado viejo.
  if (vista.pendientes.length > 0) {
    return {
      tipo: 'BLOQUEO',
      titulo: 'Hay envíos pendientes',
      texto: `Espera a que se envíen ${plural(vista.pendientes.length, 'cambio', 'cambios')} para poder confirmar.`,
    };
  }
  if (vista.rangos.length === 0 || tags <= 0) {
    return { tipo: 'ERROR', texto: mensajeZonificacion('ZONIFICACION_VACIA') };
  }
  const fuera = estado?.tagsFuera;
  if (fuera && fuera.total > 0) {
    return { tipo: 'BLOQUEO', titulo: 'No se puede confirmar', texto: mensajeZonificacion('TAGS_SIN_COBERTURA', { total: fuera.total, ejemplos: fuera.ejemplos }) };
  }
  return {
    tipo: 'CONFIRMAR',
    titulo: 'Confirmar zonificación',
    texto: `${tags} TAG en ${plural(vista.rangos.length, 'rango', 'rangos')}. Se validarán los TAG ya utilizados. Después no podrás editar rangos, salvo que la reabras.`,
  };
}

/* El aviso tras confirmar. */
export function avisoConfirmada(vista: VistaZonificacion, tagsUsados: number): string {
  const tags = vista.rangos.reduce((suma, r) => suma + r.cantidad, 0);
  const base = `Zonificación confirmada: ${plural(vista.rangos.length, 'rango', 'rangos')}, ${tags} TAG instalados.`;
  return tagsUsados > 0 ? `${base} Se validarán los ${tagsUsados} TAG ya utilizados en el conteo.` : base;
}

/* El diálogo de "Reabrir". */
export function textoReabrir(tagsUsados: number): string {
  return tagsUsados > 0
    ? '¿Reabrir para modificar sus rangos? El conteo ya tiene TAG utilizados; al confirmar de nuevo se validará que todos queden dentro de un rango.'
    : '¿Reabrir para modificar sus rangos?';
}

/* El aviso tras reabrir. */
export function avisoReabierta(tagsUsados: number): string {
  return tagsUsados > 0
    ? 'Zonificación reabierta. El conteo ya tiene TAG utilizados; al confirmar se validará que todos queden dentro de un rango.'
    : 'La zonificación volvió a borrador.';
}
