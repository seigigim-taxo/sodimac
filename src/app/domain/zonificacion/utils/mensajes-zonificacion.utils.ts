import { CodigoErrorZonificacion } from '../models/error-zonificacion.model';

/*
 * Lo que se le dice al operador por cada motivo de rechazo. Una sola redacción
 * por código, venga el rechazo de las reglas de la app o del servidor: ambos usan
 * los mismos códigos y los mismos campos `data` (contrato v1).
 *
 * Los motivos "locales" (MotivoLocal) son los que la app decide sola, antes de
 * preguntarle al servidor.
 */
export type MotivoLocal = 'SIN_SESION' | 'SIN_CATALOGO' | 'SIN_ESTADO' | 'AGENDA_SOLO_LECTURA' | 'RANGO_EN_ENVIO';

type Datos = Record<string, unknown>;

const num = (v: unknown): string => (typeof v === 'number' || typeof v === 'string' ? String(v) : '?');

const FIJOS: Record<string, string> = {
  // 400
  PETICION_INVALIDA: 'Falta un dato o no es válido. Revísalo e intenta de nuevo.',
  TIPO_OPERACION_INVALIDO: 'La acción no se reconoce. Avisa a soporte.',
  ZONA_INVALIDA: 'La zona elegida no existe.',
  RANGO_INVALIDO: 'El último TAG no puede ser menor que el primero.',
  // 403
  SIN_ACCESO: 'No tienes acceso a la tienda de esta agenda.',
  SIN_PERMISO: 'No tienes permiso para hacer esto.',
  AGENDA_NO_ASIGNADA: 'Esta agenda ya no está asignada a ti.',
  // 404
  AGENDA_NO_ENCONTRADA: 'La agenda ya no existe.',
  RANGO_NO_ENCONTRADO: 'El rango ya no existe: alguien más pudo eliminarlo.',
  // 409
  AGENDA_FUERA_DE_VENTANA: 'Esta agenda ya no está en tu ventana de zonificación (hoy y la siguiente jornada).',
  ZONIFICACION_CONFIRMADA: 'La zonificación está confirmada. Reábrela para editarla.',
  ZONA_SIN_TIPO: 'La zona no tiene tipo de ubicación configurado. Avisa a soporte.',
  TAG_YA_ANULADO: 'Ese TAG ya está anulado.',
  OPERACION_REUTILIZADA: 'Esta acción ya se había enviado con otro contenido. Vuelve a hacerla.',
  ZONIFICACION_NO_CONFIRMADA: 'La zonificación no está confirmada, no hay nada que reabrir.',
  ZONIFICACION_VACIA: 'Debes registrar al menos un rango antes de confirmar.',
  // 5xx
  ZONIFICACION_OCUPADA: 'Otra PDA está zonificando esta agenda. Se reintentará solo.',
  ERROR_INTERNO: 'El servidor tuvo un problema. Se reintentará solo.',
  // locales
  SIN_SESION: 'No hay una sesión activa.',
  SIN_CATALOGO: 'Faltan las zonas. Conéctate a la red al menos una vez para descargarlas.',
  SIN_ESTADO: 'Esta agenda aún no se descargó. Ábrela con conexión al menos una vez.',
  AGENDA_SOLO_LECTURA: 'No puedes modificar esta agenda.',
  RANGO_EN_ENVIO: 'El rango se está enviando. Intenta de nuevo en un momento.',
};

export function mensajeZonificacion(codigo: CodigoErrorZonificacion | MotivoLocal | string, data: Datos = {}): string {
  switch (codigo) {
    case 'AGENDA_NO_OPERABLE':
      return data['codigo_estado'] === 'SUSPENDIDA' ? 'La agenda está suspendida.' : 'La agenda está cerrada.';
    case 'RANGO_FUERA_DE_ZONA': {
      const cual = data['campo'] === 'tag_hasta' ? 'final' : 'inicial';
      return `El TAG ${cual} queda fuera de la zona: debe estar entre ${num(data['permitido_desde'])} y ${num(data['permitido_hasta'])}.`;
    }
    case 'RANGO_CRUZADO': {
      const con = (data['con'] ?? {}) as Datos;
      return `El rango se cruza con otro (${num(con['tag_desde'])}–${num(con['tag_hasta'])}).`;
    }
    case 'CANTIDAD_EXCESIVA':
      return `El rango tiene ${num(data['cantidad'])} TAG y el máximo es ${num(data['maximo'])}.`;
    case 'REFERENCIA_LARGA':
      return `La referencia es muy larga: máximo ${num(data['maximo'])} caracteres.`;
    case 'MOTIVO_CORTO':
      return `El motivo debe tener al menos ${num(data['minimo'])} caracteres.`;
    case 'TAG_NO_EXISTE':
      return `El TAG ${num(data['numero_tag'])} no pertenece a ningún rango de esta agenda.`;
    case 'TAG_CON_CAPTURAS':
      return `El TAG ${num(data['numero_tag'])} ya tiene capturas en el conteo, no se puede anular.`;
    case 'TAGS_SIN_COBERTURA': {
      const ejemplos = Array.isArray(data['ejemplos']) ? (data['ejemplos'] as unknown[]).map(num).join(', ') : '';
      return `Hay ${num(data['total'])} TAG usados sin rango${ejemplos ? `: ${ejemplos}` : ''}. Agrega rangos que los cubran.`;
    }
    default:
      return FIJOS[codigo] ?? 'No se pudo completar la acción.';
  }
}
