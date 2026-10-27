import { OperacionEnCola } from '../models/operacion-zonificacion.model';
import { textoRango } from './filas-resumen.utils';

/*
 * Cómo se presenta un envío rechazado en la pantalla "Envíos rechazados": qué se
 * había intentado hacer y una etiqueta corta del motivo. El motivo completo, en
 * palabras, lo da mensajeZonificacion().
 */

const ETIQUETAS: Record<string, string> = {
  RANGO_CRUZADO: 'Cruce',
  RANGO_FUERA_DE_ZONA: 'Fuera de zona',
  RANGO_INVALIDO: 'Rango inválido',
  RANGO_NO_ENCONTRADO: 'No existe',
  ZONIFICACION_CONFIRMADA: 'Confirmada',
  ZONIFICACION_NO_CONFIRMADA: 'No confirmada',
  ZONIFICACION_VACIA: 'Sin rangos',
  TAGS_SIN_COBERTURA: 'TAG sin rango',
  TAG_CON_CAPTURAS: 'Con capturas',
  TAG_YA_ANULADO: 'Ya anulado',
  TAG_NO_EXISTE: 'TAG inexistente',
  AGENDA_NO_ASIGNADA: 'No asignada',
  AGENDA_FUERA_DE_VENTANA: 'Fuera de ventana',
  AGENDA_NO_OPERABLE: 'Agenda cerrada',
  AGENDA_NO_ENCONTRADA: 'Sin agenda',
  SIN_ACCESO: 'Sin acceso',
  SIN_PERMISO: 'Sin permiso',
  CANTIDAD_EXCESIVA: 'Cantidad alta',
  OPERACION_REUTILIZADA: 'Repetido',
};

export function etiquetaCortaRechazo(codigo: string | null | undefined): string {
  return (codigo && ETIQUETAS[codigo]) || 'Rechazado';
}

/*
 * Qué se había intentado hacer. Eliminar un rango solo guarda su id: si se
 * conoce su texto (porque el rango sigue en el último estado descargado) se
 * muestra; si no, queda genérico.
 */
export function tituloOperacion(op: Pick<OperacionEnCola, 'tipo' | 'datos'>, textoDelRangoEliminado: string | null = null): string {
  switch (op.tipo) {
    case 'GUARDAR_RANGO': {
      const rango = textoRango(Number(op.datos['tag_desde']), Number(op.datos['tag_hasta']));
      return `${op.datos['id_zonificacion_det'] ? 'Editar' : 'Guardar'} rango ${rango}`;
    }
    case 'ELIMINAR_RANGO':
      return textoDelRangoEliminado ? `Eliminar rango ${textoDelRangoEliminado}` : 'Eliminar un rango';
    case 'ANULAR_TAG':
      return `Anular TAG ${String(op.datos['numero_tag'])}`;
    case 'CONFIRMAR':
      return 'Confirmar la zonificación';
    case 'REABRIR':
      return 'Reabrir la zonificación';
  }
}
